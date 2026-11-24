import React, { useState } from 'react';
import { Check, Minus, Plus, Refrigerator, Snowflake } from 'lucide-react';
import { useDinner } from '../context/DinnerContext';
import { CookLogEntry } from '../types';
import { MAX_LEFTOVER_PORTIONS, defaultPortions, keepDaysFor } from '../utils/leftovers';
import { Button, Card } from './ui';

/** After dinner: "Made extra?" Sends the rest to the fridge (use next, with an eat-by date) or the freezer. */
export const LeftoversStep: React.FC<{ entry: CookLogEntry }> = ({ entry }) => {
  const { meals, saveLeftovers } = useDinner();
  const meal = meals.find((m) => m.id === entry.mealId);
  const [portions, setPortions] = useState(() => defaultPortions(meal));

  if (entry.leftovers) {
    const { route, portions: n } = entry.leftovers;
    return (
      <Card className="fade-up flex items-center gap-2.5 p-4 text-[14px]">
        <Check className="h-4 w-4 shrink-0 text-sage" />
        <span>
          {n} {n === 1 ? 'portion' : 'portions'} of leftovers {route === 'freezer' ? 'in the freezer.' : 'in the fridge, marked use next.'}
        </span>
      </Card>
    );
  }

  const days = keepDaysFor(meal);
  return (
    <Card className="fade-up space-y-3 p-4">
      <div>
        <h2 className="text-[15px] font-semibold">Made extra?</h2>
        <p className="text-[13px] text-ink-2">Keep the rest so it gets eaten instead of binned.</p>
      </div>
      <div className="flex items-center justify-between">
        <span className="text-[14px] font-medium">Portions left</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            aria-label="One fewer portion"
            disabled={portions <= 1}
            onClick={() => setPortions((p) => Math.max(1, p - 1))}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-line disabled:opacity-40"
          >
            <Minus className="h-4 w-4" />
          </button>
          <span className="w-6 text-center font-display text-[20px] font-semibold tabular-nums" aria-live="polite">
            {portions}
          </span>
          <button
            type="button"
            aria-label="One more portion"
            disabled={portions >= MAX_LEFTOVER_PORTIONS}
            onClick={() => setPortions((p) => Math.min(MAX_LEFTOVER_PORTIONS, p + 1))}
            className="flex h-10 w-10 items-center justify-center rounded-xl border border-line disabled:opacity-40"
          >
            <Plus className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button variant="secondary" onClick={() => saveLeftovers(entry.id, 'fridge', portions)}>
          <Refrigerator className="h-4 w-4" /> Keep in fridge
        </Button>
        <Button variant="secondary" onClick={() => saveLeftovers(entry.id, 'freezer', portions)}>
          <Snowflake className="h-4 w-4" /> Freeze it
        </Button>
      </div>
      <p className="text-[12px] text-ink-3">Fridge leftovers are marked use next and eat within {days} days. Cool food quickly before it goes in either.</p>
    </Card>
  );
};
