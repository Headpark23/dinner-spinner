import React, { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, LoaderCircle, Share, X } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { getPushStatus, PushStatus, sendTestPush, syncPush, unsubscribePush } from '../utils/push';
import { Button, Card, cx } from './ui';

/** "Sam said yes to Lasagne", shown on this phone when someone else acts on tonight's vote. */
export const VoteNewsBanner: React.FC = () => {
  const { voteNews, dismissVoteNews, setActiveView, activeView } = useDinner();
  // A new proposal already has its own "Dinner vote open" banner (and the vote card on Tonight); the
  // phone still buzzes, but one banner is enough.
  if (!voteNews || voteNews.proposal) return null;
  return (
    <div
      role="status"
      aria-live="polite"
      className={cx(
        'mb-3 flex min-h-11 items-center gap-2 rounded-xl px-3.5 py-2.5 text-[14px] font-semibold',
        voteNews.tone === 'sage' && 'bg-sage text-white',
        voteNews.tone === 'tomato' && 'bg-tomato text-white',
        voteNews.tone === 'neutral' && 'bg-ink text-paper'
      )}
    >
      <BellRing className="h-4 w-4 shrink-0" />
      <span className="flex-1">{voteNews.text}</span>
      {activeView !== 3 && (
        <button
          onClick={() => {
            dismissVoteNews();
            setActiveView(3);
          }}
          className="shrink-0 rounded-lg bg-white/20 px-3 py-1.5 text-[13px]"
        >
          Open
        </button>
      )}
      <button onClick={dismissVoteNews} aria-label="Dismiss" className="grid h-8 w-8 shrink-0 place-items-center rounded-full">
        <X className="h-4 w-4" />
      </button>
    </div>
  );
};

/**
 * Turns on notifications for tonight's vote on this phone, or says plainly what's stopping them
 * (iPhone not added to the Home Screen, blocked in settings, plain http).
 */
export const VoteNotificationsCard: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { householdCode, householdMembers, familyNames, authHeaders, myVoteName, setVoteIdentity } = useDinner();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const name = myVoteName();

  const peopleOptions = Array.from(
    new Set([...householdMembers.map((m) => m.name), ...familyNames].map((n) => n.trim()).filter(Boolean))
  );

  useEffect(() => {
    let alive = true;
    getPushStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);

  // Notifications go through the family group, so there's nothing to set up without one.
  if (!householdCode || status === null) return null;
  if (compact && status === 'on' && name) return null;

  const turnOn = async () => {
    if (!name) {
      setMessage('Choose who this phone belongs to first.');
      return;
    }
    setBusy(true);
    setMessage(null);
    const r = await syncPush(name, authHeaders(), true);
    setBusy(false);
    setStatus(await getPushStatus());
    setMessage(r.ok ? `Done. This phone will buzz for ${name} when dinner is put to the vote and when people vote.` : r.message || null);
  };

  const turnOff = async () => {
    setBusy(true);
    setMessage(null);
    await unsubscribePush(authHeaders());
    setBusy(false);
    setStatus(await getPushStatus());
    setMessage('Vote notifications are turned off on this phone.');
  };

  const test = async () => {
    setBusy(true);
    const ok = await sendTestPush(authHeaders());
    setBusy(false);
    setMessage(ok ? 'Test sent. It should arrive in a few seconds.' : 'The test didn’t arrive. Try turning notifications on again.');
  };

  const text: Record<PushStatus, React.ReactNode> = {
    on: <>On for {name || 'this phone'}. You’ll hear when dinner is put to the vote, when anyone votes, and when it’s agreed.</>,
    default: <>Get a buzz when someone puts dinner to the vote, and hear back when they’ve voted. Works even when the app is closed.</>,
    denied: <>Notifications are blocked for this app. Allow them in your phone’s settings for this site, then come back here.</>,
    'needs-install': (
      <>
        On iPhone, notifications only work from the Home Screen app. Tap <Share className="inline h-3.5 w-3.5 align-[-2px]" />{' '}
        <strong>Share</strong>, then <strong>Add to Home Screen</strong>, open Dinner Spinner from there and turn them on.
      </>
    ),
    insecure: <>Notifications need the app’s secure (https) address. Votes still show here while the app is open.</>,
    unsupported: <>This browser can’t show notifications. Votes still show here while the app is open.</>,
  };
  const Icon = status === 'on' ? BellRing : status === 'default' ? Bell : BellOff;

  return (
    <Card className="space-y-3 p-4">
      <div className="flex items-start gap-3">
        <span
          className={cx(
            'flex h-9 w-9 shrink-0 items-center justify-center rounded-xl',
            status === 'on' ? 'bg-sage-soft text-sage' : 'bg-tomato-soft text-tomato'
          )}
        >
          <Icon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold">{status === 'on' ? 'Vote notifications are on' : 'Turn on vote notifications'}</p>
          <p className="mt-0.5 text-[13px] text-ink-2">{text[status]}</p>
        </div>
      </div>

      {(status === 'default' || status === 'on') && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <label className="flex items-center gap-2 text-[14px]">
            <span className="text-ink-2">This phone is</span>
            <select
              value={peopleOptions.find((p) => p.toLowerCase() === name.toLowerCase()) || ''}
              onChange={(e) => setVoteIdentity(e.target.value)}
              aria-label="Who this phone belongs to"
              className={cx('h-10 rounded-lg border bg-card px-2 text-[14px] font-semibold', name ? 'border-line' : 'border-tomato')}
            >
              <option value="">Choose…</option>
              {peopleOptions.map((person) => (
                <option key={person} value={person}>
                  {person}
                </option>
              ))}
            </select>
          </label>
          {status === 'default' ? (
            <Button variant="primary" size="sm" onClick={turnOn} disabled={busy}>
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />} Turn on
            </Button>
          ) : (
            <div className="flex items-center gap-2">
              <Button variant="secondary" size="sm" onClick={test} disabled={busy}>
                {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Send a test
              </Button>
              <Button variant="quiet" size="sm" onClick={turnOff} disabled={busy}>
                <BellOff className="h-4 w-4" /> Turn off
              </Button>
            </div>
          )}
        </div>
      )}
      {message && (
        <p className="text-[13px] text-ink-2" role="status">
          {message}
        </p>
      )}
    </Card>
  );
};
