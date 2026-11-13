import React, { useEffect, useRef, useState } from 'react';
import { useDinner } from '../context/DinnerContext';
import { Lock, ChevronDown, Dices, RotateCcw } from 'lucide-react';
import confetti from 'canvas-confetti';
import {
  REEL_CARBS,
  REEL_PROTEINS,
  REEL_SAUCES,
  SUNDAY_MEATS,
  SUNDAY_POTATOES,
  SUNDAY_STAR_SIDES,
  SUNDAY_VEG_GRAVY,
} from '../data/initialData';
import { Button, cx, timeLabel, effortLabel } from './ui';
import { getSpinMotionPlan, prefersReducedMotion } from '../utils/motion';

interface ReelWindowProps {
  onSpin: () => void;
}

const REEL_HEADERS: Record<'3-reel' | 'sunday', string[]> = {
  '3-reel': ['Base', 'Main', 'Sauce'],
  sunday: ['Roast', 'Potatoes', 'Side', 'Veg & gravy'],
};

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
          particleCount: 40,
          spread: 70,
          startVelocity: 28,
          origin: { y: 0.45 },
          colors: ['#c7a15a', '#b93a26', '#3d6a4c', '#f3ead9'],
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
        if (tag === 'BUTTON') return; // let Space press the focused button instead
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
    const motion = getSpinMotionPlan(450, prefersReducedMotion());
    if (motion.animateLever) {
      setLeverPulled(true);
      setTimeout(() => setLeverPulled(false), motion.durationMs);
    }
    onSpin();
  };

  const pool = eligiblePool.length > 0 ? eligiblePool : meals;
  const reelLists =
    mode === '3-reel'
      ? [REEL_CARBS, REEL_PROTEINS, REEL_SAUCES]
      : [SUNDAY_MEATS, SUNDAY_POTATOES, SUNDAY_STAR_SIDES, SUNDAY_VEG_GRAVY];

  // Neighbours on the single-reel drum, so the window reads as a physical reel.
  const currentIdx = pool.findIndex((m) => m.id === activeMealResult?.id);
  const prevMeal = pool.length > 1 ? pool[(currentIdx - 1 + pool.length) % pool.length] : null;
  const nextMeal = pool.length > 1 ? pool[(currentIdx + 1) % pool.length] : null;

  const drumCaption =
    mode === 'single'
      ? `${pool.length} ${pool.length === 1 ? 'dish' : 'dishes'} on the reel`
      : mode === '3-reel'
      ? 'Build a plate · 3 reels'
      : 'Sunday roast · 4 reels';

  return (
    <div>
      <div className="reel-housing rounded-[22px] bg-enamel p-3 text-on-enamel">
        {/* Status strip */}
        <div className="mb-2.5 flex items-center justify-between px-1 text-[12px] text-on-enamel-2">
          <span aria-live="polite">{isSpinning ? 'Spinning…' : drumCaption}</span>
          <span className="flex items-center gap-1.5" aria-label={`${nudgesRemaining} nudges left`}>
            Nudges
            {[0, 1, 2].map((i) => (
              <span
                key={i}
                className={cx(
                  'h-2 w-2 rounded-full',
                  i < nudgesRemaining ? 'bg-brass' : 'border border-on-enamel-2/50'
                )}
              />
            ))}
          </span>
        </div>

        <div className="flex items-stretch gap-2.5">
          {/* The reel window */}
          <div className="reel-window relative min-w-0 flex-1 overflow-hidden rounded-2xl">
            {/* Payline markers */}
            <span className="pointer-events-none absolute top-1/2 left-0 z-10 h-0 w-0 -translate-y-1/2 border-y-[6px] border-l-[7px] border-y-transparent border-l-brass" />
            <span className="pointer-events-none absolute top-1/2 right-0 z-10 h-0 w-0 -translate-y-1/2 border-y-[6px] border-r-[7px] border-y-transparent border-r-brass" />

            {mode === 'single' ? (
              <div className="reel-fade relative h-[150px] overflow-hidden px-5">
                {isSpinning ? (
                  <RollingStrip
                    labels={pool.map((m) => m.title)}
                    itemClass="h-14 font-display text-[19px] text-on-enamel/80"
                  />
                ) : (
                  <div key={activeMealResult?.id} className="reel-settle flex h-full flex-col justify-center text-center">
                    <p className="truncate font-display text-[15px] text-on-enamel/30" aria-hidden="true">
                      {prevMeal?.title}
                    </p>
                    <div className="py-2">
                      <p className="font-display text-[22px] leading-tight font-semibold text-on-enamel line-clamp-2">
                        {activeMealResult?.title ?? 'Pull the lever'}
                      </p>
                      {activeMealResult && (
                        <p className="mt-1 text-[12px] text-on-enamel-2">
                          {timeLabel(activeMealResult.timeStake)} · {effortLabel(activeMealResult.effort)} ·{' '}
                          {activeMealResult.cuisine}
                        </p>
                      )}
                    </div>
                    <p className="truncate font-display text-[15px] text-on-enamel/30" aria-hidden="true">
                      {nextMeal?.title}
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div
                className="grid h-[150px] divide-x divide-white/10"
                style={{ gridTemplateColumns: `repeat(${reelLists.length}, minmax(0, 1fr))` }}
              >
                {reelLists.map((list, idx) => {
                  const isHeld = heldReels[idx];
                  const rolling = isSpinning && !isHeld;
                  return (
                    <div key={idx} className="reel-fade relative overflow-hidden">
                      {isHeld && (
                        <span className="absolute top-2 left-1/2 z-10 -translate-x-1/2 rounded-full bg-brass px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wider text-enamel">
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
                          className="reel-settle flex h-full flex-col items-center justify-center px-1.5 text-center"
                        >
                          <span className="text-[10px] font-semibold uppercase tracking-[0.08em] text-on-enamel-2">
                            {REEL_HEADERS[mode][idx]}
                          </span>
                          <span
                            className={cx(
                              'mt-1.5 font-display font-semibold leading-tight text-on-enamel line-clamp-3',
                              mode === 'sunday' ? 'text-[13px]' : 'text-[15px]'
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

          {/* The lever */}
          <button
            onClick={handleLeverPull}
            disabled={isSpinning}
            aria-label="Pull the lever to spin"
            title="Pull the lever (Space)"
            className="group flex w-9 shrink-0 flex-col items-center justify-start pt-1 disabled:cursor-not-allowed"
          >
            <span
              className={cx(
                'h-7 w-7 rounded-full bg-tomato shadow-[inset_-3px_-4px_6px_rgba(0,0,0,0.35),inset_2px_2px_4px_rgba(255,255,255,0.35)] transition-transform duration-300 ease-out',
                leverPulled ? 'translate-y-[70px]' : 'group-hover:-translate-y-0.5'
              )}
            />
            <span
              className={cx(
                'w-1.5 rounded-b-sm bg-gradient-to-r from-[#8d8478] via-[#d8d0c4] to-[#8d8478] transition-all duration-300 ease-out',
                leverPulled ? 'h-2' : 'h-[74px]'
              )}
            />
            <span className="mt-auto h-6 w-6 rounded-md bg-enamel-2 ring-1 ring-white/10" />
          </button>
        </div>

        {/* Hold & nudge controls */}
        {mode === 'single' ? (
          <div className="mt-3 flex items-center justify-between gap-2 px-1">
            <p className="text-[12px] text-on-enamel-2">Not quite right?</p>
            {nudgesRemaining > 0 ? (
              <button
                onClick={() => nudgeReel(0)}
                disabled={isSpinning}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg bg-white/8 px-3 text-[13px] font-semibold text-on-enamel ring-1 ring-white/15 hover:bg-white/12 disabled:opacity-40"
              >
                <ChevronDown className="h-4 w-4" /> Nudge
              </button>
            ) : (
              <button
                onClick={resetNudges}
                className="inline-flex h-9 shrink-0 items-center gap-1 rounded-lg px-3 text-[13px] font-semibold text-brass hover:bg-white/8"
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
                <div key={idx} className="flex flex-col gap-1.5">
                  <button
                    onClick={() => toggleHold(idx)}
                    disabled={isSpinning}
                    aria-pressed={isHeld}
                    aria-label={`Hold ${REEL_HEADERS[mode][idx]} reel`}
                    className={cx(
                      'inline-flex h-9 items-center justify-center gap-1 rounded-lg text-[13px] font-semibold transition-colors disabled:opacity-40',
                      isHeld
                        ? 'bg-brass text-enamel'
                        : 'bg-white/8 text-on-enamel ring-1 ring-white/15 hover:bg-white/12'
                    )}
                  >
                    {isHeld && <Lock className="h-3.5 w-3.5" />}
                    {isHeld ? 'Held' : 'Hold'}
                  </button>
                  <button
                    onClick={() => nudgeReel(idx)}
                    disabled={nudgesRemaining <= 0 || isSpinning}
                    aria-label={`Nudge ${REEL_HEADERS[mode][idx]} reel`}
                    className="inline-flex h-8 items-center justify-center gap-0.5 rounded-lg text-[12px] font-medium text-on-enamel-2 hover:bg-white/8 hover:text-on-enamel disabled:opacity-30 disabled:hover:bg-transparent"
                  >
                    <ChevronDown className="h-3.5 w-3.5" /> Nudge
                  </button>
                </div>
              );
            })}
          </div>
        )}
      </div>

      <Button variant="primary" size="lg" block onClick={handleLeverPull} disabled={isSpinning} className="mt-3">
        <Dices className={cx('h-5 w-5', isSpinning && 'animate-spin')} strokeWidth={2} />
        {isSpinning ? 'Spinning…' : 'Spin'}
        <kbd className="ml-1 hidden rounded-md bg-white/15 px-1.5 py-0.5 text-[11px] font-medium lg:inline">Space</kbd>
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
