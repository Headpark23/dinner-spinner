import React, { useEffect, useRef, useState } from 'react';
import { useDinner } from '../context/DinnerContext';
import { Lock, ChevronDown, Dices, RotateCcw } from 'lucide-react';
import confetti from 'canvas-confetti';
import { COMBO_HEADERS } from '../data/initialData';
import { photoFor } from '../data/photos';
import { Button, DishTile, cx, timeLabel, effortLabel } from './ui';
import { costText, costPerHeadText } from '../utils/cost';

interface ReelWindowProps {
  onSpin: () => void;
}

const REEL_HEADERS = COMBO_HEADERS;

const prefersReducedMotion = () =>
  typeof window !== 'undefined' &&
  window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;

/** A vertical strip of labels that rolls while spinning. */
const RollingStrip: React.FC<{ labels: string[]; className?: string; itemClass?: string }> = ({
  labels,
  className,
  itemClass,
}) => {
  const doubled = [...labels, ...labels];
  return (
    <div className={cx('reel-rolling', className)} aria-hidden="true">
      {doubled.map((label, i) => (
        <div key={i} className={cx('flex items-center justify-center truncate', itemClass)}>
          {label}
        </div>
      ))}
    </div>
  );
};

export const ReelWindow: React.FC<ReelWindowProps> = ({ onSpin }) => {
  const {
    mode,
    isSpinning,
    activeMealResult,
    customReelResult,
    heldReels,
    toggleHold,
    nudgesRemaining,
    useNudge: nudgeReel,
    resetNudges,
    meals,
    eligiblePool,
    costToBuy,
    costEach,
    comboReels,
    activeView,
    toggleSound,
  } = useDinner();

  const [leverPulled, setLeverPulled] = useState(false);
  const wasSpinning = useRef(false);

  // Celebrate only when a spin lands on a five-star dish (never on load or on edits).
  useEffect(() => {
    if (wasSpinning.current && !isSpinning && activeMealResult?.rating === 5 && !prefersReducedMotion()) {
      try {
        confetti({
          particleCount: 44,
          spread: 72,
          startVelocity: 28,
          origin: { y: 0.45 },
          colors: ['#cfa65b', '#b83722', '#336244', '#f6eedf'],
          disableForReducedMotion: true,
        });
      } catch {
        // Confetti is decorative; ignore failures (e.g. headless tests).
      }
    }
    wasSpinning.current = isSpinning;
  }, [isSpinning, activeMealResult]);

  // Cabinet keyboard shortcuts. Ignored while typing, on focused controls, or with a dialog open.
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (
        tag === 'INPUT' ||
        tag === 'TEXTAREA' ||
        tag === 'SELECT' ||
        target?.isContentEditable ||
        e.metaKey ||
        e.ctrlKey ||
        e.altKey ||
        document.querySelector('[role="dialog"]')
      ) {
        return;
      }
      const onSpinner = activeView === 0;
      if (e.code === 'Space' && onSpinner) {
        if (tag === 'BUTTON') return;
        e.preventDefault();
        handleLeverPull();
      } else if (e.key.toLowerCase() === 'n' && onSpinner) {
        e.preventDefault();
        nudgeReel(0);
      } else if (e.key.toLowerCase() === 'm') {
        e.preventDefault();
        toggleSound();
      } else if (['1', '2', '3', '4'].includes(e.key) && onSpinner && mode !== 'single') {
        const idx = Number(e.key) - 1;
        if (mode === '3-reel' && idx > 2) return;
        toggleHold(idx);
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  });

  const handleLeverPull = () => {
    if (isSpinning) return;
    setLeverPulled(true);
    setTimeout(() => setLeverPulled(false), 450);
    onSpin();
  };

  const pool = eligiblePool.length > 0 ? eligiblePool : meals;
  const reelLists = mode === 'single' ? [] : comboReels[mode];

  // Neighbours on the single-reel drum, so the window reads as a physical reel.
  const currentIdx = pool.findIndex((m) => m.id === activeMealResult?.id);
  const prevMeal = activeMealResult && pool.length > 1 ? pool[(currentIdx - 1 + pool.length) % pool.length] : null;
  const nextMeal = activeMealResult && pool.length > 1 ? pool[(currentIdx + 1) % pool.length] : null;
  const activePhoto = activeMealResult ? activeMealResult.imageUrl || photoFor(activeMealResult.id) : undefined;

  const drumCaption =
    mode === 'single'
      ? `${pool.length} ${pool.length === 1 ? 'dish' : 'dishes'} on the reel`
      : mode === '3-reel'
      ? 'Mix a plate · 3 reels'
      : mode === '4-reel'
      ? 'Full plate · 4 reels'
      : 'Sunday roast · 4 reels';

  return (
    <div>
      <div className="cabinet-housing rounded-[26px] p-3.5 text-on-enamel ring-1 ring-brass/45">
        {/* Brushed brass & enamel nameplate strip */}
        <div className="mb-2.5 flex items-center justify-between px-1.5 text-[11.5px] tracking-wide text-on-enamel-2">
          <span className="flex items-center gap-2 font-medium" aria-live="polite">
            <span className={cx('h-1.5 w-1.5 rounded-full', isSpinning ? 'animate-pulse bg-tomato' : 'bg-brass')} />
            {isSpinning ? 'Spinning the drum…' : drumCaption}
          </span>
          <span className="flex items-center gap-1.5 font-medium" aria-label={`${nudgesRemaining} nudges left`}>
            <span className="text-[11px] uppercase tracking-[0.08em]">Nudges</span>
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={cx(
                  'h-2.5 w-2.5 rounded-full transition-all',
                  i < nudgesRemaining
                    ? 'bg-brass shadow-[0_0_8px_rgba(207,166,91,0.55)]'
                    : 'border border-on-enamel-2/40 bg-black/25'
                )}
              />
            ))}
          </span>
        </div>

        <div className="flex items-stretch gap-3">
          {/* Curved glass reel window */}
          <div className="reel-window relative min-w-0 flex-1 overflow-hidden rounded-[18px] ring-1 ring-brass/25">
            {/* Subtle convex glass reflection */}
            <div className="reel-glass-sheen pointer-events-none absolute inset-0 z-10" aria-hidden="true" />

            {/* Brass payline pointers & hairline */}
            <span className="pointer-events-none absolute top-1/2 inset-x-0 z-10 h-px -translate-y-1/2 bg-gradient-to-r from-brass/55 via-brass/12 to-brass/55" />
            <span className="pointer-events-none absolute top-1/2 left-0 z-10 h-0 w-0 -translate-y-1/2 border-y-[6px] border-l-[8px] border-y-transparent border-l-brass" />
            <span className="pointer-events-none absolute top-1/2 right-0 z-10 h-0 w-0 -translate-y-1/2 border-y-[6px] border-r-[8px] border-y-transparent border-r-brass" />

            {mode === 'single' ? (
              <div className="reel-fade relative h-[164px] overflow-hidden px-4">
                {/* Warm ambient photo glow behind the settled dish */}
                {!isSpinning && activePhoto && (
                  <img
                    src={activePhoto}
                    alt=""
                    aria-hidden="true"
                    className="pointer-events-none absolute inset-0 h-full w-full scale-110 object-cover opacity-[0.16] blur-md"
                  />
                )}

                {isSpinning ? (
                  <RollingStrip
                    labels={pool.map((m) => m.title)}
                    itemClass="h-14 font-display text-[19px] text-on-enamel/85"
                  />
                ) : (
                  <div key={activeMealResult?.id} className="reel-settle relative z-1 flex h-full flex-col justify-between py-2.5 text-center">
                    <p className="truncate font-display text-[14px] text-on-enamel/28" aria-hidden="true">
                      {prevMeal?.title ?? '—'}
                    </p>
                    <div className="my-auto flex items-center justify-center gap-3 px-2">
                      {activeMealResult && (
                        <DishTile
                          cuisine={activeMealResult.cuisine}
                          imageUrl={activePhoto}
                          size={50}
                          className="hidden shrink-0 rounded-xl ring-1 ring-brass/40 shadow-md xs:inline-flex sm:inline-flex"
                        />
                      )}
                      <div className="min-w-0 text-center sm:text-left">
                        <p className="font-display text-[21px] leading-[1.15] font-semibold text-on-enamel line-clamp-2">
                          {activeMealResult?.title ?? 'Pull the lever'}
                        </p>
                        {activeMealResult && (
                          <p className="mt-1 truncate text-[12px] text-on-enamel-2">
                            {timeLabel(activeMealResult.timeStake)} · {effortLabel(activeMealResult.effort)} ·{' '}
                            {activeMealResult.cuisine} · {costText(costToBuy(activeMealResult))} ·{' '}
                            {costPerHeadText(costEach(activeMealResult))}
                          </p>
                        )}
                      </div>
                    </div>
                    <p className="truncate font-display text-[14px] text-on-enamel/28" aria-hidden="true">
                      {nextMeal?.title ?? '—'}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="grid h-[142px] divide-x divide-brass/20"
                style={{ gridTemplateColumns: `repeat(${reelLists.length}, minmax(0, 1fr))` }}
              >
                {reelLists.map((list, idx) => {
                  const isHeld = heldReels[idx];
                  const rolling = isSpinning && !isHeld;
                  return (
                    <div key={idx} className="reel-fade relative overflow-hidden">
                      {isHeld && (
                        <span className="absolute top-2 left-1/2 z-20 -translate-x-1/2 rounded-full bg-brass px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-enamel shadow-sm">
                          Held
                        </span>
                      )}
                      {rolling ? (
                        <RollingStrip
                          labels={list.map((i) => i.label)}
                          className="px-1.5"
                          itemClass="h-12 text-center font-display text-[14px] leading-tight text-on-enamel/80 whitespace-normal"
                        />
                      ) : (
                        <div
                          key={customReelResult[idx]}
                          className="reel-settle relative z-1 flex h-full flex-col items-center justify-center px-1.5 text-center"
                        >
                          <span className="text-[10px] font-semibold uppercase tracking-[0.09em] text-brass/90">
                            {REEL_HEADERS[mode][idx]}
                          </span>
                          <span
                            className={cx(
                              'mt-1.5 font-display font-semibold leading-tight text-on-enamel line-clamp-3',
                              mode === '3-reel' ? 'text-[15px]' : 'text-[12.5px]'
                            )}
                          >
                            {customReelResult[idx]}
                          </span>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Physical espresso-machine lever */}
          <button
            onClick={handleLeverPull}
            disabled={isSpinning}
            aria-label="Pull the lever to spin"
            title="Pull the lever (Space)"
            className="group flex w-9 shrink-0 flex-col items-center justify-start pt-1.5 disabled:cursor-not-allowed"
          >
            <span
              className={cx(
                'h-7 w-7 rounded-full bg-tomato ring-1 ring-brass/40 shadow-[inset_-3px_-4px_6px_rgba(0,0,0,0.42),inset_2px_2px_4px_rgba(255,255,255,0.38),0_3px_8px_rgba(0,0,0,0.4)] transition-transform duration-300 ease-out',
                leverPulled ? 'translate-y-[78px]' : 'group-hover:-translate-y-0.5'
              )}
            />
            <span
              className={cx(
                'w-1.5 rounded-b-sm bg-gradient-to-r from-[#877c6f] via-[#e5dccf] to-[#877c6f] transition-all duration-300 ease-out',
                leverPulled ? 'h-3' : 'h-[82px]'
              )}
            />
            <span className="h-2.5 w-4 rounded-full bg-brass/70 shadow-inner" aria-hidden="true" />
          </button>
        </div>

        {/* Hold & nudge controls integrated into the cabinet deck */}
        {mode === 'single' ? (
          <div className="mt-3 flex items-center justify-between gap-2 px-1">
            <p className="text-[12px] text-on-enamel-2">Not quite the mood tonight?</p>
            {nudgesRemaining > 0 ? (
              <button
                onClick={() => nudgeReel(0)}
                disabled={isSpinning}
                className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl bg-white/10 px-3.5 text-[13px] font-semibold text-on-enamel ring-1 ring-brass/25 transition-colors hover:bg-white/16 disabled:opacity-40"
              >
                <ChevronDown className="h-4 w-4 text-brass" /> Nudge next
              </button>
            ) : (
              <button
                onClick={resetNudges}
                className="inline-flex h-10 shrink-0 items-center gap-1 rounded-xl px-3 text-[13px] font-semibold text-brass hover:bg-white/8"
              >
                <RotateCcw className="h-3.5 w-3.5" /> Refill nudges
              </button>
            )}
          </div>
        ) : (
          <div
            className="mt-3 grid gap-1.5"
            style={{ gridTemplateColumns: `repeat(${reelLists.length}, minmax(0, 1fr))` }}
          >
            {reelLists.map((_, idx) => {
              const isHeld = heldReels[idx];
              return (
                <div key={idx} className="flex gap-1">
                  <button
                    onClick={() => toggleHold(idx)}
                    disabled={isSpinning}
                    aria-pressed={isHeld}
                    aria-label={`Hold ${REEL_HEADERS[mode][idx]} reel`}
                    className={cx(
                      'inline-flex h-10 min-w-0 flex-1 items-center justify-center gap-1 rounded-xl text-[12.5px] font-semibold transition-colors disabled:opacity-40',
                      isHeld
                        ? 'bg-brass text-enamel shadow-sm'
                        : 'bg-white/8 text-on-enamel ring-1 ring-white/15 hover:bg-white/14'
                    )}
                  >
                    {isHeld ? <Lock className="h-3.5 w-3.5" /> : null}
                    {isHeld ? 'Held' : 'Hold'}
                  </button>
                  <button
                    onClick={() => nudgeReel(idx)}
                    disabled={nudgesRemaining <= 0 || isSpinning}
                    aria-label={`Nudge ${REEL_HEADERS[mode][idx]} reel to the next choice`}
                    title="Nudge to the next choice"
                    className="inline-flex h-10 w-9 shrink-0 items-center justify-center rounded-xl bg-white/8 text-on-enamel-2 ring-1 ring-white/15 hover:bg-white/14 hover:text-on-enamel disabled:opacity-30"
                  >
                    <ChevronDown className="h-4 w-4" />
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Unmistakable tactile Spin CTA directly beneath the cabinet */}
      <Button variant="primary" size="lg" block onClick={handleLeverPull} disabled={isSpinning} className="mt-3 text-[17px]">
        <Dices className={cx('h-5 w-5', isSpinning && 'animate-spin')} strokeWidth={2} />
        {isSpinning ? 'Spinning…' : 'Spin for dinner'}
        <kbd className="ml-1 hidden rounded-md bg-white/18 px-1.5 py-0.5 text-[11px] font-medium lg:inline">Space</kbd>
      </Button>
      {mode !== 'single' && nudgesRemaining === 0 && (
        <button
          onClick={resetNudges}
          className="mx-auto mt-2 flex items-center gap-1 text-[13px] font-semibold text-ink-2 hover:text-ink"
        >
          <RotateCcw className="h-3.5 w-3.5" /> Refill nudges
        </button>
      )}
    </div>
  );
};
