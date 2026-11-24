import React, { useEffect, useState } from 'react';
import { Bell, BellOff, BellRing, Share, LoaderCircle } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { enablePush, getPushStatus, PushStatus, sendTestPush } from '../utils/push';
import { Button, Card, cx } from './ui';

/** "Who's phone is this?" — needed so votes and notifications go to the right person. */
export const PhoneOwnerPicker: React.FC<{ className?: string }> = ({ className }) => {
  const { householdMembers, meId, setMeId } = useDinner();
  return (
    <label className={cx('flex items-center gap-2 text-[14px]', className)}>
      <span className="text-ink-2">This phone is</span>
      <select
        value={meId}
        onChange={(e) => setMeId(e.target.value)}
        aria-label="Who uses this phone"
        className={cx(
          'h-9 rounded-lg border bg-card px-2 text-[14px] font-semibold',
          meId ? 'border-line' : 'border-tomato text-tomato'
        )}
      >
        <option value="">Choose…</option>
        {householdMembers.map((m) => (
          <option key={m.id} value={m.id}>
            {m.name}
          </option>
        ))}
      </select>
    </label>
  );
};

/**
 * Turns on vote notifications for this phone, or explains exactly what's
 * stopping them (plain http, iPhone not added to the Home Screen, blocked).
 */
export const NotificationsCard: React.FC<{ compact?: boolean }> = ({ compact }) => {
  const { meId, householdMembers } = useDinner();
  const [status, setStatus] = useState<PushStatus | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const me = householdMembers.find((m) => m.id === meId);

  useEffect(() => {
    let alive = true;
    getPushStatus().then((s) => alive && setStatus(s));
    return () => {
      alive = false;
    };
  }, []);

  if (status === null) return null;
  // Once it's on, the compact version gets out of the way.
  if (compact && status === 'on' && me) return null;

  const turnOn = async () => {
    if (!me) {
      setMessage('Choose who this phone belongs to first.');
      return;
    }
    setBusy(true);
    setMessage(null);
    const res = await enablePush(me.id, me.name);
    setBusy(false);
    setStatus(await getPushStatus());
    setMessage(res.ok ? `Done. ${me.name} will hear about votes on this phone.` : res.message || null);
  };

  const test = async () => {
    setBusy(true);
    const ok = await sendTestPush();
    setBusy(false);
    setMessage(ok ? 'Test sent. It should arrive in a few seconds.' : 'The test didn’t go through. Try turning notifications on again.');
  };

  const body: Record<PushStatus, React.ReactNode> = {
    on: <>Notifications are on{me ? ` for ${me.name}` : ''}. You’ll hear when a dish is put to the vote and when anyone votes.</>,
    default: <>Get a notification when someone puts dinner to the vote, and when they’ve voted.</>,
    denied: <>Notifications are blocked for this app. Allow them in your phone’s settings for this site, then come back.</>,
    'needs-install': (
      <>
        On iPhone, notifications only work from the Home Screen app. Tap <Share className="inline h-3.5 w-3.5 align-[-2px]" />{' '}
        <strong>Share</strong>, then <strong>Add to Home Screen</strong>, and open Dinner Spinner from there.
      </>
    ),
    insecure: (
      <>
        Phones only allow notifications on a secure (https) address. This copy is open over plain http, so you’ll only see
        votes while the app is open.
      </>
    ),
    unsupported: <>This browser can’t show notifications. Votes still appear here while the app is open.</>,
  };

  const Icon = status === 'on' ? BellRing : status === 'default' ? Bell : BellOff;

  return (
    <Card className={cx('space-y-3 p-4', status === 'default' && 'border-tomato/40')}>
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
          <p className="text-[15px] font-semibold">
            {status === 'on' ? 'Vote notifications on' : 'Turn on vote notifications'}
          </p>
          <p className="mt-0.5 text-[13px] text-ink-2">{body[status]}</p>
        </div>
      </div>

      {(status === 'default' || status === 'on') && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <PhoneOwnerPicker />
          {status === 'default' ? (
            <Button variant="primary" size="sm" onClick={turnOn} disabled={busy}>
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <Bell className="h-4 w-4" />} Turn on
            </Button>
          ) : (
            <Button variant="secondary" size="sm" onClick={test} disabled={busy}>
              {busy ? <LoaderCircle className="h-4 w-4 animate-spin" /> : <BellRing className="h-4 w-4" />} Send a test
            </Button>
          )}
        </div>
      )}
      {status !== 'default' && status !== 'on' && <PhoneOwnerPicker />}
      {message && <p className="text-[13px] text-ink-2" role="status">{message}</p>}
    </Card>
  );
};
