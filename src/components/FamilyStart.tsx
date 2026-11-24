import React, { useEffect, useRef, useState } from 'react';
import { CircleAlert, ListChecks, Refrigerator, ShieldCheck, Users } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { Button, Notice, TextInput } from './ui';

declare global {
  interface Window {
    google?: any;
  }
}

let gisLoading: Promise<void> | null = null;
/** Loads Google's sign-in script once, only when a sign-in button is actually shown. */
function loadGoogle(): Promise<void> {
  if (window.google?.accounts?.id) return Promise.resolve();
  if (!gisLoading) {
    gisLoading = new Promise<void>((resolve, reject) => {
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client';
      s.async = true;
      s.onload = () => resolve();
      s.onerror = () => {
        gisLoading = null;
        reject(new Error('Google sign-in could not load'));
      };
      document.head.appendChild(s);
    });
  }
  return gisLoading;
}

/** Google's own "Continue with Google" button. Shown only when the server has a client id. */
export const GoogleSignInButton: React.FC<{ onCredential: (credential: string) => void }> = ({ onCredential }) => {
  const { googleClientId } = useDinner();
  const holder = useRef<HTMLDivElement | null>(null);
  const [failed, setFailed] = useState(false);
  const cb = useRef(onCredential);
  cb.current = onCredential;

  useEffect(() => {
    if (!googleClientId || !holder.current) return;
    let live = true;
    loadGoogle()
      .then(() => {
        if (!live || !holder.current) return;
        window.google.accounts.id.initialize({
          client_id: googleClientId,
          callback: (r: { credential?: string }) => r.credential && cb.current(r.credential),
          auto_select: false,
        });
        const width = Math.max(220, Math.min(380, holder.current.clientWidth || 320));
        window.google.accounts.id.renderButton(holder.current, {
          theme: 'filled_blue',
          size: 'large',
          text: 'continue_with',
          shape: 'pill',
          width,
        });
      })
      .catch(() => live && setFailed(true));
    return () => {
      live = false;
    };
  }, [googleClientId]);

  if (!googleClientId) return null;
  return (
    <div>
      <div ref={holder} className="flex min-h-11 w-full justify-center" />
      {failed && <p className="mt-1 text-center text-[13px] text-tomato">Google sign-in couldn’t load. Check your connection.</p>}
    </div>
  );
};

const BENEFITS = [
  { icon: Users, title: 'Everyone votes from their own phone', body: 'No more passing one phone round the table.' },
  { icon: ListChecks, title: 'One shopping list', body: 'Whoever is at the shop ticks things off and everyone sees it.' },
  { icon: Refrigerator, title: 'One fridge, always up to date', body: 'See what’s in the house before you spin, from any phone.' },
  { icon: ShieldCheck, title: 'Nothing lost', body: 'New phone? Sign in and your family group and history are back.' },
];

export const FamilyBenefits: React.FC = () => (
  <ul className="space-y-2.5">
    {BENEFITS.map(({ icon: Icon, title, body }) => (
      <li key={title} className="flex items-start gap-3">
        <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-sage-soft text-sage">
          <Icon className="h-[18px] w-[18px]" strokeWidth={1.75} />
        </span>
        <span className="min-w-0">
          <span className="block text-[15px] font-semibold leading-snug">{title}</span>
          <span className="block text-[13px] leading-snug text-ink-2">{body}</span>
        </span>
      </li>
    ))}
  </ul>
);

/**
 * The way in to a family group: sign in with Google (or start one without), or join one with a code.
 * Used on the first-run welcome and in More, so it always reads the same.
 */
export const FamilyStart: React.FC<{ onDone: () => void; joinCode?: string }> = ({ onDone, joinCode }) => {
  const { googleClientId, signInWithGoogle, createHousehold, joinHousehold } = useDinner();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [haveCode, setHaveCode] = useState(false);
  const [code, setCode] = useState('');

  const finish = async (run: () => Promise<{ success: boolean; message: string }>) => {
    setBusy(true);
    setMessage(null);
    const r = await run();
    setBusy(false);
    if (r.success) onDone();
    else setMessage(r.message);
  };

  return (
    <div className="space-y-4">
      <FamilyBenefits />

      {message && (
        <Notice tone="tomato" icon={<CircleAlert className="h-4 w-4" />}>
          {message}
        </Notice>
      )}

      {googleClientId ? (
        <div className="space-y-1.5">
          <GoogleSignInButton onCredential={(cred) => finish(() => signInWithGoogle(cred, joinCode))} />
          <p className="text-center text-[12px] text-ink-3">
            We only use your name and email to find your family group. Nothing is posted to Google.
          </p>
        </div>
      ) : (
        <Button variant="primary" size="lg" block disabled={busy} onClick={() => finish(createHousehold)}>
          Start a family group
        </Button>
      )}

      {haveCode ? (
        <form
          className="space-y-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (code.trim()) finish(() => joinHousehold(code));
          }}
        >
          <label htmlFor="family-code" className="text-[14px] font-semibold">
            Family code
          </label>
          <TextInput
            id="family-code"
            value={code}
            onChange={(e) => setCode(e.target.value.slice(0, 200))}
            placeholder="Paste the code or invite link’s code"
            autoCapitalize="none"
            autoCorrect="off"
          />
          <Button type="submit" variant="secondary" block disabled={busy || !code.trim()}>
            Join this family
          </Button>
        </form>
      ) : (
        <Button variant="quiet" block onClick={() => setHaveCode(true)}>
          I have a family code
        </Button>
      )}
    </div>
  );
};
