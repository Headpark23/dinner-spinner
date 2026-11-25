import type { CupboardItem, DailyLogEntry, FreezerItem, MealSlot, PantryItem, ShoppingItem, UsedStockItem } from '../types';
import { dayKey } from './milestones';

export const MEAL_SLOTS: { id: MealSlot; label: string; short: string }[] = [
  { id: 'breakfast', label: 'Breakfast', short: 'Break.' },
  { id: 'lunch', label: 'Lunch', short: 'Lunch' },
  { id: 'dinner', label: 'Dinner', short: 'Dinner' },
  { id: 'snack', label: 'Snack / Other', short: 'Snack' },
];

export const slotLabel = (slot: MealSlot): string =>
  MEAL_SLOTS.find((s) => s.id === slot)?.label || 'Meal';

export const defaultSlotForHour = (hour: number): MealSlot => {
  if (hour < 11) return 'breakfast';
  if (hour < 16) return 'lunch';
  return 'dinner';
};

export const todayDayKey = (now: Date = new Date()): string => dayKey(now);

const STOP_WORDS = new Set([
  'fresh',
  'organic',
  'free',
  'range',
  'british',
  'tinned',
  'canned',
  'chopped',
  'diced',
  'sliced',
  'large',
  'small',
  'medium',
  'whole',
  'pack',
  'bunch',
  'tin',
  'jar',
  'bottle',
  'bag',
  'box',
  'of',
  'and',
  'with',
  'in',
  'the',
  'for',
  'semi',
  'skimmed',
  'extra',
  'virgin',
  'low',
  'fat',
  'reduced',
]);

const normalizeTokens = (text: string): string[] =>
  text
    .toLowerCase()
    .replace(/\d+\s*(g|kg|ml|l|oz|lb|x|tbsp|tsp|cups?)\b/gi, ' ')
    .replace(/[^a-z\s]/g, ' ')
    .split(/\s+/)
    .map((w) => (w.length > 3 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w))
    .filter((w) => w.length >= 3 && !STOP_WORDS.has(w));

export function namesMatch(a: string, b: string): boolean {
  const la = a.trim().toLowerCase();
  const lb = b.trim().toLowerCase();
  if (!la || !lb) return false;
  if (la === lb || la.includes(lb) || lb.includes(la)) return true;
  const ta = normalizeTokens(la);
  const tb = normalizeTokens(lb);
  if (ta.length === 0 || tb.length === 0) return false;
  const setB = new Set(tb);
  const overlap = ta.filter((t) => setB.has(t));
  if (overlap.length === 0) return false;
  const smaller = Math.min(ta.length, tb.length);
  return overlap.length >= Math.min(2, smaller) || (smaller === 1 && overlap.length === 1);
}

export interface StockMatchCandidate {
  id: string;
  name: string;
  source: 'fridge' | 'cupboard' | 'freezer';
  detail?: string;
  freshness?: PantryItem['freshness'];
  defaultAction: UsedStockItem['action'];
  matchedBy?: string;
}

/**
 * Matches a list of recipe ingredients (or free-text meal words) against the household's
 * current Fridge, Cupboard (non-low), and Freezer (portions > 0) inventory.
 */
export function matchKitchenStockForItems(params: {
  ingredients: string[];
  pantry: PantryItem[];
  cupboard: CupboardItem[];
  freezer: FreezerItem[];
}): StockMatchCandidate[] {
  const { ingredients, pantry, cupboard, freezer } = params;
  const needles = ingredients.map((s) => s.trim()).filter(Boolean);
  if (needles.length === 0) return [];

  const matches: StockMatchCandidate[] = [];
  const seen = new Set<string>();

  for (const item of pantry) {
    const hit = needles.find((n) => namesMatch(n, item.name));
    if (hit && !seen.has(`fridge:${item.id}`)) {
      seen.add(`fridge:${item.id}`);
      matches.push({
        id: item.id,
        name: item.name,
        source: 'fridge',
        detail: item.quantity || item.category,
        freshness: item.freshness,
        defaultAction: 'removed',
        matchedBy: hit,
      });
    }
  }

  for (const item of cupboard) {
    if (item.low) continue;
    const hit = needles.find((n) => namesMatch(n, item.name));
    if (hit && !seen.has(`cupboard:${item.id}`)) {
      seen.add(`cupboard:${item.id}`);
      matches.push({
        id: item.id,
        name: item.name,
        source: 'cupboard',
        detail: item.quantity || item.shelf,
        defaultAction: 'marked-low',
        matchedBy: hit,
      });
    }
  }

  for (const item of freezer) {
    if (item.portions <= 0) continue;
    const hit = needles.find((n) => namesMatch(n, item.name));
    if (hit && !seen.has(`freezer:${item.id}`)) {
      seen.add(`freezer:${item.id}`);
      matches.push({
        id: item.id,
        name: item.name,
        source: 'freezer',
        detail: `${item.portions} ${item.portions === 1 ? 'portion' : 'portions'} left`,
        defaultAction: 'portion-used',
        matchedBy: hit,
      });
    }
  }

  return matches;
}

/**
 * Checks whether an item a user is about to add to the shopping list already exists
 * in the Fridge, stocked Cupboard (not marked low), or active Freezer (portions > 0).
 */
