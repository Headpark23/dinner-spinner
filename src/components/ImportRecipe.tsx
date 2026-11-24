import React, { useRef, useState } from 'react';
import { shrinkImage } from '../utils/shrinkImage';
import { Camera, FileText, Image as ImageIcon, Link2, LoaderCircle, ClipboardPaste, Sparkles } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { textFromDocument, textFromLegacyDoc, previewFromPages } from '../utils/docText';
import { extractRecipeFromHtml, parseRecipeText, recipeFromJsonLd, type ImportedRecipe } from '../utils/recipeImport';
import { Button, TextInput, cx } from './ui';

type Way = 'link' | 'photo' | 'file' | 'text' | 'describe';

const WAYS: { id: Way; label: string; hint: string; icon: React.ReactNode }[] = [
  { id: 'link', label: 'Web link', hint: 'From a recipe site', icon: <Link2 className="h-5 w-5" /> },
  { id: 'photo', label: 'Photo', hint: 'Book, card or screen', icon: <Camera className="h-5 w-5" /> },
  { id: 'file', label: 'PDF or file', hint: 'PDF, Word, text, saved page', icon: <FileText className="h-5 w-5" /> },
  { id: 'describe', label: 'Describe it', hint: 'Name a dish, we draft it', icon: <Sparkles className="h-5 w-5" /> },
  { id: 'text', label: 'Paste text', hint: 'From notes or a message', icon: <ClipboardPaste className="h-5 w-5" /> },
];

const readAsDataUrl = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Couldn’t read that file.'));
    r.readAsDataURL(file);
  });

const readAsText = (file: File) =>
  new Promise<string>((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(new Error('Couldn’t read that file.'));
    r.readAsText(file);
  });


/**
 * Several ways to bring in a recipe you already have. Whatever the way, the result is a draft the person
 * checks over and saves (it never saves silently), because scanned and pasted recipes are rarely perfect.
 */
