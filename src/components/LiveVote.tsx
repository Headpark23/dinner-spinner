import React, { useEffect, useState } from 'react';
import { Check, CircleAlert, Users, X } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { Button, Card, Notice, Sheet, cx } from './ui';
import { GoogleSignInButton } from './FamilyStart';

const loadAs = (): string => {
  try {
    return localStorage.getItem('ds_live_as') || '';
  } catch {
    return '';
  }
};

/** The vote every phone in the household sees. The server decides the outcome. */
export const LiveVoteCard: React.FC = () => {
  const { tonight, householdMembers, meId, setMeId, castLiveVote, decideLive, clearLive, setActiveView } = useDinner();
  const [as, setAs] = useState<string>(loadAs);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!tonight || (tonight.status !== 'open' && tonight.status !== 'vetoed')) return null;

  const meMember = householdMembers.find((m) => m.id === meId);
  const guess = [as, meMember?.name || ''].find((n) => n && tonight.people.some((p) => p.toLowerCase() === n.toLowerCase()));
  const who = guess ? tonight.people.find((p) => p.toLowerCase() === guess.toLowerCase())! : '';

  const choose = (name: string) => {
    setAs(name);
    try {
      localStorage.setItem('ds_live_as', name);
    } catch {
      // per-phone convenience only
    }
    const m = householdMembers.find((x) => x.name.toLowerCase() === name.toLowerCase());
    if (m) setMeId(m.id);
  };

  const act = async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok && r.message) setError(r.message);
  };

  if (tonight.status === 'vetoed') {
    return (
      <Card className="space-y-3 p-4">
        <Notice tone="tomato" icon={<X className="h-4 w-4" />}>
          {tonight.vetoedBy} vetoed {tonight.meal?.title}. Try another dish.
        </Notice>
        <Button
          variant="primary"
          block
          disabled={busy}
          onClick={async () => {
            await clearLive();
            setActiveView(0);
          }}
        >
          Spin again
        </Button>
      </Card>
    );
  }

  const yes = Object.values(tonight.ballot).filter((v) => v === 'yes').length;
  const myVote = who ? tonight.ballot[who] : undefined;

  return (
    <Card className="space-y-3 p-4" aria-live="polite">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-[15px] font-semibold">
          <Users className="h-4 w-4" /> Voting on every phone
        </h2>
        <span className="text-[13px] text-ink-2 tabular-nums">
          {yes} of {tonight.needed} yes needed
        </span>
      </div>

      <ul className="flex flex-wrap gap-1.5">
        {tonight.people.map((p) => {
          const v = tonight.ballot[p];
          return (
            <li
              key={p}
              className={cx(
                'inline-flex items-center gap-1 rounded-full border px-2.5 py-1 text-[13px]',
                v === 'yes' ? 'border-sage bg-sage-soft text-sage' : 'border-line text-ink-2'
              )}
            >
              {v === 'yes' && <Check className="h-3 w-3" strokeWidth={3} />}
              {p}
              {!v && <span className="text-ink-3">· waiting</span>}
            </li>
          );
        })}
      </ul>

      {!who ? (
        <div role="radiogroup" aria-label="Who are you?" className="space-y-2">
          <p className="text-[14px] font-semibold">Who are you?</p>
          <div className="flex flex-wrap gap-2">
            {tonight.people.map((p) => (
              <button
                key={p}
                role="radio"
                aria-checked={false}
                onClick={() => choose(p)}
                className="min-h-11 rounded-xl border border-line px-4 text-[14px] font-semibold hover:border-line-strong"
              >
                {p}
              </button>
            ))}
          </div>
        </div>
      ) : myVote === 'yes' ? (
        <p className="text-[14px] text-ink-2">You voted yes as {who}. Waiting for the others.</p>
      ) : (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="danger" size="lg" disabled={busy} onClick={() => act(() => castLiveVote(who, 'no'))}>
            <X className="h-5 w-5" /> Veto
          </Button>
          <Button variant="success" size="lg" disabled={busy} onClick={() => act(() => castLiveVote(who, 'yes'))}>
            <Check className="h-5 w-5" /> Yes{who ? ` as ${who}` : ''}
          </Button>
        </div>
      )}

      {error && (
        <Notice tone="tomato" icon={<CircleAlert className="h-4 w-4" />} onDismiss={() => setError(null)}>
          {error}
        </Notice>
      )}

      <div className="flex items-center justify-between gap-2 text-[14px] font-semibold text-ink-2">
        <button disabled={busy} onClick={() => act(decideLive)} className="hover:text-ink hover:underline">
          Just decide. Skip the vote
        </button>
        <button disabled={busy} onClick={() => act(clearLive)} className="hover:text-ink hover:underline">
          Cancel vote
        </button>
      </div>
      <p className="text-[12px] text-ink-3">A single veto ends the round. Veto tokens aren’t used in a shared vote.</p>
    </Card>
  );
};

