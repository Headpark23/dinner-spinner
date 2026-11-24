import React from 'react';
import { ArrowRight } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { cx } from './ui';

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
 * Where tonight's dinner has got to. It is a progress line, not a set of buttons: nothing here can be tapped, so it
 * reads as information. (The Dinner tab and the banner below it are how you move between the screens.)
 */
export const DinnerSteps: React.FC = () => {
  const stage = useDinnerStage();
  const idx = STEPS.findIndex((s) => s.id === stage);
  const next = STEPS[idx + 1]?.label;

  return (
    <div role="group" aria-label={`Tonight’s dinner: step ${idx + 1} of ${STEPS.length}, ${STEP_HINT[stage]}`} className="select-none">
      <div className="flex items-baseline justify-between gap-2 text-[12px]">
        <p>
          <span className="font-semibold text-ink">
            Step {idx + 1} of {STEPS.length}
          </span>
          <span className="text-ink-2"> · {STEP_HINT[stage]}</span>
        </p>
        {next && <p className="text-ink-3">Then: {next}</p>}
      </div>
      <div className="mt-1.5 flex gap-1" aria-hidden="true">
        {STEPS.map((step, i) => (
          <span key={step.id} className={cx('h-1.5 flex-1 rounded-full', i < idx ? 'bg-sage' : i === idx ? 'bg-tomato' : 'bg-line')} />
        ))}
      </div>
    </div>
  );
};

/** On the Pick screen while a dish is already in play, say so and offer the way forward. */
export const InProgressBanner: React.FC = () => {
  const { activeView, setActiveView, proposedMeal, agreedMeal } = useDinner();
  const stage = useDinnerStage();
  if (activeView !== 0 || stage === 'pick') return null;
  const meal = agreedMeal ?? proposedMeal;
  if (!meal) return null;
  const label = stage === 'vote' ? 'Waiting for a vote' : stage === 'cook' ? 'Agreed. Time to cook' : 'Eaten. Rate it';
  return (
    <button
      onClick={() => setActiveView(3)}
      className="fade-up flex w-full items-center gap-3 rounded-2xl bg-tomato px-4 py-3 text-left text-white"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[12px] font-semibold opacity-85">{label}</span>
        <span className="block truncate font-display text-[17px] font-semibold">{meal.title}</span>
      </span>
      <span className="flex shrink-0 items-center gap-1 text-[14px] font-semibold">
        Continue <ArrowRight className="h-4 w-4" />
      </span>
    </button>
  );
};
