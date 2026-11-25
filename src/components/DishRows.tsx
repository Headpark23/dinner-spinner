import React from 'react';
import { Star } from 'lucide-react';
import { DishTile, cx } from './ui';
import type { Meal } from '../types';

/** Five small stars, read-only. Empty stars are outlined so "not rated yet" is clear at a glance. */
export const StarsInline: React.FC<{ value: number; className?: string }> = ({ value, className }) => (
  <span
    className={cx('inline-flex shrink-0 gap-0.5', className)}
    role="img"
    aria-label={value > 0 ? `${value} out of 5 stars` : 'Not rated yet'}
  >
    {[1, 2, 3, 4, 5].map((s) => (
      <Star key={s} className={cx('h-3.5 w-3.5', s <= value ? 'fill-saffron text-saffron' : 'text-line-strong')} strokeWidth={1.6} />
    ))}
  </span>
);

/** Big tappable stars for giving a rating. Tapping the current rating again clears it. */
export const RateStars: React.FC<{ value: number; label: string; onRate: (stars: number) => void }> = ({ value, label, onRate }) => (
  <div className="flex items-center gap-0.5" role="radiogroup" aria-label={label}>
    {[1, 2, 3, 4, 5].map((s) => (
      <button
        key={s}
        role="radio"
        aria-checked={value === s}
        aria-label={`${s} star${s > 1 ? 's' : ''}`}
        onClick={() => onRate(value === s ? 0 : s)}
        className="flex h-11 w-11 items-center justify-center rounded-xl transition-transform hover:bg-sunk active:scale-95"
      >
        <Star className={cx('h-7 w-7 transition-colors', s <= value ? 'fill-saffron text-saffron' : 'text-line-strong')} strokeWidth={1.6} />
      </button>
    ))}
  </div>
);

/**
 * One dish in a list: picture, serif name, a line of detail, and its rating beside it.
 */
export const DishRow: React.FC<{
  meal?: Meal;
  title: string;
  detail: React.ReactNode;
  rating?: number;
  cuisine?: string;
  open: boolean;
  onToggle: () => void;
  children?: React.ReactNode;
}> = ({ meal, title, detail, rating, cuisine, open, onToggle, children }) => (
  <li>
    <button
      onClick={onToggle}
      aria-expanded={open}
      className={cx(
        'flex w-full items-center gap-3 rounded-2xl px-3 py-2.5 text-left transition-colors hover:bg-sunk/65',
        open && 'bg-sunk/75'
      )}
    >
      <DishTile
        id={meal?.id}
        title={meal?.title || title}
        cuisine={meal?.cuisine || cuisine}
        ingredients={meal?.ingredients}
        imageUrl={meal?.imageUrl}
        size={48}
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate font-display text-[15.5px] font-semibold leading-snug">{title}</span>
        <span className="block truncate text-[12px] text-ink-2">{detail}</span>
      </span>
      {rating !== undefined && <StarsInline value={rating} />}
    </button>
    {open && <div className="fade-up px-3 pb-3 pt-1.5">{children}</div>}
  </li>
);
