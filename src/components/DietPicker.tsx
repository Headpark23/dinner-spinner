import React from 'react';
import { Check } from 'lucide-react';
import { DIETS, DietId } from '../utils/diets';
import { cx } from './ui';

/** Dietary preferences as toggle chips, with an honest note about what they can and can't catch. */
export const DietPicker: React.FC<{ value: DietId[]; onToggle: (id: DietId) => void }> = ({ value, onToggle }) => (
  <div className="space-y-2">
    <div className="flex flex-wrap gap-2" role="group" aria-label="Dietary preferences">
      {DIETS.map((d) => {
        const on = value.includes(d.id);
        return (
          <button
            key={d.id}
            type="button"
            aria-pressed={on}
            onClick={() => onToggle(d.id)}
            className={cx(
              'inline-flex min-h-11 items-center gap-1.5 rounded-xl border px-3.5 text-[14px] font-semibold transition-colors',
              on ? 'border-ink bg-ink text-paper' : 'border-line bg-card text-ink hover:border-line-strong'
            )}
          >
            {on && <Check className="h-3.5 w-3.5" strokeWidth={3} />}
            {d.label}
          </button>
        );
      })}
    </div>
    <p className="text-[13px] text-ink-2">
      A best guess from ingredient names. It can’t see hidden ingredients like stock cubes or sauces, so for allergies
      always check the recipe and labels yourself. Dishes from “3 reels” and “Sunday roast” aren’t filtered.
    </p>
  </div>
);
