import { Meal, PantryItem } from '../types';
import { calculateMealPantryMatch, filterEligibleMeals, isMealCoolingOff } from './dinnerEngine';
import { DietId, ingredientBreaks } from './diets';
import { DELIVERY_SHOPS } from './delivery';

/** A week plan: local date (YYYY-MM-DD) -> the dish for that night. */
export type WeekPlan = Record<string, { mealId: string; title: string }>;

export type ThemeId = 'any' | 'meatless' | 'fish' | 'pasta' | 'one-pot' | 'quick';

const FISHY = ['fish', 'salmon', 'tuna', 'cod', 'haddock', 'prawn', 'shrimp', 'mackerel', 'squid', 'trout', 'sea bass', 'seafood'];

export const THEMES: { id: ThemeId; label: string; fits: (m: Meal) => boolean }[] = [
  { id: 'any', label: 'Anything', fits: () => true },
  { id: 'meatless', label: 'Meat-free', fits: (m) => !m.ingredients.some((i) => ingredientBreaks(i, ['vegetarian'])) },
  {
    id: 'fish',
    label: 'Fish',
    fits: (m) => m.ingredients.some((i) => FISHY.some((f) => i.toLowerCase().includes(f))),
  },
  {
    id: 'pasta',
    label: 'Pasta',
    fits: (m) => m.ingredients.some((i) => /pasta|spaghetti|penne|rigatoni|tagliatelle|linguine|macaroni|noodle/i.test(i)),
  },
  { id: 'one-pot', label: 'One pot', fits: (m) => m.effort === 'one-pot' },
  { id: 'quick', label: 'Quick', fits: (m) => m.timeStake === '20m' || m.timeStake === '30m' },
];

export const themeFits = (id: ThemeId, meal: Meal): boolean => (THEMES.find((t) => t.id === id) || THEMES[0]).fits(meal);

const pad = (n: number) => String(n).padStart(2, '0');
export const dateKey = (d: Date): string => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

/** The next `n` days starting today, as local date keys. */
export function nextDays(from: Date, n = 7): string[] {
  return Array.from({ length: n }, (_, i) => {
    const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + i);
    return dateKey(d);
  });
}

/** Drops plan entries for days already gone, and for dishes that no longer exist. */
export function tidyPlan(plan: WeekPlan, today: Date, meals: Meal[]): WeekPlan {
  const start = dateKey(today);
  const ids = new Set(meals.map((m) => m.id));
  return Object.fromEntries(Object.entries(plan).filter(([day, v]) => day >= start && ids.has(v.mealId)));
}

/**
 * Fills the empty nights. Respects diets and dislikes, honours each night's theme where something
 * fits (otherwise any dish), avoids repeats within the week, and prefers dishes not cooked lately.
 */
export function suggestWeek(
  meals: Meal[],
  opts: {
    days: string[];
    plan: WeekPlan;
    themes: Record<string, ThemeId>;
    diets: DietId[];
    banned: string[];
    /** Leave out dishes dearer than this to buy tonight (relaxed if nothing is cheap enough, as in the spin). */
    cost?: { limit: number; of: (m: Meal) => number };
    rng?: () => number;
    now?: number;
  }
): WeekPlan {
  const rng = opts.rng || Math.random;
  const next: WeekPlan = { ...opts.plan };
  const pool = filterEligibleMeals(meals, 'any', 'any', opts.banned, opts.diets, opts.cost).pool;
  const used = new Set(Object.values(next).map((v) => v.mealId));
  const shuffle = <T,>(xs: T[]) => xs.map((x) => [rng(), x] as const).sort((a, b) => a[0] - b[0]).map((p) => p[1]);

  for (const day of opts.days) {
    if (next[day]) continue;
    const theme = opts.themes[day] || 'any';
    const fresh = pool.filter((m) => !used.has(m.id));
    const rested = fresh.filter((m) => !isMealCoolingOff(m, opts.now));
    const candidates = [rested, fresh, pool];
    let pick: Meal | undefined;
    for (const c of candidates) {
      pick = shuffle(c.filter((m) => themeFits(theme, m)))[0];
      if (pick) break;
    }
    if (!pick) pick = shuffle(rested.length ? rested : fresh.length ? fresh : pool)[0];
    if (!pick) continue;
    used.add(pick.id);
    next[day] = { mealId: pick.id, title: pick.title };
  }
  return next;
}

/** Everything the week needs that isn't in the fridge, vault or staples, once each. */
export function weekShopping(plan: WeekPlan, meals: Meal[], pantry: PantryItem[], staples: string[], onList: string[]): string[] {
  const have = new Set(onList.map((n) => n.trim().toLowerCase()));
  const out: string[] = [];
  for (const entry of Object.values(plan)) {
    const meal = meals.find((m) => m.id === entry.mealId);
    if (!meal) continue;
    for (const name of calculateMealPantryMatch(meal, pantry, staples).missingItems) {
      const key = name.trim().toLowerCase();
      if (!key || have.has(key)) continue;
      have.add(key);
      out.push(name);
    }
  }
  return out;
}

/** The shops the shopping tab can search. One list, in `delivery.ts`, so a changed address is fixed once. */
export const STORES = DELIVERY_SHOPS.flatMap((x) =>
  x.kind === 'supermarket' && x.search ? [{ id: x.id, label: x.name, url: x.search }] : []
);
export type StoreId = string;
