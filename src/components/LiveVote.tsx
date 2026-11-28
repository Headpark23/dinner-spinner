import React, { useEffect, useState } from 'react';
import { Bell, BellOff, Check, CircleAlert, Clock, Users, X } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { Button, Card, Chip, Notice, Sheet, cx } from './ui';
import { GoogleSignInButton } from './FamilyStart';
import type { LiveVote } from '../types';

const loadAs = (): string => {
  try {
    return localStorage.getItem('ds_live_as') || '';
  } catch {
    return '';
  }
};

const same = (a: string, b: string) => !!a && !!b && a.trim().toLowerCase() === b.trim().toLowerCase();

/** "Alex", "Alex and Jo", "Alex, Jo and Sam". */
export const nameList = (names: string[]) =>
  names.length <= 1 ? names[0] || '' : `${names.slice(0, -1).join(', ')} and ${names[names.length - 1]}`;

/** The name this phone votes as in tonight's vote, if it can tell. */
export const useVoterName = (tonight: LiveVote | null): string => {
  const { householdMembers, meId, myVoteName } = useDinner();
  if (!tonight) return '';
  const meMember = householdMembers.find((m) => m.id === meId);
  const guess = [myVoteName(), loadAs(), meMember?.name || ''].find((n) => n && tonight.people.some((p) => same(p, n)));
  return guess ? tonight.people.find((p) => same(p, guess))! : '';
};

/**
 * Tonight's family vote, on every phone in the family group. The server decides the outcome.
 * Every state says in words what is happening, and every button says what it does.
 */
