/**
 * A recipe as a picture to send to someone: photo, title, time, ingredients, and the photo's licence credit.
 * The words and layout choices are plain functions (tested); drawing and sharing take their browser parts as
 * arguments, as `wakeLock.ts` does. Sharing tries the phone's share sheet with the image, then copying the image,
 * then downloading it.
 */
import { Meal } from '../types';

export const CARD_WIDTH = 1080;
export const CARD_HEIGHT = 1350;
export const MAX_CARD_INGREDIENTS = 10;

export interface CardContent {
  title: string;
  meta: string;
  ingredients: string[];
  /** "+3 more" when the list was cut to fit. */
  more: string | null;
  /** Licence line for the photo, or null when there is no photo or no credit. */
  credit: string | null;
}

const clip = (s: string, n: number) => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

const timeText = (t: Meal['timeStake']) => (t === '20m' ? '20 min' : t === '30m' ? '30 min' : t === '60m' ? '1 hour' : 'All day');

/**
 * `extras.photo` and `extras.credit` are what the recipe sheet shows (a bundled licensed photo, or the dish's own),
 * so the card matches it. A credit is printed only when there is a photo.
 */
export function cardContent(meal: Meal, extras: { photo?: string; credit?: Meal['photoCredit'] } = {}): CardContent {
  const shown = meal.ingredients.slice(0, MAX_CARD_INGREDIENTS).map((i) => clip(i, 48));
  const left = meal.ingredients.length - shown.length;
  const place = [meal.origin, meal.cuisine].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · ');
  const meta = [place, timeText(meal.timeStake)].filter(Boolean).join(' · ');
  const c = extras.photo ? extras.credit : undefined;
  return {
    title: clip(meal.title, 80),
    meta,
    ingredients: shown,
    more: left > 0 ? `+${left} more` : null,
    credit: c ? `Photo: ${c.author}, ${c.license}, via ${c.source}` : null,
  };
}

/** Greedy word wrap for a given width, using whatever measures text (a canvas in the browser). */
export function wrapLines(text: string, maxWidth: number, measure: (s: string) => number, maxLines = Infinity): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let line = '';
  for (const w of words) {
    const tryLine = line ? `${line} ${w}` : w;
    if (line && measure(tryLine) > maxWidth) {
      lines.push(line);
      line = w;
    } else {
      line = tryLine;
    }
  }
  if (line) lines.push(line);
  if (lines.length > maxLines) {
    const kept = lines.slice(0, maxLines);
    kept[maxLines - 1] = clip(kept[maxLines - 1] + '…', Math.max(4, kept[maxLines - 1].length));
    return kept;
  }
  return lines;
}

export const cardFilename = (title: string) =>
  `${title.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 50) || 'recipe'}-dinner-spinner.png`;

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------
type Ctx = Pick<
  CanvasRenderingContext2D,
  'fillRect' | 'fillText' | 'measureText' | 'drawImage' | 'save' | 'restore' | 'beginPath' | 'rect' | 'clip'
> & { fillStyle: any; font: string; textBaseline: any };

export interface CardCanvas {
  width: number;
  height: number;
  getContext(type: '2d'): Ctx | null;
  toBlob(cb: (b: Blob | null) => void, type?: string): void;
}

export interface CardImage {
  width: number;
  height: number;
}

const INK = '#1d1a16';
const PAPER = '#f6f1e7';
const MUTED = '#6b6257';
const ACCENT = '#b4452a';
const DISPLAY = '"Fraunces", Georgia, "Times New Roman", serif';
const SANS = '"Instrument Sans", system-ui, -apple-system, "Segoe UI", sans-serif';

