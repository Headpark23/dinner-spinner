import React from 'react';
import { ArrowRight, Check } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { photoFor } from '../data/photos';
import { DishTile, cx } from './ui';

export type DinnerStage = 'pick' | 'vote' | 'cook' | 'rate';

const STEPS: { id: DinnerStage; label: string }[] = [
  { id: 'pick', label: 'Pick' },
  { id: 'vote', label: 'Vote' },
  { id: 'cook', label: 'Cook' },
  { id: 'rate', label: 'Rate' },
];

/** Where tonight's dinner has got to, derived from real state, never stored separately. */
export const useDinnerStage = (): DinnerStage => {
  const { proposedMeal, agreedMeal, cookLog } = useDinner();
  const logged =
    agreedMeal &&
    cookLog.some((c) => c.mealId === agreedMeal.id && Date.now() - new Date(c.date).getTime() < 12 * 3600 * 1000);
  if (logged) return 'rate';
  if (agreedMeal) return 'cook';
  if (proposedMeal) return 'vote';
  return 'pick';
};

const STEP_HINT: Record<DinnerStage, string> = {
  pick: 'Pick tonight’s dinner',
  vote: 'Put it to a vote',
  cook: 'Cook it',
  rate: 'How was it?',
};

/**
 * Editorial evening progress strip: shows Pick -> Vote -> Cook -> Rate as a calm connected track.
 */
export const DinnerSteps: React.FC = () => {
  const stage = useDinnerStage();
  const idx = STEPS.findIndex((s) => s.id === stage);

  return (
    <div
      role="group"
      aria-label={`Tonight’s dinner: step ${idx + 1} of ${STEPS.length}, ${STEP_HINT[stage]}`}
      className="flex items-center justify-between gap-1 rounded-2xl border border-line/80 bg-card/75 px-3 py-2 select-none"
    >
      {STEPS.map((step, i) => {
        const done = i < idx;
        const current = i === idx;
        return (
          <React.Fragment key={step.id}>
            <div className="flex items-center gap-1.5">
              <span
                className={cx(
                  'flex h-5 w-5 items-center justify-center rounded-full text-[11px] font-bold tabular-nums',
                  done && 'bg-sage text-white',
                  current && 'bg-tomato text-white shadow-[0_1px_4px_rgba(184,55,34,0.4)]',
                  !done && !current && 'bg-sunk text-ink-3'
                )}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3} /> : i + 1}
              </span>
              <span
                className={cx(
                  'text-[12.5px] leading-none',
                  current ? 'font-semibold text-ink' : done ? 'font-medium text-sage' : 'text-ink-3'
                )}
              >
                {step.label}
              </span>
            </div>
            {i < STEPS.length - 1 && (
              <span
                aria-hidden="true"
                className={cx('h-px flex-1 mx-1', i < idx ? 'bg-sage/60' : 'bg-line-strong/60')}
              />
            )}
          </React.Fragment>
        );
      })}
    </div>
  );
};

/** On the Pick screen while a dish is already in play, show its thumbnail and offer one-tap return. */
export const InProgressBanner: React.FC = () => {
  const { activeView, setActiveView, proposedMeal, agreedMeal } = useDinner();
  const stage = useDinnerStage();
  if (activeView !== 0 || stage === 'pick') return null;
  const meal = agreedMeal ?? proposedMeal;
  if (!meal) return null;
  const label = stage === 'vote' ? 'Waiting for a vote' : stage === 'cook' ? 'Agreed · Time to cook' : 'Eaten · Rate tonight’s dinner';
  const photo = meal.imageUrl || photoFor(meal.id);

  return (
    <button
      onClick={() => setActiveView(3)}
      className="btn-primary-tactile fade-up flex w-full items-center gap-3 rounded-2xl p-3 text-left text-white"
    >
      <DishTile cuisine={meal.cuisine} imageUrl={photo} size={46} className="ring-1 ring-white/25" />
      <span className="min-w-0 flex-1">
        <span className="block text-[11.5px] font-semibold tracking-wide uppercase opacity-85">{label}</span>
        <span className="block truncate font-display text-[18px] leading-snug font-semibold">{meal.title}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 rounded-full bg-white/18 px-3 py-1.5 text-[13px] font-semibold">
        Open <ArrowRight className="h-3.5 w-3.5" />
      </span>
    </button>
  );
};
