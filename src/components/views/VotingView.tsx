import React, { useEffect, useState } from 'react';
import { VoteNotificationsCard } from '../VoteNotifications';
import { useDinner } from '../../context/DinnerContext';
import { ArrowLeft, Check, X, Copy, UserPlus, Trash2, CircleAlert, RotateCcw, Dices, Clock, Bell, BellOff, Send } from 'lucide-react';
import confetti from 'canvas-confetti';
import { AfterDinnerReview } from '../AfterDinnerReview';
import { LeftoversStep } from '../LeftoversStep';
import { RecipeSheet } from '../RecipeSheet';
import { LiveVoteCard } from '../LiveVote';
import { quantityFor } from '../../utils/quantities';
import { dishClashes, describeClashes } from '../../utils/memberDiets';
import { useWakeLock } from '../../utils/useWakeLock';
import { stepDelays, showStepNotification, notificationsSupported } from '../../utils/stepAlerts';
import { sound } from '../../utils/audio';
import { votesNeeded } from '../../utils/votes';
import { resolveMealPhoto } from '../../data/photos';
import { HouseholdMember } from '../../types';
import { Button, Card, Chip, Notice, Segmented, TextInput, cx, timeLabel, effortLabel } from '../ui';

const avatarTints = ['#6d5a44', '#3d6a4c', '#3f6a86', '#9a6510', '#8a4a6b', '#b4652a'];

export const MemberAvatar: React.FC<{ member: HouseholdMember; size?: number }> = ({ member, size = 32 }) => {
  const tint = avatarTints[member.name.length % avatarTints.length];
  return (
    <span
      aria-hidden="true"
      className="inline-flex shrink-0 items-center justify-center rounded-full font-semibold text-white"
      style={{ width: size, height: size, background: tint, fontSize: size * 0.42 }}
    >
      {member.name.charAt(0).toUpperCase()}
    </span>
  );
};

const TokenDots: React.FC<{ left: number; className?: string }> = ({ left, className }) => (
  <span className={cx('flex gap-0.5', className)} aria-label={`${left} of 3 vetoes left`}>
    {[0, 1, 2].map((i) => (
      <span key={i} className={cx('h-1.5 w-1.5 rounded-full', i < left ? 'bg-current' : 'bg-current opacity-25')} />
    ))}
  </span>
);