export const LiveVoteCard: React.FC = () => {
  const { tonight, setVoteIdentity, castLiveVote, decideLive, clearLive, cancelVote, setActiveView } = useDinner();
  const who = useVoterName(tonight);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirmCancel, setConfirmCancel] = useState(false);

  if (!tonight || (tonight.status !== 'open' && tonight.status !== 'vetoed')) return null;

  const act = async (fn: () => Promise<{ ok: boolean; message?: string }>) => {
    setBusy(true);
    setError(null);
    const r = await fn();
    setBusy(false);
    if (!r.ok && r.message) setError(r.message);
  };

  const dish = tonight.meal?.title || 'dinner';

  if (tonight.status === 'vetoed') {
    return (
      <Card className="space-y-3 p-4" aria-live="polite">
        <Chip tone="tomato">
          <X className="h-3 w-3" strokeWidth={3} /> Vote over: vetoed
        </Chip>
        <p className="text-[15px] font-semibold">
          {same(tonight.vetoedBy, who) ? `You vetoed ${dish}.` : `${tonight.vetoedBy} vetoed ${dish}.`}
        </p>
        <p className="text-[14px] text-ink-2">Pick something else and send it to the family vote again.</p>
        <Button
          variant="primary"
          block
          disabled={busy}
          onClick={async () => {
            setBusy(true);
            await clearLive();
            setBusy(false);
            setActiveView(0);
          }}
        >
          Spin for something else
        </Button>
      </Card>
    );
  }

  const yesCount = tonight.people.filter((p) => tonight.ballot[p] === 'yes').length;
  const myVote = who ? tonight.ballot[who] : undefined;
  const iSentIt = same(tonight.proposedBy, who);
  const phones = tonight.phones || [];
  const hasPhone = (p: string) => phones.some((n) => same(n, p));
  // Everyone still to vote, apart from this phone's person.
  const others = tonight.people.filter((p) => !tonight.ballot[p] && !same(p, who));
  const silent = others.filter((p) => !hasPhone(p));

  const status = (p: string) => {
    const v = tonight.ballot[p];
    if (v === 'yes') return same(p, tonight.proposedBy) ? 'Sent it, counts as a yes' : 'Said yes';
    if (v === 'no') return 'Vetoed';
    return hasPhone(p) ? 'Not voted yet · notifications on' : 'Not voted yet · notifications off';
  };

  return (
    <Card className="space-y-4 p-4" aria-live="polite">
      <div className="flex items-center justify-between gap-2">
        <Chip tone="saffron">
          <Users className="h-3 w-3" /> Family vote open
        </Chip>
        <span className="text-[13px] text-ink-2 tabular-nums">
          {yesCount} of {tonight.needed} yes needed
        </span>
      </div>

      {/* What this phone needs to know first. */}
      {!who ? null : iSentIt ? (
        <Notice tone="sage" icon={<Check className="h-4 w-4" />}>
          {others.length ? `Sent to ${nameList(others)}. Waiting for their vote.` : 'Sent. Waiting for the result.'}
        </Notice>
      ) : myVote === 'yes' ? (
        <Notice tone="sage" icon={<Check className="h-4 w-4" />}>
          You said yes. {others.length ? `Waiting for ${nameList(others)}.` : 'Waiting for the result.'}
        </Notice>
      ) : (
        <p className="text-[15px] font-semibold">
          {tonight.proposedBy || 'Someone'} wants to cook {dish} tonight. What do you say, {who}?
        </p>
      )}

      <ul className="divide-y divide-line rounded-xl border border-line" aria-label="Who has voted">
        {tonight.people.map((p) => {
          const v = tonight.ballot[p];
          return (
            <li key={p} className="flex items-center gap-3 px-3 py-2.5">
              <span
                className={cx(
                  'flex h-7 w-7 shrink-0 items-center justify-center rounded-full',
                  v === 'yes' ? 'bg-sage text-white' : v === 'no' ? 'bg-tomato text-white' : 'bg-sunk text-ink-3'
                )}
                aria-hidden="true"
              >
                {v === 'yes' ? (
                  <Check className="h-4 w-4" strokeWidth={3} />
                ) : v === 'no' ? (
                  <X className="h-4 w-4" strokeWidth={3} />
                ) : (
                  <Clock className="h-4 w-4" />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[14px] font-semibold">
                  {p}
                  {same(p, who) && <span className="font-normal text-ink-3"> (you)</span>}
                </span>
                <span className="flex items-center gap-1 text-[12.5px] text-ink-2">
                  {!v && (hasPhone(p) ? <Bell className="h-3 w-3" /> : <BellOff className="h-3 w-3" />)}
                  {status(p)}
                </span>
              </span>
            </li>
          );
        })}
      </ul>

      {iSentIt && silent.length > 0 && (
        <p className="text-[12.5px] text-ink-3">
          {nameList(silent)} won’t get a buzz because notifications aren’t on for them. They’ll see this vote as soon as they open
          Dinner Spinner.
        </p>
      )}

      {!who ? (
        <div role="radiogroup" aria-label="Who is voting on this phone?" className="space-y-2">
          <p className="text-[14px] font-semibold">Who’s voting on this phone?</p>
          <div className="flex flex-wrap gap-2">
            {tonight.people.map((p) => (
              <button
                key={p}
                role="radio"
                aria-checked={false}
                onClick={() => setVoteIdentity(p)}
                className="min-h-11 rounded-xl border border-line px-4 text-[14px] font-semibold hover:border-line-strong"
              >
                I’m {p}
              </button>
            ))}
          </div>
        </div>
      ) : !myVote ? (
        <div className="grid grid-cols-2 gap-3">
          <Button variant="danger" size="lg" disabled={busy} onClick={() => act(() => castLiveVote(who, 'no'))}>
            <X className="h-5 w-5" /> Veto it
          </Button>
          <Button variant="success" size="lg" disabled={busy} onClick={() => act(() => castLiveVote(who, 'yes'))}>
            <Check className="h-5 w-5" /> Yes, cook it
          </Button>
        </div>
      ) : null}

      {error && (
        <Notice tone="tomato" icon={<CircleAlert className="h-4 w-4" />} onDismiss={() => setError(null)}>
          {error}
        </Notice>
      )}

      {confirmCancel ? (
        <div role="alertdialog" aria-label="Cancel the vote?" className="space-y-2 rounded-xl border border-tomato/25 bg-tomato-soft/40 p-3">
          <p className="text-[14px] font-semibold">Cancel the vote on {dish} for everyone?</p>
          <p className="text-[13px] text-ink-2">
            {others.length ? `${nameList(others)} will be told it’s cancelled. ` : ''}Votes so far are cleared.
          </p>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" size="sm" disabled={busy} onClick={() => setConfirmCancel(false)}>
              Keep the vote open
            </Button>
            <Button
              variant="danger"
              size="sm"
              disabled={busy}
              onClick={() =>
                act(async () => {
                  const r = await cancelVote();
                  setConfirmCancel(false);
                  return r;
                })
              }
            >
              Yes, cancel the vote
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <Button variant="quiet" size="sm" disabled={busy} onClick={() => act(decideLive)}>
            Skip the vote and cook this
          </Button>
          <Button variant="quiet" size="sm" disabled={busy} onClick={() => setConfirmCancel(true)}>
            <X className="h-4 w-4" /> Cancel vote
          </Button>
        </div>
      )}
      <p className="text-[12px] text-ink-3">One veto ends the vote. Family votes don’t use up veto tokens.</p>
    </Card>
  );
};

/** On every screen except the vote itself while a vote is open: the in-app fallback when a push doesn't arrive. */
export const LiveVoteBanner: React.FC = () => {
  const { tonight, activeView, setActiveView } = useDinner();
  const who = useVoterName(tonight);
  if (!tonight || tonight.status !== 'open' || activeView === 3) return null;
  const dish = tonight.meal?.title || 'dinner';
  const others = tonight.people.filter((p) => !tonight.ballot[p] && !same(p, who));
  const iSentIt = !!who && same(tonight.proposedBy, who);
  const voted = !!who && !!tonight.ballot[who];
  const text = iSentIt
    ? `Family vote open: waiting for ${nameList(others) || 'the others'} to vote on ${dish}.`
    : voted
      ? `You voted on ${dish}. Waiting for ${nameList(others) || 'the result'}.`
      : `${tonight.proposedBy || 'Someone'} wants your vote: ${dish}.`;
  return (
    <button
      onClick={() => setActiveView(3)}
      className="mb-3 flex min-h-11 w-full items-center gap-2 rounded-xl bg-saffron-soft px-3.5 py-2.5 text-left text-[14px] font-semibold text-saffron"
    >
      <Users className="h-4 w-4 shrink-0" />
      <span className="flex-1">{text}</span>
      <span className="shrink-0 rounded-lg bg-saffron/15 px-2.5 py-1 text-[13px]">{iSentIt || voted ? 'See vote' : 'Vote now'}</span>
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
  const { joinHousehold, householdCode, googleClientId, signInWithGoogle, fetchCloudSnapshot, importBackupData, authHeaders } = useDinner();
  const [code, setCode] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // Only offered for older family groups whose recipes haven't been live-shared yet.
  const [offer, setOffer] = useState<{ raw: any; recipes: number } | null>(null);

  const afterJoin = async () => {
    try {
      const live = await fetch('/api/shared/recipes', { headers: authHeaders() });
      if (live.ok) {
        const st = await live.json();
        if (st?.seeded) {
          setCode(null);
          return;
        }
      }
    } catch {
      // fall through to snapshot check
    }
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
          Joining shares the family’s recipes, fridge, store cupboard, shopping list, likes and dinner votes automatically.
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