export const ImportRecipe: React.FC<{ onDraft: (recipe: ImportedRecipe, note: string) => void }> = ({ onDraft }) => {
  const { aiEnabled, authHeaders } = useDinner();
  const [way, setWay] = useState<Way>('link');
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');
  const [describe, setDescribe] = useState('');
  const [busy, setBusy] = useState(false);
  const [attempt, setAttempt] = useState(1);
  const [error, setError] = useState('');
  const cameraRef = useRef<HTMLInputElement | null>(null);
  const libraryRef = useRef<HTMLInputElement | null>(null);
  const fileRef = useRef<HTMLInputElement | null>(null);

  const fail = (message: string) => setError(message);

  const fromLink = async () => {
    setError('');
    setBusy(true);
    try {
      const res = await fetch('/api/recipes/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: url.trim() }),
      });
      const json = await res.json().catch(() => ({}));
      if (res.ok && json.recipe) return onDraft(json.recipe, 'Got it from the website. Check it over, then save.');
      if (res.status === 422 && typeof json.text === 'string') {
        return onDraft(parseRecipeText(json.text), 'That page has no tidy recipe data, so this is a rough draft from its text. Check it over.');
      }
      fail(String(json.error || 'Couldn’t read that link. Paste the recipe text instead.'));
    } catch {
      fail('Couldn’t reach the app. Check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  /** Ask the reader (Gemini). If it is busy, wait a few seconds and ask again, up to three goes in all. */
  const runAi = async (payload: Record<string, unknown>, note: string) => {
    let res!: Response;
    let json: any = {};
    for (let n = 1; n <= 3; n++) {
      setAttempt(n);
      res = await fetch('/api/pantry/analyze', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...authHeaders() },
        body: JSON.stringify(payload),
      });
      json = await res.json().catch(() => ({}));
      if (!(res.status === 503 && json.busy) || n === 3) break;
      await new Promise((r) => setTimeout(r, 4000));
    }
    if (!res.ok || !json.meal) {
      return fail(
        res.status === 413
          ? 'That is too big to send. Try a smaller file, or paste the text.'
          : res.status === 503 && json.busy
          ? String(json.error)
          : res.status === 503
          ? 'Reading photos, PDFs and writing recipes isn’t switched on yet. A web link or pasted text works now.'
          : res.status === 401
            ? 'Start a family group first, because reading photos and PDFs and writing recipes is for groups. A web link, pasted text or typing it in works without one.'
            : String(json.error || 'Couldn’t do that. Try again, or paste the text.')
      );
    }
    onDraft(
      {
        title: json.meal.title || 'New recipe',
        description: json.meal.description || '',
        cuisine: json.meal.cuisine || 'Other',
        timeStake: json.meal.timeStake || '30m',
        effort: json.meal.effort || 'standard',
        ingredients: json.meal.ingredients || [],
        prepSteps: json.meal.prepSteps || [],
        tags: json.meal.tags || ['AI drafted'],
      },
      note
    );
  };

  const describeDish = async () => {
    setError('');
    setBusy(true);
    try {
      await runAi({ type: 'recipe-text', textPrompt: describe.trim() }, 'Drafted from your description. Check it over, then save.');
    } catch (e: any) {
      fail(e?.message || 'Couldn’t write that recipe. Try again.');
    } finally {
      setBusy(false);
    }
  };

  const scan = async (file: File) => {
    setError('');
    // The host rejects requests over about 4.5MB, and base64 adds a third, so a PDF has to be under ~3MB.
    const isImg = file.type.startsWith('image/');
    if (!isImg && file.size > 3_000_000) {
      return fail('That PDF is too big to send (over 3MB). Export a smaller or single-page copy, take a photo of the page, or paste the text.');
    }
    if (file.size > 40_000_000) return fail('That file is too big. Try a smaller photo, or paste the text.');
    setBusy(true);
    try {
      let dataUrl = await readAsDataUrl(file);
      let sendType = file.type || 'image/jpeg';
      if (isImg && file.size > 1_500_000) {
        // Phone photos are huge; shrink them so they upload quickly and fit the limit. Text stays readable at 1800px.
        const small = await shrinkImage(dataUrl);
        if (small) {
          dataUrl = small;
          sendType = 'image/jpeg';
        }
      }
      await runAi({ type: 'recipe-photo', imageBase64: dataUrl, mimeType: sendType }, 'Read from your file. Check it over, then save.');
    } catch (e: any) {
      fail(e?.message || 'Couldn’t read that file.');
    } finally {
      setBusy(false);
    }
  };

  const fromFile = async (file: File) => {
    setError('');
    const name = file.name.toLowerCase();
    const isImage = file.type.startsWith('image/');
    const isPdf = file.type === 'application/pdf' || name.endsWith('.pdf');
    if (isImage || isPdf) return scan(file);
    if (/\.(docx|odt)$/.test(name)) {
      try {
        const doc = await textFromDocument(new Uint8Array(await file.arrayBuffer()));
        if (doc && doc.trim()) return onDraft(parseRecipeText(doc), 'Read from your document. Check it over, then save.');
      } catch {
        // fall through to the message below
      }
      return fail('Couldn’t read the text in that document. Copy the recipe and use Paste text instead.');
    }
    if (/\.doc$/.test(name)) {
      const rough = textFromLegacyDoc(new Uint8Array(await file.arrayBuffer()));
      if (rough) return onDraft(parseRecipeText(rough), 'Read from an old Word file, which is rougher than a newer one. Check it over carefully, then save.');
      return fail('Couldn’t find readable text in that .doc file. Save it as .docx or PDF, or copy the text and use Paste text.');
    }
    if (/\.pages$/.test(name)) {
      const preview = await previewFromPages(new Uint8Array(await file.arrayBuffer())).catch(() => null);
      if (preview) return scan(new File([preview.bytes as BlobPart], preview.name, { type: preview.type }));
      return fail('Couldn’t open that Pages file. In Pages choose File, Export To, PDF (or Word), then add that, or copy the text and use Paste text.');
    }
    if (/\.rtf$/.test(name)) {
      return fail('RTF files can’t be read directly. Save it as .docx or PDF, or copy the text and use Paste text.');
    }
    try {
      const body = await readAsText(file);
      if (/\.(html?|xhtml)$/.test(name) || /^\s*</.test(body)) {
        const found = extractRecipeFromHtml(body);
        if (found) return onDraft(found, 'Read from the saved page. Check it over, then save.');
      }
      if (/\.json$/.test(name)) {
        try {
          const found = recipeFromJsonLd(JSON.parse(body));
          if (found) return onDraft(found, 'Read from the file. Check it over, then save.');
        } catch {
          // fall through to plain text
        }
      }
      onDraft(parseRecipeText(body), 'Made a draft from the file’s text. Check it over, then save.');
    } catch (e: any) {
      fail(e?.message || 'Couldn’t read that file.');
    }
  };

  const pick = (handler: (f: File) => void) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) handler(file);
  };

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2" role="radiogroup" aria-label="How do you want to add it?">
        {WAYS.map((w) => (
          <button
            key={w.id}
            role="radio"
            aria-checked={way === w.id}
            onClick={() => {
              setWay(w.id);
              setError('');
            }}
            className={cx(
              'flex min-h-14 items-center gap-2.5 rounded-xl border px-3 py-2 text-left transition-colors',
              way === w.id ? 'border-ink bg-sunk' : 'border-line hover:border-line-strong'
            )}
          >
            <span className="shrink-0 text-ink-2">{w.icon}</span>
            <span className="min-w-0">
              <span className="block text-[14px] font-semibold leading-tight">{w.label}</span>
              <span className="block truncate text-[12px] text-ink-2">{w.hint}</span>
            </span>
          </button>
        ))}
      </div>

      {way === 'link' && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (url.trim()) fromLink();
          }}
        >
          <label htmlFor="recipe-url" className="text-[13px] font-semibold">
            Paste the web address of the recipe
          </label>
          <div className="flex gap-2">
            <TextInput
              id="recipe-url"
              type="url"
              inputMode="url"
              autoComplete="off"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              placeholder="https://www.bbcgoodfood.com/…"
            />
            <Button type="submit" variant="primary" disabled={busy || !url.trim()}>
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : null} Get
            </Button>
          </div>
          <p className="text-[12px] text-ink-3">Works with most recipe sites. No sign-in needed.</p>
        </form>
      )}

      {way === 'photo' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" disabled={busy} onClick={() => cameraRef.current?.click()}>
              <Camera className="h-4 w-4" /> Take a photo
            </Button>
            <Button variant="secondary" disabled={busy} onClick={() => libraryRef.current?.click()}>
              <ImageIcon className="h-4 w-4" /> Choose a photo
            </Button>
          </div>
          <p className="text-[12px] text-ink-3">
            A cookbook page, a handwritten card or a screenshot. {aiEnabled ? 'We read it and draft the recipe.' : 'Reading photos isn’t switched on for this app yet, so use a link or paste the text.'}
          </p>
          <input ref={cameraRef} type="file" accept="image/*" capture="environment" onChange={pick(scan)} className="hidden" aria-hidden="true" tabIndex={-1} />
          <input ref={libraryRef} type="file" accept="image/*" onChange={pick(scan)} className="hidden" aria-hidden="true" tabIndex={-1} />
        </div>
      )}

      {way === 'file' && (
        <div className="space-y-2">
          <Button variant="secondary" block disabled={busy} onClick={() => fileRef.current?.click()}>
            <FileText className="h-4 w-4" /> Choose a file
          </Button>
          <p className="text-[12px] text-ink-3">
            PDF, Word (.docx), text or notes, a saved web page, or a photo. Text files and saved pages work without any setup;
            PDFs and photos are read by the scanner{aiEnabled ? '' : ' (not switched on yet)'}.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="application/pdf,.pdf,image/*,text/*,.txt,.md,.html,.htm,.json,.rtf,.doc,.docx,.odt,.pages"
            onChange={pick(fromFile)}
            className="hidden"
            aria-hidden="true"
            tabIndex={-1}
          />
        </div>
      )}

      {way === 'describe' && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (describe.trim() && !busy) describeDish();
          }}
        >
          <label htmlFor="recipe-describe" className="text-[13px] font-semibold">
            Describe a dish and the app will write the recipe
          </label>
          <div className="flex gap-2">
            <TextInput id="recipe-describe" value={describe} onChange={(e) => setDescribe(e.target.value)} placeholder="e.g. Lamb kofta flatbreads" />
            <Button type="submit" variant="primary" disabled={busy || !describe.trim()}>
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Sparkles className="h-4 w-4" />} Create
            </Button>
          </div>
          <p className="text-[12px] text-ink-3">You can change anything before it’s saved. Needs a family group.</p>
        </form>
      )}

      {way === 'text' && (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (text.trim()) onDraft(parseRecipeText(text), 'Made a draft from your text. Check it over, then save.');
          }}
        >
          <label htmlFor="recipe-text" className="text-[13px] font-semibold">
            Paste the whole recipe
          </label>
          <textarea
            id="recipe-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            rows={6}
            placeholder={'Spaghetti bolognese\n\nIngredients\n500g mince\n1 onion\n\nMethod\n1. Fry the onion…'}
            className="w-full rounded-xl border border-line bg-card px-3.5 py-2.5 text-[15px] placeholder:text-ink-3 focus:border-ink-2 focus:outline-none"
          />
          <Button type="submit" variant="primary" block disabled={!text.trim()}>
            Make a draft
          </Button>
          <p className="text-[12px] text-ink-3">We look for “Ingredients” and “Method” headings. You can fix anything before saving.</p>
        </form>
      )}

      {busy && (
        <div role="status" className="flex items-start gap-2 rounded-xl bg-saffron-soft px-3 py-2.5 text-[13px] text-ink">
          <LoaderCircle className="mt-0.5 h-4 w-4 shrink-0 animate-spin" />
          <p>
            <span className="font-semibold">Reading your recipe. Please wait, this can take up to a minute.</span>{' '}
            {attempt > 1
              ? `The reader is busy, so we're trying again (go ${attempt} of 3). Keep this screen open.`
              : 'Keep this screen open until it finishes.'}
          </p>
        </div>
      )}
      {error && (
        <p role="alert" className="rounded-xl bg-tomato-soft px-3 py-2 text-[13px] text-tomato">
          {error}
        </p>
      )}
    </div>
  );
};