export const VotingView: React.FC = () => {
  const {
    proposedMeal,
    householdMembers,
    addHouseholdMember,
    removeHouseholdMember,
    resetVetoTokens,
    activeVoterIndex,
    setActiveVoterIndex,
    currentBallot,
    voteYes,
    voteNo,
    agreedMeal,
    setAgreedMeal,
    consecutiveRejections,
    targetEatingTime,
    setTargetEatingTime,
    reverseTimers,
    toggleTimerStep,
    generateReverseTimers,
    recordMealCooked,
    setActiveView,
    resetEvening,
    cookLog,
    tonight,
    householdCode,
    startLiveVote,
    servings,
    setServings,
    cancelVote,
    voteSend,
    retrySendToVote,
  } = useDinner();

  const [copied, setCopied] = useState(false);
  const [vetoError, setVetoError] = useState<string | null>(null);
  const [showRoster, setShowRoster] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');
  const [recipeOpen, setRecipeOpen] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [confirmLocalCancel, setConfirmLocalCancel] = useState(false);
  // In a family group the vote happens on everyone's phone; this is the fallback if sending fails.
  const [votingHere, setVotingHere] = useState(false);

  // Cooking reminders. While a dinner is being cooked the screen is kept awake (so the page and its timers
  // keep running), and each step raises a system notification through the service worker plus an in-app banner.
  // True background delivery on a locked phone needs a push server, so the note below says so plainly.
  const [remind, setRemind] = useState(false);
  const [remindNote, setRemindNote] = useState<string | null>(null);
  const [keepAwake, setKeepAwake] = useState(true);
  const [dueStep, setDueStep] = useState<{ id: string; text: string } | null>(null);

  const cooking = !!agreedMeal && reverseTimers.some((s) => !s.done);
  const wakeSupported = useWakeLock(cooking && keepAwake);

  useEffect(() => {
    if (!remind || !agreedMeal) return;
    const timers = stepDelays(reverseTimers).map(({ id, ms }) => {
      const step = reverseTimers.find((s) => s.id === id)!;
      return window.setTimeout(() => {
        const text = `${step.timeString}: ${step.label}`;
        setDueStep({ id, text });
        sound.playNudge();
        void showStepNotification(text, agreedMeal.title, id);
      }, ms);
    });
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [remind, reverseTimers, agreedMeal]);

  const toggleReminders = async () => {
    if (remind) {
      setRemind(false);
      setRemindNote(null);
      setDueStep(null);
      return;
    }
    if (!notificationsSupported()) {
      setRemindNote('This browser can’t show reminders. The timeline still works.');
      return;
    }
    const result = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
    if (result === 'granted') {
      setRemind(true);
      setRemindNote(
        'Reminders are on. They arrive while Dinner Spinner is open or just minimised. A locked phone may hold them back, so keep the screen on while you cook. On iPhone, add the app to your home screen first.'
      );
    } else {
      setRemindNote('Notifications are blocked for this site. Allow them in your browser settings to get reminders.');
    }
  };

  const currentVoter = householdMembers[activeVoterIndex] || householdMembers[0];
  const yesVotesCount = Object.values(currentBallot).filter((v) => v === 'yes').length;
  const majorityNeeded = votesNeeded(householdMembers.length);

  // A cook is "already logged" if this agreed dish was logged in the last 12 hours.
  const loggedEntry =
    agreedMeal &&
    cookLog.find(
      (c) => c.mealId === agreedMeal.id && Date.now() - new Date(c.date).getTime() < 12 * 3600 * 1000
    );

  const handleTimeChange = (newTime: string) => {
    setTargetEatingTime(newTime);
    if (agreedMeal) generateReverseTimers(newTime, agreedMeal);
  };

  const handleCopy = async () => {
    if (!proposedMeal) return;
    const text = `Dinner tonight? ${proposedMeal.title}\n${timeLabel(proposedMeal.timeStake)}, ${effortLabel(
      proposedMeal.effort
    ).toLowerCase()}.\nYes, or use a veto?`;
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setVetoError('Couldn’t copy to the clipboard on this device.');
    }
  };

  const handleVoteNo = () => {
    if (!currentVoter) return;
    setVetoError(null);
    const res = voteNo(currentVoter.id);
    if (!res.allowed && res.message) setVetoError(res.message);
  };

  const handleMarkCooked = () => {
    if (!agreedMeal || loggedEntry) return;
    recordMealCooked(agreedMeal.id);
    if (!window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) {
      try {
        confetti({ particleCount: 60, spread: 80, origin: { y: 0.7 }, colors: ['#c7a15a', '#b93a26', '#3d6a4c'] });
      } catch {
        // decorative only
      }
    }
  };

  const doneCount = reverseTimers.filter((s) => s.done).length;
  const nextIdx = reverseTimers.findIndex((s) => !s.done);

  // ---------- Empty state ----------
  if (!proposedMeal && !agreedMeal) {
    return (
      <div className="space-y-6">
        <Card className="flex flex-col items-center px-6 py-12 text-center">
          <span className="flex h-16 w-16 items-center justify-center rounded-[22px] bg-enamel text-brass ring-1 ring-brass/40 shadow-md">
            <Clock className="h-7 w-7" strokeWidth={1.65} />
          </span>
          <h1 className="mt-5 font-display text-[28px] leading-tight font-semibold">Nothing on the table yet</h1>
          <p className="mt-2 max-w-[300px] text-[14.5px] leading-relaxed text-ink-2">
            Spin the reel or choose a dish from your recipes, then put it to the household here.
          </p>
          <Button variant="primary" size="lg" className="mt-6" onClick={() => setActiveView(0)}>
            <Dices className="h-5 w-5" /> Go to the spinner
          </Button>
        </Card>
        <VoteNotificationsCard compact />
      </div>
    );
  }

  // ---------- Agreed: timeline ----------
  if (agreedMeal) {
    const resolvedAgreed = resolveMealPhoto(agreedMeal);
    const agreedPhoto = resolvedAgreed.url;
    const nextStepObj = nextIdx >= 0 ? reverseTimers[nextIdx] : undefined;
    return (
      <div className="space-y-4">
        <Card className="overflow-hidden">
          {agreedPhoto && (
            <div className="relative aspect-[16/9] w-full overflow-hidden bg-sunk">
              <img
                src={agreedPhoto}
                alt=""
                onError={(e) => {
                  if (!e.currentTarget.src.endsWith(resolvedAgreed.fallbackUrl)) {
                    e.currentTarget.src = resolvedAgreed.fallbackUrl;
                  }
                }}
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/15 to-transparent" />
              <div className="absolute top-3 left-3">
                <span className="inline-flex items-center gap-1 rounded-full bg-sage px-3 py-1 text-[12px] font-bold text-white shadow-sm">
                  <Check className="h-3.5 w-3.5" strokeWidth={3} /> Agreed for tonight
                </span>
              </div>
              {!loggedEntry && (
                <button
                  onClick={() => setAgreedMeal(null)}
                  className="absolute top-3 right-3 rounded-full bg-black/55 px-3 py-1 text-[12px] font-semibold text-white backdrop-blur-xs hover:bg-black/75"
                >
                  Reopen vote
                </button>
              )}
              <div className="absolute right-4 bottom-3 left-4 text-white">
                <h1 className="font-display text-[26px] leading-[1.12] font-semibold drop-shadow-xs">{agreedMeal.title}</h1>
              </div>
            </div>
          )}
          <div className="p-4">
            {!agreedPhoto && (
              <>
                <div className="flex items-center justify-between gap-2">
                  <Chip tone="sage">
                    <Check className="h-3 w-3" /> Agreed for tonight
                  </Chip>
                  {!loggedEntry && (
                    <button onClick={() => setAgreedMeal(null)} className="inline-flex min-h-10 items-center text-[13px] font-semibold text-ink-2 hover:text-ink">
                      Reopen the vote
                    </button>
                  )}
                </div>
                <h1 className="mt-2 font-display text-[28px] leading-tight font-semibold">{agreedMeal.title}</h1>
              </>
            )}
            <p className="text-[14px] leading-relaxed text-ink-2">{agreedMeal.description}</p>
            <button
              onClick={() => setRecipeOpen(true)}
              className="mt-2 inline-flex min-h-9 items-center text-[13.5px] font-semibold text-tomato underline-offset-2 hover:underline"
            >
              Open full recipe, tweaks &amp; shopping →
            </button>
            {agreedMeal.tweaks?.note && (
              <p className="mt-2 rounded-xl border border-saffron/20 bg-saffron-soft px-3 py-2 text-[13px] text-saffron">
                Note: {agreedMeal.tweaks.note}
              </p>
            )}
          </div>
          {recipeOpen && <RecipeSheet meal={agreedMeal} onClose={() => setRecipeOpen(false)} />}
        </Card>

        {loggedEntry ? (
          <Card className="fade-up p-6 text-center">
            <p className="font-display text-[24px] font-semibold">Enjoy your dinner.</p>
            <p className="mt-1 text-[14px] text-ink-2">
              Logged to your history
              {loggedEntry.rescued.length > 0
                ? `, and ${loggedEntry.rescued.join(', ')} ${loggedEntry.rescued.length === 1 ? 'is' : 'are'} off the use-next list.`
                : '.'}
            </p>
          </Card>
        ) : null}

        {loggedEntry ? (
          <>
            <AfterDinnerReview key={loggedEntry.id} entry={loggedEntry} />
            <LeftoversStep key={`left-${loggedEntry.id}`} entry={loggedEntry} />
            <Button variant="secondary" block onClick={resetEvening}>
              <RotateCcw className="h-4 w-4" /> Start a new evening
            </Button>
          </>
        ) : (
          <>
            {nextStepObj && (
              <div className="cabinet-housing rounded-[22px] p-4 text-on-enamel ring-1 ring-brass/40">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold tracking-[0.1em] uppercase text-brass">Up next</span>
                  <span className="rounded-full bg-white/12 px-2.5 py-0.5 text-[12.5px] font-bold text-on-enamel tabular-nums">
                    {nextStepObj.timeString}
                  </span>
                </div>
                <p className="mt-1.5 font-display text-[19px] leading-snug font-semibold text-on-enamel">{nextStepObj.label}</p>
              </div>
            )}

            <Card className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 p-4">
              <label htmlFor="eat-at" className="text-[14px] font-semibold">
                Eat at
              </label>
              <input
                id="eat-at"
                type="time"
                value={targetEatingTime}
                onChange={(e) => handleTimeChange(e.target.value)}
                className="h-11 w-full rounded-xl border border-line bg-paper px-3 text-[17px] font-semibold tabular-nums focus:border-tomato/60 focus:outline-none"
              />
              <span className="text-[14px] font-semibold">Serves</span>
              <Segmented<'2' | '4' | '6' | '8'>
                label="Servings"
                size="sm"
                value={String(servings) as '2' | '4' | '6' | '8'}
                onChange={(n) => setServings(Number(n))}
                options={['2', '4', '6', '8'].map((n) => ({ value: n as '2' | '4' | '6' | '8', label: n }))}
              />
            </Card>

            <section aria-labelledby="timeline-h">
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 id="timeline-h" className="text-[15px] font-semibold">
                  Timeline
                </h2>
                <span className="flex items-center gap-3">
                  <button
                    onClick={toggleReminders}
                    aria-pressed={remind}
                    className={cx(
                      'inline-flex h-10 items-center gap-1.5 rounded-full px-3 text-[13px] font-semibold transition-colors',
                      remind ? 'bg-sage-soft text-sage' : 'bg-sunk text-ink-2 hover:text-ink'
                    )}
                  >
                    {remind ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
                    {remind ? 'Reminders on' : 'Remind me'}
                  </button>
                  <span className="text-[13px] text-ink-2 tabular-nums">
                    {doneCount} of {reverseTimers.length} done
                  </span>
                </span>
              </div>
              {dueStep && (
                <div role="status" className="mb-2 flex items-center justify-between gap-3 rounded-xl bg-tomato-soft px-3 py-2 text-[14px] font-semibold text-tomato">
                  <span>Now: {dueStep.text}</span>
                  <button onClick={() => setDueStep(null)} className="min-h-10 px-2 text-[13px] underline">
                    Got it
                  </button>
                </div>
              )}
              {wakeSupported && (
                <label className="mb-2 flex min-h-10 items-center gap-2 px-1 text-[13px] text-ink-2">
                  <input type="checkbox" checked={keepAwake} onChange={(e) => setKeepAwake(e.target.checked)} className="h-4 w-4" />
                  Keep the screen on while I cook
                </label>
              )}
              {remindNote && <p className="mb-2 px-1 text-[12px] text-ink-3">{remindNote}</p>}
              <ol className="overflow-hidden rounded-2xl border border-line bg-card">
                {reverseTimers.map((step, idx) => {
                  const isNext = idx === nextIdx;
                  return (
                    <li key={step.id} className={cx(idx > 0 && 'border-t border-line')}>
                      <button
                        onClick={() => toggleTimerStep(step.id)}
                        aria-pressed={step.done}
                        className={cx(
                          'flex w-full items-start gap-3 px-4 py-3 text-left transition-colors',
                          isNext && 'bg-tomato-soft/60',
                          !isNext && 'hover:bg-sunk'
                        )}
                      >
                        <span
                          className={cx(
                            'mt-0.5 w-12 shrink-0 text-[15px] font-semibold tabular-nums',
                            step.done ? 'text-ink-3' : isNext ? 'text-tomato' : 'text-ink'
                          )}
                        >
                          {step.timeString}
                        </span>
                        <span className="min-w-0 flex-1">
                          {isNext && <span className="eyebrow block text-tomato">Next</span>}
                          <span className={cx('text-[14px] leading-snug', step.done ? 'text-ink-3 line-through' : 'text-ink')}>
                            {step.label}
                          </span>
                        </span>
                        <span
                          className={cx(
                            'mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border',
                            step.done ? 'border-sage bg-sage text-white' : 'border-line-strong'
                          )}
                        >
                          {step.done && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ol>
            </section>

            <section aria-labelledby="ingredients-h">
              <h2 id="ingredients-h" className="mb-2 px-1 text-[15px] font-semibold">
                Ingredients <span className="font-normal text-ink-2">· for {servings}</span>
              </h2>
              <ul className="flex flex-wrap gap-1.5">
                {agreedMeal.ingredients.map((ing, i) => {
                  const qty = quantityFor(agreedMeal.id, ing, servings);
                  return (
                    <li key={i}>
                      <Chip tone="outline" className="whitespace-normal py-1.5 text-left leading-snug">
                        {qty ? `${qty} ${ing}` : ing}
                      </Chip>
                    </li>
                  );
                })}
              </ul>
            </section>

            <Button variant="success" size="lg" block onClick={handleMarkCooked}>
              <Check className="h-5 w-5" /> We’ve eaten. Log it
            </Button>
            <p className="-mt-2 text-center text-[12px] text-ink-3">
              Clears any use-next items this dish used from the pantry.
            </p>
          </>
        )}
      </div>
    );
  }

  // ---------- Voting ----------
  const meal = proposedMeal!;
  const resolvedProposal = resolveMealPhoto(meal);
  const mealPhoto = resolvedProposal.url;
  const liveActive = !!tonight && (tonight.status === 'open' || tonight.status === 'vetoed') && tonight.meal?.id === meal.id;
  const voterOutOfVetoes = currentVoter.vetoTokensRemaining <= 0;
  const clashes = dishClashes(meal, householdMembers);

  const sending = voteSend?.mealId === meal.id ? voteSend : null;
  const familyVote = !!householdCode && !votingHere;

  const cancel = async () => {
    setCancelling(true);
    try {
      await cancelVote();
    } finally {
      setCancelling(false);
      setConfirmLocalCancel(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Going back never cancels anything: an open family vote stays open, with a banner on every screen. */}
      <button
        type="button"
        onClick={() => setActiveView(0)}
        className="inline-flex h-10 items-center gap-1.5 rounded-full px-1 text-[14px] font-semibold text-ink-2 hover:text-ink"
      >
        <ArrowLeft className="h-4 w-4" /> Back to the spinner
      </button>
      <Card className="overflow-hidden">
        {mealPhoto && (
          <div className="relative aspect-[16/10] w-full overflow-hidden bg-sunk">
            <img
              src={mealPhoto}
              alt=""
              onError={(e) => {
                if (!e.currentTarget.src.endsWith(resolvedProposal.fallbackUrl)) {
                  e.currentTarget.src = resolvedProposal.fallbackUrl;
                }
              }}
              className="h-full w-full object-cover"
            />
            <div className="absolute inset-0 bg-gradient-to-t from-black/72 via-black/18 to-transparent" />
            <div className="absolute top-3 left-3 flex gap-1.5">
              <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11.5px] font-semibold text-white backdrop-blur-xs">
                {timeLabel(meal.timeStake)}
              </span>
              <span className="rounded-full bg-black/55 px-2.5 py-1 text-[11.5px] font-semibold text-white backdrop-blur-xs">
                {meal.cuisine}
              </span>
            </div>
            <div className="absolute right-4 bottom-3 left-4 text-white">
              <p className="text-[10.5px] font-semibold tracking-[0.1em] uppercase text-white/80">On the table tonight</p>
              <h1 className="mt-0.5 font-display text-[26px] leading-[1.12] font-semibold drop-shadow-xs">{meal.title}</h1>
            </div>
          </div>
        )}
        <div className="p-4">
          {!mealPhoto && (
            <>
              <p className="eyebrow">Proposed for tonight</p>
              <h1 className="mt-1 font-display text-[28px] leading-tight font-semibold">{meal.title}</h1>
              <p className="mt-1 text-[13px] text-ink-2">
                {timeLabel(meal.timeStake)} · {effortLabel(meal.effort)} · {meal.cuisine}
              </p>
            </>
          )}
          <p className={cx('text-[14px] leading-relaxed text-ink-2', !mealPhoto && 'mt-2')}>{meal.description}</p>
          {clashes.length > 0 && (
            <p role="status" className="mt-3 rounded-xl border border-saffron/20 bg-saffron-soft px-3.5 py-2.5 text-[14px] font-medium text-ink">
              Doesn’t suit {describeClashes(clashes)}.
            </p>
          )}
        </div>
      </Card>

      <VoteNotificationsCard compact />

      {liveActive ? (
        <LiveVoteCard />
      ) : familyVote ? (
        <Card className="space-y-3 p-4" aria-live="polite">
          {sending?.state === 'sending' ? (
            <p className="flex items-center gap-2 text-[15px] font-semibold">
              <Clock className="h-4 w-4 animate-pulse" /> Sending {meal.title} to your family…
            </p>
          ) : sending?.state === 'failed' ? (
            <>
              <Notice tone="tomato" icon={<CircleAlert className="h-4 w-4" />}>
                Not sent: {sending.message} Nobody has been asked yet.
              </Notice>
              <Button variant="primary" block onClick={retrySendToVote}>
                <Send className="h-4 w-4" /> Try sending to family vote again
              </Button>
              <Button variant="quiet" block onClick={() => setVotingHere(true)}>
                Everyone’s here? Vote on this phone instead
              </Button>
            </>
          ) : (
            <>
              <h2 className="text-[15px] font-semibold">Not sent to the family yet</h2>
              <p className="text-[13px] text-ink-2">
                Everyone in your family group gets a notification and votes on their own phone. One veto ends it.
              </p>
              {liveError && (
                <p role="alert" className="text-[13px] text-tomato">
                  {liveError}
                </p>
              )}
              <Button
                variant="primary"
                block
                onClick={async () => {
                  setLiveError(null);
                  const r = await startLiveVote(meal);
                  if (!r.ok) setLiveError(r.message || 'Couldn’t send the vote.');
                }}
              >
                <Send className="h-4 w-4" /> Send to family vote
              </Button>
            </>
          )}
        </Card>
      ) : (
        <>
          <Card className="p-4">
            <div className="flex items-baseline justify-between">
              <h2 className="text-[15px] font-semibold">Voting on this phone</h2>
              <span className="text-[13px] text-ink-2 tabular-nums">
                {yesVotesCount} of {majorityNeeded} yes needed
              </span>
            </div>
            <p className="mt-1 text-[13px] text-ink-2">Pass the phone round. Tap who’s voting, then they choose.</p>
            <div
              className="mt-3 grid auto-cols-[minmax(72px,1fr)] grid-flow-col gap-2 overflow-x-auto pb-1 scrollbar-none"
              role="radiogroup"
              aria-label="Who is voting now"
            >
              {householdMembers.map((member, idx) => {
                const selected = activeVoterIndex === idx;
                const voted = currentBallot[member.id] === 'yes';
                return (
                  <button
                    key={member.id}
                    role="radio"
                    aria-checked={selected}
                    onClick={() => {
                      setActiveVoterIndex(idx);
                      setVetoError(null);
                    }}
                    className={cx(
                      'flex flex-col items-center gap-1 rounded-xl border px-2 py-2.5 transition-colors',
                      selected ? 'border-ink bg-paper' : 'border-line hover:border-line-strong'
                    )}
                  >
                    <span className="relative">
                      <MemberAvatar member={member} size={34} />
                      {voted && (
                        <span className="absolute -right-1 -bottom-1 flex h-4 w-4 items-center justify-center rounded-full bg-sage text-white ring-2 ring-card">
                          <Check className="h-2.5 w-2.5" strokeWidth={3} />
                        </span>
                      )}
                    </span>
                    <span className="text-[13px] font-semibold">{member.name}</span>
                    <span className="text-[11px] text-ink-3">{voted ? 'Said yes' : 'Not voted'}</span>
                    <TokenDots left={member.vetoTokensRemaining} className={cx(member.vetoTokensRemaining === 0 ? 'text-tomato' : 'text-ink-3')} />
                  </button>
                );
              })}
            </div>
          </Card>

          {vetoError && (
            <Notice tone="tomato" icon={<CircleAlert className="h-4 w-4" />} onDismiss={() => setVetoError(null)}>
              {vetoError}
            </Notice>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Button
              variant="danger"
              size="lg"
              onClick={handleVoteNo}
              disabled={voterOutOfVetoes}
              aria-describedby="veto-hint"
              className="h-auto min-h-14 flex-col !gap-0 py-2"
            >
              <span className="flex items-center gap-1.5">
                <X className="h-5 w-5" /> {currentVoter.name} vetoes
              </span>
              <span id="veto-hint" className="text-[11px] font-medium text-ink-3">
                {voterOutOfVetoes ? 'No vetoes left this week' : `${currentVoter.vetoTokensRemaining} left · spins again`}
              </span>
            </Button>
            <Button
              variant="success"
              size="lg"
              onClick={() => voteYes(currentVoter.id, false)}
              disabled={currentBallot[currentVoter.id] === 'yes'}
              className="h-auto min-h-14 flex-col !gap-0 py-2"
            >
              <span className="flex items-center gap-1.5">
                <Check className="h-5 w-5" /> {currentVoter.name} says yes
              </span>
              <span className="text-[11px] font-medium opacity-85">
                {currentBallot[currentVoter.id] === 'yes'
                  ? 'Already voted'
                  : yesVotesCount + 1 >= majorityNeeded
                    ? 'This agrees dinner'
                    : `${yesVotesCount + 1} of ${majorityNeeded} yes`}
              </span>
            </Button>
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 px-1">
            <Button variant="quiet" size="sm" onClick={() => voteYes(currentVoter.id, true)}>
              Skip the vote and cook this
            </Button>
            <Button variant="quiet" size="sm" onClick={handleCopy}>
              {copied ? <Check className="h-4 w-4 text-sage" /> : <Copy className="h-4 w-4" />}
              {copied ? 'Copied' : 'Copy for group chat'}
            </Button>
          </div>

          {confirmLocalCancel ? (
            <div role="alertdialog" aria-label="Cancel the vote?" className="space-y-2 rounded-xl border border-tomato/25 bg-tomato-soft/40 p-3">
              <p className="text-[14px] font-semibold">Cancel the vote on {meal.title}? Votes so far are cleared.</p>
              <div className="grid grid-cols-2 gap-2">
                <Button variant="secondary" size="sm" disabled={cancelling} onClick={() => setConfirmLocalCancel(false)}>
                  Keep voting
                </Button>
                <Button variant="danger" size="sm" disabled={cancelling} onClick={cancel}>
                  {cancelling ? 'Cancelling…' : 'Yes, cancel the vote'}
                </Button>
              </div>
            </div>
          ) : (
            <Button variant="quiet" size="sm" onClick={() => setConfirmLocalCancel(true)}>
              <X className="h-4 w-4" /> Cancel vote
            </Button>
          )}

          <div className="flex items-center gap-3 rounded-xl bg-sunk px-4 py-3 text-[13px] text-ink-2">
            <span className="flex gap-1" aria-hidden="true">
              {[0, 1, 2].map((i) => (
                <span key={i} className={cx('h-2.5 w-2.5 rounded-full', i < consecutiveRejections ? 'bg-tomato' : 'border border-line-strong')} />
              ))}
            </span>
            <span>
              {consecutiveRejections === 0
                ? 'Three vetoes in a row and the kitchen closes for takeaway.'
                : `${consecutiveRejections} veto${consecutiveRejections > 1 ? 'es' : ''} in a row. ${3 - consecutiveRejections} more and it’s takeaway.`}
            </span>
          </div>
        </>
      )}

      <div className="border-t border-line pt-3">
        <button
          onClick={() => setShowRoster((v) => !v)}
          aria-expanded={showRoster}
          className="text-[14px] font-semibold text-ink-2 hover:text-ink"
        >
          {showRoster ? 'Done editing household' : 'Edit household'}
        </button>
        {showRoster && (
          <div className="fade-up mt-3 space-y-3">
            <ul className="divide-y divide-line rounded-xl border border-line bg-card">
              {householdMembers.map((m) => (
                <li key={m.id} className="flex items-center gap-3 px-3 py-2">
                  <MemberAvatar member={m} size={28} />
                  <span className="flex-1 text-[14px]">{m.name}</span>
                  {householdMembers.length > 1 && (
                    <button
                      onClick={() => removeHouseholdMember(m.id)}
                      aria-label={`Remove ${m.name}`}
                      className="rounded-lg p-2 text-ink-3 hover:bg-sunk hover:text-tomato"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  )}
                </li>
              ))}
            </ul>
            <form
              className="flex gap-2"
              onSubmit={(e) => {
                e.preventDefault();
                if (!newMemberName.trim()) return;
                addHouseholdMember(newMemberName, '');
                setNewMemberName('');
              }}
            >
              <TextInput
                value={newMemberName}
                onChange={(e) => setNewMemberName(e.target.value)}
                placeholder="Add someone"
                aria-label="New household member name"
              />
              <Button type="submit" variant="secondary" disabled={!newMemberName.trim()}>
                <UserPlus className="h-4 w-4" /> Add
              </Button>
            </form>
            <Button variant="quiet" size="sm" onClick={resetVetoTokens}>
              <RotateCcw className="h-3.5 w-3.5" /> New week: give everyone 3 vetoes
            </Button>
          </div>
        )}
      </div>
    </div>
  );
};