export function findExistingStockMatches(
  itemName: string,
  stock: {
    pantry: PantryItem[];
    cupboard: CupboardItem[];
    freezer: FreezerItem[];
  }
): StockMatchCandidate[] {
  const clean = itemName.trim();
  if (clean.length < 2) return [];
  return matchKitchenStockForItems({
    ingredients: [clean],
    pantry: stock.pantry,
    cupboard: stock.cupboard,
    freezer: stock.freezer,
  });
}

export interface RestockSuggestion {
  name: string;
  source: 'fridge' | 'cupboard' | 'freezer' | 'other';
  reason: string;
  usedCount: number;
  lastUsedDate?: string;
}

/**
 * Surfaces items the household needs to restock:
 *  1. Cupboard items currently marked `low` (and not already on the shopping list).
 *  2. Fridge / Freezer items recently logged as used up in `dailyLog` that are no longer
 *     in stock and not already on the shopping list.
 */
export function computeRestockSuggestions(params: {
  dailyLog: DailyLogEntry[];
  pantry: PantryItem[];
  cupboard: CupboardItem[];
  freezer: FreezerItem[];
  shoppingList: ShoppingItem[];
  lookbackDays?: number;
  now?: Date;
}): RestockSuggestion[] {
  const { dailyLog, pantry, cupboard, freezer, shoppingList, lookbackDays = 21, now = new Date() } = params;
  const onShop = (name: string) =>
    shoppingList.some((s) => !s.checked && namesMatch(s.name, name));
  const inFridge = (name: string) => pantry.some((p) => namesMatch(p.name, name));
  const stockedInCupboard = (name: string) => cupboard.some((c) => !c.low && namesMatch(c.name, name));
  const inFreezerStock = (name: string) => freezer.some((f) => f.portions > 0 && namesMatch(f.name, name));

  const cutoffMs = now.getTime() - lookbackDays * 24 * 60 * 60 * 1000;
  const byKey = new Map<string, RestockSuggestion>();

  // 1. Low cupboard items first
  for (const c of cupboard) {
    if (!c.low) continue;
    if (onShop(c.name)) continue;
    const key = c.name.trim().toLowerCase();
    byKey.set(key, {
      name: c.name,
      source: 'cupboard',
      reason: 'Running low in cupboard',
      usedCount: 1,
    });
  }

  // 2. Recently used-up items from dailyLog
  for (const entry of dailyLog) {
    const ts = new Date(entry.date).getTime();
    if (!Number.isFinite(ts) || ts < cutoffMs) continue;
    for (const u of entry.usedItems || []) {
      const clean = u.name.trim();
      if (!clean) continue;
      if (onShop(clean)) continue;
      if (u.source === 'fridge' && inFridge(clean)) continue;
      if (u.source === 'cupboard' && stockedInCupboard(clean)) continue;
      if (u.source === 'freezer' && inFreezerStock(clean)) continue;
      if (u.source === 'other' && (inFridge(clean) || stockedInCupboard(clean))) continue;

      const key = clean.toLowerCase();
      const prev = byKey.get(key);
      if (prev) {
        prev.usedCount += 1;
        if (!prev.lastUsedDate || entry.date > prev.lastUsedDate) {
          prev.lastUsedDate = entry.date;
        }
      } else {
        const where =
          u.source === 'fridge'
            ? 'Finished from fridge'
            : u.source === 'cupboard'
              ? 'Used from cupboard'
              : u.source === 'freezer'
                ? 'Finished from freezer'
                : 'Used recently';
        byKey.set(key, {
          name: clean,
          source: u.source,
          reason: where,
          usedCount: 1,
          lastUsedDate: entry.date,
        });
      }
    }
  }

  return [...byKey.values()].sort(
    (a, b) => b.usedCount - a.usedCount || (b.lastUsedDate || '').localeCompare(a.lastUsedDate || '')
  );
}

export interface DailyJournalGroup {
  day: string;
  entries: DailyLogEntry[];
}

export function groupDailyLogByDay(dailyLog: DailyLogEntry[], limitDays = 14): DailyJournalGroup[] {
  const sorted = [...dailyLog].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
  const map = new Map<string, DailyLogEntry[]>();
  for (const entry of sorted) {
    const key = entry.day || dayKey(new Date(entry.date));
    const list = map.get(key) || [];
    list.push(entry);
    map.set(key, list);
  }
  const slotOrder: Record<MealSlot, number> = { breakfast: 0, lunch: 1, dinner: 2, snack: 3 };
  return [...map.entries()]
    .slice(0, limitDays)
    .map(([day, entries]) => ({
      day,
      entries: entries.sort((a, b) => slotOrder[a.slot] - slotOrder[b.slot]),
    }));
}

export function topConsumedIngredients(dailyLog: DailyLogEntry[], limit = 10): { name: string; count: number; lastUsed: string }[] {
  const counts = new Map<string, { name: string; count: number; lastUsed: string }>();
  for (const entry of dailyLog) {
    for (const item of entry.usedItems || []) {
      const clean = item.name.trim();
      if (!clean) continue;
      const key = clean.toLowerCase();
      const prev = counts.get(key);
      if (prev) {
        prev.count += 1;
        if (entry.date > prev.lastUsed) prev.lastUsed = entry.date;
      } else {
        counts.set(key, { name: clean, count: 1, lastUsed: entry.date });
      }
    }
  }
  return [...counts.values()].sort((a, b) => b.count - a.count || b.lastUsed.localeCompare(a.lastUsed)).slice(0, limit);
}

export const newDailyLogId = (): string =>
  `dl_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
