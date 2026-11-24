import type { Meal } from '../types';
import { DietId, mealFitsDiets } from './diets';
import { withTweaks } from './dinnerEngine';

/**
 * Keeps the recipe book in step with what the household loves and refuses.
 *
 *  - A dish containing something on the "never" list leaves the rotation. It is shelved, not deleted,
 *    so taking the ingredient off the list brings the dish back (with its tweaks and rating).
 *  - Every dish that leaves is replaced from the World Kitchen with one that fits, preferring dishes
 *    built on ingredients the household loves.
 *  - Adding something to the "love" list brings in a few World Kitchen dishes that use it.
 */

const norm = (s: string) => s.trim().toLowerCase();

const has = (ingredient: string, term: string) => ingredient.toLowerCase().includes(term);

/** Does the dish (with the household's own additions) contain any of these? */
export function mealContains(meal: Meal, terms: string[]): boolean {
  const wanted = terms.map(norm).filter(Boolean);
  if (wanted.length === 0) return false;
  const ingredients = withTweaks(meal).ingredients;
  return ingredients.some((ing) => wanted.some((t) => has(ing, t)));
}

/** How many of the loved ingredients appear in the dish. */
export function lovedCount(meal: Meal, loved: string[]): number {
  const wanted = Array.from(new Set(loved.map(norm).filter(Boolean)));
  const ingredients = withTweaks(meal).ingredients;
  return wanted.filter((t) => ingredients.some((ing) => has(ing, t))).length;
}

export interface TasteInput {
  meals: Meal[];
  shelved: Meal[];
  /** Dishes the household hid with "not for us". They never come back by themselves. */
  rejectedIds: string[];
  banned: string[];
  loved: string[];
  diets: DietId[];
  /** The full library to draw new dishes from. */
  library: Meal[];
  /** Bring in this many extra dishes (used when something new is loved). */
  extraSlots?: number;
  /** When set, new dishes must contain this loved ingredient. */
  mustContain?: string;
}

export interface TasteResult {
  meals: Meal[];
  shelved: Meal[];
  /** Left the rotation because of the never list. */
  removed: Meal[];
  /** Came back because their ingredient is no longer refused. */
  restored: Meal[];
  /** New to the rotation. */
  added: Meal[];
}

export function adaptRecipes(input: TasteInput, rng: () => number = Math.random): TasteResult {
  const { banned, loved, diets, library, rejectedIds } = input;

  // 1. Shelve what now clashes; bring back what no longer does.
  const removed = input.meals.filter((m) => mealContains(m, banned));
  const removedIds = new Set(removed.map((m) => m.id));
  let meals = input.meals.filter((m) => !removedIds.has(m.id));

  const stillShelved: Meal[] = [];
  const restored: Meal[] = [];
  const inRotation = new Set(meals.map((m) => m.id));
  for (const m of input.shelved) {
    if (inRotation.has(m.id) || removedIds.has(m.id)) continue; // already back, or just shelved again
    if (mealContains(m, banned)) stillShelved.push(m);
    else {
      restored.push(m);
      inRotation.add(m.id);
    }
  }
  meals = [...meals, ...restored];
  const shelved = [...stillShelved, ...removed];

  // 2. Fill the gaps from the library.
  const slots = removed.length + (input.extraSlots || 0);
  const taken = new Set([...meals.map((m) => m.id), ...shelved.map((m) => m.id), ...rejectedIds]);
  const wantedCuisines = new Set(removed.map((m) => m.cuisine));
  const must = input.mustContain ? norm(input.mustContain) : '';
  const candidates = library.filter(
    (r) =>
      !taken.has(r.id) &&
      mealFitsDiets(r.ingredients, diets) &&
      !mealContains(r, banned) &&
      (!must || mealContains(r, [must]))
  );
  const score = (r: Meal) => lovedCount(r, loved) * 3 + (wantedCuisines.has(r.cuisine) ? 1 : 0) + rng();
  const added = candidates
    .map((r) => ({ r, s: score(r) }))
    .sort((a, b) => b.s - a.s)
    .slice(0, slots)
    .map((x) => x.r);

  return { meals: [...meals, ...added], shelved, removed, restored, added };
}

/** One plain-English line about what just changed, or null when nothing did. */
export function describeTasteChange(r: TasteResult, what: { never?: string; love?: string }): string | null {
  const parts: string[] = [];
  const dishes = (n: number) => `${n} ${n === 1 ? 'dish' : 'dishes'}`;
  if (r.removed.length) parts.push(`Removed ${dishes(r.removed.length)} with ${what.never || 'that'}`);
  if (r.restored.length) parts.push(`brought back ${dishes(r.restored.length)}`);
  if (r.added.length) {
    const names = r.added.slice(0, 2).map((m) => m.title).join(' and ');
    parts.push(`${r.removed.length || r.restored.length ? 'added' : 'Added'} ${dishes(r.added.length)} you might like${what.love ? ` with ${what.love}` : ''} (${names}${r.added.length > 2 ? '…' : ''})`);
  }
  if (parts.length === 0) return null;
  const line = parts.join(', ') + '.';
  return line.charAt(0).toUpperCase() + line.slice(1);
}
