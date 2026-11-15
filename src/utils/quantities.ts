import data from '../data/quantities.json';

/** Quantities are written for this many servings. */
export const BASE_SERVINGS = 4;

const TABLE = data as Record<string, Record<string, string>>;

/** The written quantity for one ingredient of a bundled recipe (for 4 servings), if there is one. */
export const baseQuantity = (mealId: string, ingredient: string): string | null =>
  TABLE[mealId]?.[ingredient] ?? null;

export const hasQuantities = (mealId: string): boolean => !!TABLE[mealId];

const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

// Leading amount: "1 1/2", "1/2", "1.5", "1-2", "3", or a vulgar fraction like "1½".
const LEAD = /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?[½¼¾⅓⅔]?|[½¼¾⅓⅔])(?:\s*[-–]\s*(\d+(?:\.\d+)?))?/;

const toNumber = (s: string): number => {
  const mixed = s.match(/^(\d+)\s+(\d+)\/(\d+)$/);
  if (mixed) return Number(mixed[1]) + Number(mixed[2]) / Number(mixed[3]);
  const frac = s.match(/^(\d+)\/(\d+)$/);
  if (frac) return Number(frac[1]) / Number(frac[2]);
  const vulgar = s.match(/^(\d*(?:\.\d+)?)([½¼¾⅓⅔])$/);
  if (vulgar) return (vulgar[1] ? Number(vulgar[1]) : 0) + FRACTIONS[vulgar[2]];
  return Number(s);
};

const NICE: [number, string][] = [
  [0.25, '¼'],
  [1 / 3, '⅓'],
  [0.5, '½'],
  [2 / 3, '⅔'],
  [0.75, '¾'],
];

const format = (n: number): string => {
  if (n >= 100) return String(Math.round(n / 5) * 5);
  if (n >= 10) return String(Math.round(n));
  const whole = Math.floor(n + 1e-9);
  const rest = n - whole;
  if (rest < 0.06) return String(whole);
  if (rest > 0.94) return String(whole + 1);
  const near = NICE.find(([v]) => Math.abs(rest - v) < 0.06);
  if (near) return `${whole || ''}${near[1]}`;
  return String(Math.round(n * 10) / 10);
};

/**
 * Scales the leading number of a quantity ("200g" -> "400g", "2 x 400g tins" -> "4 x 400g tins").
 * Phrases without a number ("to taste", "a pinch", "a handful") are left as they are.
 */
export function scaleQuantity(qty: string, factor: number): string {
  if (factor === 1) return qty;
  const m = qty.match(LEAD);
  if (!m) return qty;
  const a = format(toNumber(m[1]) * factor);
  const b = m[2] ? format(Number(m[2]) * factor) : '';
  return (b ? `${a}-${b}` : a) + qty.slice(m[0].length);
}

/** "400g" for a recipe cooked for `servings` people, or null when no quantity is known. */
export function quantityFor(mealId: string, ingredient: string, servings: number): string | null {
  const base = baseQuantity(mealId, ingredient);
  return base === null ? null : scaleQuantity(base, servings / BASE_SERVINGS);
}
