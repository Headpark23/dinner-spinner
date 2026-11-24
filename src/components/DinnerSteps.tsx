import React from 'react';
import { Check, ArrowRight } from 'lucide-react';
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

/** The whole evening on one slim line, so the app always answers "what am I doing and what's next?" */
export const DinnerSteps: React.FC = () => {
  const { activeView, setActiveView } = useDinner();
  const stage = useDinnerStage();
  const stageIdx = STEPS.findIndex((s) => s.id === stage);
  const viewingIdx = activeView === 0 ? 0 : stageIdx;

  return (
    <ol className="flex items-center rounded-2xl bg-sunk p-1" aria-label="Tonight’s dinner, in four steps">
      {STEPS.map((step, i) => {
        const done = i < stageIdx;
        const current = i === stageIdx;
        const reachable = i === 0 || i <= stageIdx;
        const viewing = i === viewingIdx;
        return (
          <li key={step.id} className="min-w-0 flex-1">
            <button
              disabled={!reachable}
              onClick={() => setActiveView(i === 0 ? 0 : 3)}
              aria-current={viewing ? 'step' : undefined}
              className={cx(
                'flex h-10 w-full items-center justify-center gap-1.5 rounded-xl text-[13px] transition-colors disabled:cursor-default',
                viewing ? 'bg-card font-bold text-ink shadow-[0_1px_2px_rgba(31,26,21,0.14)]' : 'font-medium text-ink-2'
              )}
            >
              <span
                className={cx(
                  'flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-bold',
                  done && 'bg-sage text-white',
                  current && 'bg-tomato text-white',
                  !done && !current && 'border border-line-strong text-ink-3'
                )}
              >
                {done ? <Check className="h-3 w-3" strokeWidth={3.5} /> : i + 1}
              </span>
              {step.label}
            </button>
          </li>
        );
      })}
    </ol>
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
