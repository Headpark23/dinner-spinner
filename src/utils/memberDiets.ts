/**
 * Per-person dietary needs. The household diets and avoid list stay as the baseline that always applies.
 * On top of it each person can have their own diets and avoid list. A setting chooses what happens with those:
 * "skip" (the default) leaves out dishes that someone can't eat, "warn" keeps every dish and just names who it
 * does not suit. Like the household diets this is a best guess from ingredient names, not an allergy check.
 */
import { DietId, DIETS, ingredientBreaks, isDietId } from './diets';
import { mentions } from './avoid';

export type DietMode = 'skip' | 'warn';
export const isDietMode = (v: unknown): v is DietMode => v === 'skip' || v === 'warn';

export interface PersonPrefs {
  id: string;
  name: string;
  diets?: DietId[];
  avoid?: string[];
}

const dietLabel = (id: DietId) => DIETS.find((d) => d.id === id)?.label.toLowerCase() ?? id;

/** Tidies stored values: known diets only, trimmed, de-duplicated, capped. */
export function cleanPersonPrefs(input: { diets?: unknown; avoid?: unknown }): { diets: DietId[]; avoid: string[] } {
  const diets = Array.isArray(input.diets) ? [...new Set(input.diets.filter(isDietId))] : [];
  const avoid = Array.isArray(input.avoid)
    ? [
        ...new Set(
          input.avoid
            .filter((a): a is string => typeof a === 'string')
            .map((a) => a.trim().slice(0, 40))
            .filter(Boolean)
        ),
      ].slice(0, 20)
    : [];
  return { diets, avoid };
}

/** What the spin, planner and reels should leave out: the baseline, plus everyone's own when mode is "skip". */
export function effectiveRestrictions(
  baseDiets: DietId[],
  baseAvoid: string[],
  people: PersonPrefs[],
  mode: DietMode
): { diets: DietId[]; avoid: string[] } {
  if (mode !== 'skip') return { diets: baseDiets, avoid: baseAvoid };
  const diets = new Set<DietId>(baseDiets);
  const avoid = new Map<string, string>();
  baseAvoid.forEach((a) => avoid.set(a.toLowerCase(), a));
  for (const p of people) {
    (p.diets ?? []).filter(isDietId).forEach((d) => diets.add(d));
    (p.avoid ?? []).forEach((a) => avoid.set(a.toLowerCase(), a));
  }
  return { diets: [...diets], avoid: [...avoid.values()] };
}

export interface Clash {
  name: string;
  /** Plain reasons, e.g. "vegetarian" or "avoids mushrooms". */
  reasons: string[];
}

/** Who a dish does not suit, from each person's own diets and avoid list. */
export function dishClashes(dish: { title: string; ingredients: string[] }, people: PersonPrefs[]): Clash[] {
  const out: Clash[] = [];
  for (const p of people) {
    const reasons: string[] = [];
    for (const d of p.diets ?? []) {
      if (isDietId(d) && dish.ingredients.some((ing) => ingredientBreaks(ing, [d]))) reasons.push(dietLabel(d));
    }
    for (const a of p.avoid ?? []) {
      if ([dish.title, ...dish.ingredients].some((t) => mentions(t, a))) reasons.push(`avoids ${a.toLowerCase()}`);
    }
    if (reasons.length > 0) out.push({ name: p.name, reasons });
  }
  return out;
}

/** "Sam (vegetarian) and Jo (avoids mushrooms)" */
export function describeClashes(clashes: Clash[]): string {
  const parts = clashes.map((c) => `${c.name} (${c.reasons.join(', ')})`);
  if (parts.length <= 1) return parts[0] ?? '';
  return `${parts.slice(0, -1).join(', ')} and ${parts[parts.length - 1]}`;
}