/** Visible on every screen except the vote itself while a vote is waiting. */
export const LiveVoteBanner: React.FC = () => {
  const { tonight, activeView, setActiveView } = useDinner();
  if (!tonight || tonight.status !== 'open' || activeView === 3) return null;
  return (
    <button
      onClick={() => setActiveView(3)}
      className="mb-3 flex min-h-11 w-full items-center gap-2 rounded-xl bg-saffron-soft px-3.5 py-2.5 text-left text-[14px] font-semibold text-saffron"
    >
      <Users className="h-4 w-4 shrink-0" />
      <span className="flex-1">Dinner vote open: {tonight.meal?.title}. Tap to vote.</span>
    </button>
  );
};

/** Tells whoever sent an invite that it was used. Shows until they dismiss it. */
export const JoinedBanner: React.FC = () => {
  const { newJoiners, dismissJoiners } = useDinner();
  if (newJoiners.length === 0) return null;
  return (
    <div className="mb-3 flex min-h-11 items-center gap-2 rounded-xl bg-sage-soft px-3.5 py-2.5 text-[14px] font-semibold text-sage" role="status">
      <Users className="h-4 w-4 shrink-0" />
      <span className="flex-1">{newJoiners.join(' and ')} joined your family group.</span>
      <button onClick={dismissJoiners} aria-label="Dismiss" className="grid h-8 w-8 place-items-center rounded-full">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

/** Opens from an invite link (?join=code). Never joins until the person agrees. */
export const JoinSheet: React.FC = () => {
  const { joinHousehold, householdCode, googleClientId, signInWithGoogle, fetchCloudSnapshot, importBackupData } = useDinner();
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // After joining: the family's saved recipes, offered rather than loaded without asking.
  const [offer, setOffer] = useState<{ raw: any; recipes: number } | null>(null);

  const afterJoin = async () => {
    const snap = await fetchCloudSnapshot();
    if (snap.success && snap.check && snap.check.ok && snap.check.summary.recipes > 0) {
      setOffer({ raw: snap.check.payload, recipes: snap.check.summary.recipes });
    } else {
      setCode(null);
    }
  };

  useEffect(() => {
    try {
      const url = new URL(window.location.href);
      const c = url.searchParams.get('join');
      if (!c) return;
      url.searchParams.delete('join');
      window.history.replaceState(window.history.state, '', url.pathname + url.search + url.hash);
      if (c !== householdCode) setCode(c.slice(0, 200));
    } catch {
      // ignore malformed URLs
    }
    // run once at startup
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (!code) return null;

  const join = async () => {
    setBusy(true);
    setMessage(null);
    const r = await joinHousehold(code);
    if (!r.success) {
      setBusy(false);
      setMessage(r.message);
      return;
    }
    await afterJoin();
    setBusy(false);
  };

  const joinWithGoogle = async (credential: string) => {
    setBusy(true);
    setMessage(null);
    const r = await signInWithGoogle(credential, code);
    if (!r.success) {
      setBusy(false);
      setMessage(r.message);
      return;
    }
    await afterJoin();
    setBusy(false);
  };

  if (offer) {
    return (
      <Sheet isOpen onClose={() => setCode(null)} title="You’re in" subtitle="The shopping list, fridge and vote are now shared." labelledBy="join-title">
        <div className="space-y-3">
          <p className="text-[14px] text-ink-2">
            The family has {offer.recipes} saved recipes. Load them onto this phone? This replaces the recipes and kitchen
            settings on this phone with theirs.
          </p>
          <Button
            variant="primary"
            block
            onClick={() => {
              importBackupData(offer.raw);
              setCode(null);
            }}
          >
            Load the family’s recipes
          </Button>
          <Button variant="quiet" block onClick={() => setCode(null)}>
            Keep what’s on this phone
          </Button>
        </div>
      </Sheet>
    );
  }

  return (
    <Sheet
      isOpen
      onClose={() => setCode(null)}
      title="Join this family?"
      subtitle="Someone invited you to share their shopping list, fridge and dinner votes."
      labelledBy="join-title"
    >
      <div className="space-y-3">
        <p className="text-[14px] text-ink-2">
          Joining shares the shopping list and lets you vote from this phone. Next you can choose to load the family’s
          saved recipes.
        </p>
        {message && (
          <Notice tone="tomato" icon={<CircleAlert className="h-4 w-4" />}>
            {message}
          </Notice>
        )}
        {googleClientId && (
          <div className="space-y-1.5">
            <GoogleSignInButton onCredential={joinWithGoogle} />
            <p className="text-center text-[12px] text-ink-3">
              Signing in lets you open the family group on any phone. Nothing is posted to Google.
            </p>
          </div>
        )}
        <Button variant={googleClientId ? 'secondary' : 'primary'} block disabled={busy} onClick={join}>
          {googleClientId ? 'Join without signing in' : 'Join family'}
        </Button>
        <Button variant="quiet" block onClick={() => setCode(null)}>
          Not now
        </Button>
      </div>
    </Sheet>
  );
};
