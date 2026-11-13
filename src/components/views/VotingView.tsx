import React, { useState } from 'react';
import { useDinner } from '../../context/DinnerContext';
import { Check, X, Copy, UserPlus, Trash2, CircleAlert, RotateCcw, Dices, Clock } from 'lucide-react';
import confetti from 'canvas-confetti';
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
  } = useDinner();

  const [copied, setCopied] = useState(false);
  const [vetoError, setVetoError] = useState<string | null>(null);
  const [servings, setServings] = useState<'2' | '4' | '6' | '8'>('4');
  const [showRoster, setShowRoster] = useState(false);
  const [newMemberName, setNewMemberName] = useState('');

  const currentVoter = householdMembers[activeVoterIndex] || householdMembers[0];
  const yesVotesCount = Object.values(currentBallot).filter((v) => v === 'yes').length;
  const majorityNeeded = Math.max(1, Math.ceil(householdMembers.length / 2));

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
  const scale = Number(servings) / 4;

  // ---------- Empty state ----------
  if (!proposedMeal && !agreedMeal) {
    return (
      <div className="flex flex-col items-center px-4 py-16 text-center">
        <Clock className="h-8 w-8 text-ink-3" strokeWidth={1.5} />
        <h1 className="mt-4 font-display text-[26px] font-semibold">Nothing on the table yet</h1>
        <p className="mt-2 max-w-[280px] text-[15px] text-ink-2">
          Spin for a dish, then put it to the household here.
        </p>
        <Button variant="primary" className="mt-6" onClick={() => setActiveView(0)}>
          <Dices className="h-4 w-4" /> Go to the spinner
        </Button>
      </div>
    );
  }

  // ---------- Agreed: timeline ----------
  if (agreedMeal) {
    return (
      <div className="space-y-4">
        <div>
          <div className="flex items-center justify-between gap-2">
            <Chip tone="sage">
              <Check className="h-3 w-3" /> Agreed for tonight
            </Chip>
            {!loggedEntry && (
              <button onClick={() => setAgreedMeal(null)} className="text-[13px] font-semibold text-ink-2 hover:text-ink">
                Reopen the vote
              </button>
            )}
          </div>
          <h1 className="mt-2 font-display text-[28px] leading-tight font-semibold">{agreedMeal.title}</h1>
          <p className="mt-1 text-[14px] text-ink-2">{agreedMeal.description}</p>
        </div>

        {loggedEntry ? (
          <Card className="fade-up p-5 text-center">
            <p className="font-display text-[22px] font-semibold">Enjoy it.</p>
            <p className="mt-1 text-[14px] text-ink-2">
              Logged to your history
              {loggedEntry.rescued.length > 0
                ? `, and ${loggedEntry.rescued.join(', ')} ${loggedEntry.rescued.length === 1 ? 'is' : 'are'} off the use-next list.`
                : '.'}
            </p>
            <div className="mt-4 flex flex-col gap-2">
              <Button variant="primary" block onClick={resetEvening}>
                <RotateCcw className="h-4 w-4" /> Start a new evening
              </Button>
              <Button variant="quiet" block onClick={() => setActiveView(4)}>
                Rate it in Stats
              </Button>
            </div>
          </Card>
        ) : (
          <>
            <Card className="grid grid-cols-[auto_1fr] items-center gap-x-4 gap-y-3 p-4">
              <label htmlFor="eat-at" className="text-[14px] font-semibold">
                Eat at
              </label>
              <input
                id="eat-at"
                type="time"
                value={targetEatingTime}
                onChange={(e) => handleTimeChange(e.target.value)}
                className="h-11 w-full rounded-xl border border-line bg-paper px-3 text-[17px] font-semibold tabular-nums focus:border-ink-2 focus:outline-none"
              />
              <span className="text-[14px] font-semibold">Serves</span>
              <Segmented<'2' | '4' | '6' | '8'>
                label="Servings"
                size="sm"
                value={servings}
                onChange={setServings}
                options={['2', '4', '6', '8'].map((n) => ({ value: n as '2' | '4' | '6' | '8', label: n }))}
              />
            </Card>

            <section aria-labelledby="timeline-h">
              <div className="mb-2 flex items-baseline justify-between px-1">
                <h2 id="timeline-h" className="text-[15px] font-semibold">
                  Timeline
                </h2>
                <span className="text-[13px] text-ink-2 tabular-nums">
                  {doneCount} of {reverseTimers.length} done
                </span>
              </div>
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
                Ingredients{scale !== 1 && <span className="font-normal text-ink-2"> · scale recipe ×{scale}</span>}
              </h2>
              <ul className="flex flex-wrap gap-1.5">
                {agreedMeal.ingredients.map((ing, i) => (
                  <li key={i}>
                    <Chip tone="outline">{ing}</Chip>
                  </li>
                ))}
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
  const voterOutOfVetoes = currentVoter.vetoTokensRemaining <= 0;

  return (
    <div className="space-y-4">
      <div>
        <p className="eyebrow">Proposed for tonight</p>
        <h1 className="mt-1 font-display text-[28px] leading-tight font-semibold">{meal.title}</h1>
        <p className="mt-1 text-[13px] text-ink-2">
          {timeLabel(meal.timeStake)} · {effortLabel(meal.effort)} · {meal.cuisine}
        </p>
        <p className="mt-2 text-[14px] text-ink-2">{meal.description}</p>
      </div>

      <Card className="p-4">
        <div className="flex items-baseline justify-between">
          <h2 className="text-[15px] font-semibold">Who’s voting?</h2>
          <span className="text-[13px] text-ink-2 tabular-nums">
            {yesVotesCount} of {majorityNeeded} yes needed
          </span>
        </div>
        <div className="mt-3 grid auto-cols-[minmax(72px,1fr)] grid-flow-col gap-2 overflow-x-auto pb-1 scrollbar-none" role="radiogroup" aria-label="Voter">
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
          className="flex-col !gap-0"
        >
          <span className="flex items-center gap-1.5">
            <X className="h-5 w-5" /> Veto
          </span>
          <span id="veto-hint" className="text-[11px] font-medium text-ink-3">
            {voterOutOfVetoes ? 'None left this week' : `${currentVoter.vetoTokensRemaining} left · respins`}
          </span>
        </Button>
        <Button variant="success" size="lg" onClick={() => voteYes(currentVoter.id, false)} className="flex-col !gap-0">
          <span className="flex items-center gap-1.5">
            <Check className="h-5 w-5" /> Yes
          </span>
          <span className="text-[11px] font-medium opacity-85">
            {yesVotesCount + 1 >= majorityNeeded ? 'Agrees dinner' : `as ${currentVoter.name}`}
          </span>
        </Button>
      </div>

      <div className="flex items-center justify-between gap-2 px-1">
        <button
          onClick={() => voteYes(currentVoter.id, true)}
          className="text-[14px] font-semibold text-ink-2 underline-offset-2 hover:text-ink hover:underline"
        >
          Just decide. Skip the vote
        </button>
        <button
          onClick={handleCopy}
          className="inline-flex items-center gap-1.5 text-[14px] font-semibold text-ink-2 hover:text-ink"
        >
          {copied ? <Check className="h-4 w-4 text-sage" /> : <Copy className="h-4 w-4" />}
          {copied ? 'Copied' : 'Copy for group chat'}
        </button>
      </div>

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
