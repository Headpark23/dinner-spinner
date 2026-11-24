import { FreezerItem } from '../types';

export const newFreezerId = () => `fz_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

const DAY = 24 * 60 * 60 * 1000;

/** Freeze a new batch. Portions are clamped to a sensible whole number. */
export function createFreezerItem(
  input: { name: string; portions: number; mealId?: string; note?: string; frozenDate?: string },
  now: Date = new Date()
): FreezerItem | null {
  const name = input.name.trim().slice(0, 80);
  if (!name) return null;
  const portions = Math.min(99, Math.max(1, Math.round(input.portions) || 1));
  return {
    id: newFreezerId(),
    name,
    mealId: input.mealId,
    portions,
    totalPortions: portions,
    frozenDate: input.frozenDate || now.toISOString(),
    note: input.note?.trim().slice(0, 120) || undefined,
  };
}

/** Tick off one portion. The batch moves to "used" when the last one goes. */
export function tickOffPortion(item: FreezerItem, now: Date = new Date()): FreezerItem {
  if (item.usedDate || item.portions <= 0) return item;
  const portions = item.portions - 1;
  return portions === 0 ? { ...item, portions, usedDate: now.toISOString() } : { ...item, portions };
}

/** Undo a tick: put a portion back (also revives a batch that was marked used). */
export function putBackFreezerPortion(item: FreezerItem): FreezerItem {
  if (item.portions >= item.totalPortions) return item;
  const { usedDate: _gone, ...rest } = item;
  return { ...rest, portions: item.portions + 1 };
}

export const inFreezer = (items: FreezerItem[]) => items.filter((i) => !i.usedDate && i.portions > 0);
export const usedUp = (items: FreezerItem[]) => items.filter((i) => i.usedDate || i.portions <= 0);

export const totalPortions = (items: FreezerItem[]) =>
  inFreezer(items).reduce((sum, i) => sum + i.portions, 0);

/** Oldest first, so what has been frozen longest is eaten first. */
export const oldestFirst = (items: FreezerItem[]) =>
  [...items].sort((a, b) => a.frozenDate.localeCompare(b.frozenDate));

export function daysFrozen(item: FreezerItem, now: Date = new Date()): number {
  const t = new Date(item.frozenDate).getTime();
  if (Number.isNaN(t)) return 0;
  return Math.max(0, Math.floor((now.getTime() - t) / DAY));
}

/** Cooked meals keep their best quality for roughly three months. */
export const FREEZER_EAT_SOON_DAYS = 90;
export const isEatSoon = (item: FreezerItem, now: Date = new Date()) =>
  daysFrozen(item, now) >= FREEZER_EAT_SOON_DAYS;

export function frozenAgo(item: FreezerItem, now: Date = new Date()): string {
  const d = daysFrozen(item, now);
  if (d === 0) return 'Frozen today';
  if (d === 1) return 'Frozen yesterday';
  if (d < 14) return `Frozen ${d} days ago`;
  if (d < 60) return `Frozen ${Math.round(d / 7)} weeks ago`;
  return `Frozen ${Math.round(d / 30)} months ago`;
}

/** Defensive parse for backups and localStorage so a bad file cannot crash the screen. */
export function sanitizeFreezer(raw: unknown): FreezerItem[] {
  if (!Array.isArray(raw)) return [];
  return raw.flatMap((r: any) => {
    if (!r || typeof r !== 'object' || typeof r.name !== 'string' || !r.name.trim()) return [];
    const portions = Math.max(0, Math.round(Number(r.portions)) || 0);
    const total = Math.max(portions, Math.round(Number(r.totalPortions)) || portions || 1);
    return [
      {
        id: typeof r.id === 'string' && r.id ? r.id : newFreezerId(),
        name: r.name.trim().slice(0, 80),
        mealId: typeof r.mealId === 'string' ? r.mealId : undefined,
        portions,
        totalPortions: total,
        frozenDate: typeof r.frozenDate === 'string' ? r.frozenDate : new Date().toISOString(),
        note: typeof r.note === 'string' ? r.note.slice(0, 120) : undefined,
        usedDate: typeof r.usedDate === 'string' ? r.usedDate : portions === 0 ? new Date().toISOString() : undefined,
      },
    ];
  });
}
