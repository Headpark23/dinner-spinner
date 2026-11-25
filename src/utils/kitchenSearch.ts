import type { CupboardItem, FreezerItem, PantryItem } from '../types';
import { inFreezer } from './freezer';

export type KitchenPlace = 'fridge' | 'cupboard' | 'freezer' | 'staples';

export interface KitchenHit {
  place: KitchenPlace;
  id: string;
  name: string;
  /** Short detail: freshness, shelf, portions left, container label... */
  detail: string;
  /** Fridge item marked "use next", or a cupboard item running low. */
  warn?: boolean;
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

/** "tomatoes" finds "tomato", "berries" finds "berry". */
const stem = (w: string) => w.replace(/ies$/, 'y').replace(/(oes|ses|xes|ches|shes)$/, (m) => m.slice(0, -2)).replace(/s$/, '');

/** 0 = name starts with it, 1 = a word starts with it, -1 = no match ("peas" doesn't find "chickpeas"). */
function rank(name: string, query: string): number {
  const n = norm(name);
  const q = norm(query);
  if (!q) return -1;
  if (n.startsWith(q)) return 0;
  if (` ${n}`.includes(` ${q}`)) return 1;
  // Every word of the query (singular or plural) appears at the start of some word in the name.
  const nameWords = n.split(' ').map(stem);
  const queryWords = q.split(' ').map(stem).filter(Boolean);
  if (queryWords.length && queryWords.every((qw) => nameWords.some((nw) => nw.startsWith(qw)))) return 1;
  return -1;
}

const PLACE_ORDER: Record<KitchenPlace, number> = { fridge: 0, freezer: 1, cupboard: 2, staples: 3 };

/** Finds an item across the fridge, cupboard, freezer and always-have staples. */
export function searchKitchen(
  query: string,
  stock: { pantry: PantryItem[]; cupboard: CupboardItem[]; freezer: FreezerItem[]; staples: string[] }
): KitchenHit[] {
  const hits: (KitchenHit & { r: number })[] = [];
  const add = (hit: KitchenHit) => {
    const r = rank(hit.name, query);
    if (r >= 0) hits.push({ ...hit, r });
  };

  for (const p of stock.pantry) {
    add({
      place: 'fridge',
      id: p.id,
      name: p.name,
      detail: [p.freshness === 'red' ? 'Use next' : p.freshness === 'amber' ? 'Eat soon' : 'Fresh', p.quantity].filter(Boolean).join(' · '),
      warn: p.freshness === 'red',
    });
  }
  for (const c of stock.cupboard) {
    add({
      place: 'cupboard',
      id: c.id,
      name: c.name,
      detail: [c.shelf, c.quantity, c.low ? 'running low' : ''].filter(Boolean).join(' · '),
      warn: !!c.low,
    });
  }
  for (const f of inFreezer(stock.freezer)) {
    add({
      place: 'freezer',
      id: f.id,
      name: f.name,
      detail: [`${f.portions} ${f.portions === 1 ? 'portion' : 'portions'} left`, f.note].filter(Boolean).join(' · '),
    });
  }
  stock.staples.forEach((s, i) => add({ place: 'staples', id: `staple-${i}`, name: s, detail: 'Always have' }));

  return hits
    .sort((a, b) => a.r - b.r || PLACE_ORDER[a.place] - PLACE_ORDER[b.place] || a.name.localeCompare(b.name))
    .map(({ r: _r, ...hit }) => hit);
}
