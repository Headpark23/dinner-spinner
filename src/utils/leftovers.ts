/**
 * Leftovers: after dinner, "made extra?" sends the rest either to the fridge (flagged "use next", with an
 * eat-by date, so the spinner favours it) or to the freezer as a batch. Dates are plain YYYY-MM-DD in local time.
 */
import { Meal, PantryItem } from '../types';

export const DEFAULT_KEEP_DAYS = 3;
export const MAX_LEFTOVER_PORTIONS = 8;

export type LeftoverRoute = 'fridge' | 'freezer';

export const isDateOnly = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);

const pad = (n: number) => String(n).padStart(2, '0');
export const toDateOnly = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const parse = (s: string) => {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
};

export function addDays(date: Date, days: number): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  d.setDate(d.getDate() + days);
  return d;
}

export const keepDaysFor = (meal?: Pick<Meal, 'makesLeftovers'>): number => {
  const n = meal?.makesLeftovers?.keepDays;
  return typeof n === 'number' && n >= 1 && n <= 7 ? Math.round(n) : DEFAULT_KEEP_DAYS;
};

export const defaultPortions = (meal?: Pick<Meal, 'makesLeftovers'>): number => {
  const n = meal?.makesLeftovers?.portions;
  return typeof n === 'number' && n >= 1 ? Math.min(MAX_LEFTOVER_PORTIONS, Math.round(n)) : 2;
};

/** The fridge entry for leftovers: "Use next", and eat-by a few days on. */
export function leftoverFridgeItem(
  meal: { title: string; makesLeftovers?: Meal['makesLeftovers'] },
  portions: number,
  now: Date = new Date()
): Omit<PantryItem, 'id' | 'addedDate'> {
  const n = Math.min(MAX_LEFTOVER_PORTIONS, Math.max(1, Math.round(portions) || 1));
  return {
    name: `Leftover ${meal.title}`.slice(0, 80),
    category: 'Leftovers',
    freshness: 'red',
    quantity: `${n} ${n === 1 ? 'portion' : 'portions'}`,
    useBy: toDateOnly(addDays(now, keepDaysFor(meal))),
  };
}

export type UseByStatus = 'ok' | 'soon' | 'today' | 'over';

/** Days from today to the eat-by date (negative once it has passed), or null with no date. */
export function daysUntil(useBy: string | undefined, now: Date = new Date()): number | null {
  if (!isDateOnly(useBy)) return null;
  const today = parse(toDateOnly(now));
  return Math.round((parse(useBy).getTime() - today.getTime()) / 86_400_000);
}

export function useByStatus(useBy: string | undefined, now: Date = new Date()): UseByStatus | null {
  const d = daysUntil(useBy, now);
  if (d === null) return null;
  if (d < 0) return 'over';
  if (d === 0) return 'today';
  return d <= 2 ? 'soon' : 'ok';
}

export function useByLabel(useBy: string | undefined, now: Date = new Date()): string | null {
  const d = daysUntil(useBy, now);
  if (d === null) return null;
  if (d < -1) return `Past its date by ${-d} days`;
  if (d === -1) return 'Past its date yesterday';
  if (d === 0) return 'Eat today';
  if (d === 1) return 'Eat by tomorrow';
  return `Eat within ${d} days`;
}

/**
 * An item whose eat-by date is within two days (or past) counts as "use next" whatever it was set to, so the spinner
 * favours it and the fridge lists it first. The stored value is left alone; this is only how it is read.
 */
export function withDueFreshness<T extends { freshness: string; useBy?: string }>(items: T[], now: Date = new Date()): T[] {
  return items.map((i) => {
    const status = useByStatus(i.useBy, now);
    return (status === 'soon' || status === 'today' || status === 'over') && i.freshness !== 'red' ? { ...i, freshness: 'red' } : i;
  });
}
