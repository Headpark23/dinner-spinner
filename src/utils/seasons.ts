/**
 * Seasonal dishes. Nothing is hand-tagged: a dish counts as a winter or a summer dish when its title or tags
 * say so (stew, roast, soup; salad, barbecue). Most dishes have no season and are never nudged. In season a dish
 * is a little likelier to come up, out of season a little less likely. The nudge is deliberately mild, well below
 * the "use next" boost, so it never beats what needs eating.
 *
 * Months default to the northern hemisphere (the app is UK-first): winter is November to March, summer June to
 * August. April, May, September and October are in between and change nothing.
 */
import type { Meal } from '../types';

export type Season = 'winter' | 'summer';
export type Hemisphere = 'north' | 'south';

export const IN_SEASON_WEIGHT = 1.25;
export const OUT_OF_SEASON_WEIGHT = 0.85;

const WINTER = /\b(stews?|casseroles?|hotpots?|roasts?|soups?|chowders?|pies?|braise[ds]?|bakes?|dumplings?|shepherd'?s|cottage|chilli|chili|porridge|mulled|cassoulet|goulash|ragu|bolognese)\b/i;
const SUMMER = /\b(salads?|barbecues?|bbq|gazpacho|ceviche|poke|summer|kebabs?|skewers?|caprese|tabbouleh|slaw|cold|grilled|burgers?)\b/i;

/** The season a dish belongs to, or null when it has none (or reads as both). */
export function seasonOf(meal: Pick<Meal, 'title' | 'tags'>): Season | null {
  const text = [meal.title, ...(meal.tags ?? [])].join(' ');
  const winter = WINTER.test(text);
  const summer = SUMMER.test(text);
  if (winter === summer) return null;
  return winter ? 'winter' : 'summer';
}

/** The season a date is in, or null in the in-between months. In the southern hemisphere the months are six apart. */
export function seasonForMonth(month: number, hemisphere: Hemisphere = 'north'): Season | null {
  const m = hemisphere === 'south' ? (month + 6) % 12 : month;
  if (m >= 5 && m <= 7) return 'summer'; // June to August (0-based months)
  if (m >= 10 || m <= 2) return 'winter'; // November to March
  return null;
}

/** The multiplier for a dish on a given date: 1 when it has no season or it is a between-season month. */
export function seasonWeight(meal: Pick<Meal, 'title' | 'tags'>, when: Date, hemisphere: Hemisphere = 'north'): number {
  const now = seasonForMonth(when.getMonth(), hemisphere);
  const dish = seasonOf(meal);
  if (!now || !dish) return 1;
  return dish === now ? IN_SEASON_WEIGHT : OUT_OF_SEASON_WEIGHT;
}

export const seasonLabel = (s: Season | null): string => (s === 'winter' ? 'Winter favourites' : s === 'summer' ? 'Summer favourites' : '');