/** Draws the card. `photo` may be null (no photo, or one that would not load): a plain band is used instead. */
export function drawRecipeCard(canvas: CardCanvas, content: CardContent, photo: CardImage | null): void {
  canvas.width = CARD_WIDTH;
  canvas.height = CARD_HEIGHT;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available');
  const pad = 72;
  const measure = (s: string) => ctx.measureText(s).width;

  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, CARD_WIDTH, CARD_HEIGHT);

  const photoH = 520;
  if (photo && photo.width > 0 && photo.height > 0) {
    // Fill the band, cropping the middle ("cover").
    const scale = Math.max(CARD_WIDTH / photo.width, photoH / photo.height);
    const w = photo.width * scale;
    const h = photo.height * scale;
    ctx.save();
    ctx.beginPath();
    ctx.rect(0, 0, CARD_WIDTH, photoH);
    ctx.clip();
    ctx.drawImage(photo as unknown as CanvasImageSource, (CARD_WIDTH - w) / 2, (photoH - h) / 2, w, h);
    ctx.restore();
  } else {
    ctx.fillStyle = ACCENT;
    ctx.fillRect(0, 0, CARD_WIDTH, 28);
  }

  let y = (photo ? photoH : 28) + 40;
  ctx.textBaseline = 'top';

  ctx.fillStyle = INK;
  ctx.font = `700 64px ${DISPLAY}`;
  const titleLines = wrapLines(content.title, CARD_WIDTH - pad * 2, measure, 3);
  for (const l of titleLines) {
    ctx.fillText(l, pad, y);
    y += 74;
  }

  y += 6;
  ctx.fillStyle = ACCENT;
  ctx.font = `600 32px ${SANS}`;
  ctx.fillText(content.meta, pad, y);
  y += 62;

  ctx.fillStyle = INK;
  ctx.font = `600 28px ${SANS}`;
  ctx.fillText('INGREDIENTS', pad, y);
  y += 46;

  ctx.font = `400 34px ${SANS}`;
  for (const ing of content.ingredients) {
    ctx.fillStyle = ACCENT;
    ctx.fillText('•', pad, y);
    ctx.fillStyle = INK;
    ctx.fillText(wrapLines(ing, CARD_WIDTH - pad * 2 - 40, measure, 1)[0] ?? ing, pad + 40, y);
    y += 48;
  }
  if (content.more) {
    ctx.fillStyle = MUTED;
    ctx.fillText(content.more, pad + 40, y);
  }

  // Footer: the app, and the photo credit when there is one.
  ctx.fillStyle = INK;
  ctx.font = `700 34px ${DISPLAY}`;
  ctx.fillText('Dinner Spinner', pad, CARD_HEIGHT - 120);
  if (content.credit) {
    ctx.fillStyle = MUTED;
    ctx.font = `400 22px ${SANS}`;
    const lines = wrapLines(content.credit, CARD_WIDTH - pad * 2, measure, 2);
    lines.forEach((l, i) => ctx.fillText(l, pad, CARD_HEIGHT - 70 + i * 28));
  }
}

// ---------------------------------------------------------------------------
// Sharing
// ---------------------------------------------------------------------------
export type ShareResult = 'shared' | 'copied' | 'downloaded' | 'cancelled';

export interface ShareDeps {
  share?: (data: { files: File[]; title: string; text?: string }) => Promise<void>;
  canShare?: (data: { files: File[] }) => boolean;
  copyImage?: (blob: Blob) => Promise<void>;
  download: (blob: Blob, filename: string) => void;
  makeFile: (blob: Blob, filename: string) => File;
}

/** Share sheet with the picture where the browser allows it, else copy the picture, else download it. */
export async function deliverCard(blob: Blob, title: string, deps: ShareDeps): Promise<ShareResult> {
  const filename = cardFilename(title);
  const file = deps.makeFile(blob, filename);
  if (deps.share && deps.canShare?.({ files: [file] })) {
    try {
      await deps.share({ files: [file], title });
      return 'shared';
    } catch (e) {
      if ((e as { name?: string })?.name === 'AbortError') return 'cancelled';
      // Any other failure: fall through to copying.
    }
  }
  if (deps.copyImage) {
    try {
      await deps.copyImage(blob);
      return 'copied';
    } catch {
      // Not allowed (permissions, or an unsupported browser): download instead.
    }
  }
  deps.download(blob, filename);
  return 'downloaded';
}
