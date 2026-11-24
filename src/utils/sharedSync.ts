import { alreadyApplied, cleanOpId, remember } from './opIds';

/**
 * Household lists kept in step across phones: recipes, shelved dishes, hidden dishes, the store
 * cupboard, likes, dislikes and "always have". Two shapes cover them all:
 *  - "list": items with an `id` (recipes, shelved, cupboard), changed by upsert / remove;
 *  - "set":  plain names (likes, dislikes, staples, hidden dish ids), changed by add / remove.
 * The server and every phone apply the same operations, so they always agree. Like the fridge,
 * the first phone to reach the server seeds it, and every operation carries an id so a resend
 * after a lost reply is ignored.
 */

export type SharedKind = 'list' | 'set';
export type SharedName = 'recipes' | 'shelved' | 'hidden' | 'cupboard' | 'liked' | 'avoid' | 'staples';

export const SHARED: Record<SharedName, { kind: SharedKind; max: number }> = {
  recipes: { kind: 'list', max: 400 },
  shelved: { kind: 'list', max: 200 },
  cupboard: { kind: 'list', max: 400 },
  hidden: { kind: 'set', max: 1000 },
  liked: { kind: 'set', max: 200 },
  avoid: { kind: 'set', max: 200 },
  staples: { kind: 'set', max: 300 },
};

export const SHARED_NAMES = Object.keys(SHARED) as SharedName[];
export const LARGE_SHARED: readonly SharedName[] = ['recipes', 'shelved'];
export const isLargeShared = (name: SharedName): boolean => LARGE_SHARED.includes(name);

export const isSharedName = (v: unknown): v is SharedName => typeof v === 'string' && Object.prototype.hasOwnProperty.call(SHARED, v);

export type SharedState<T> = { version: number; seeded: boolean; data: T; applied?: string[] };
export type SharedPollEntry<T = any[]> = SharedState<T> | { version: number; seeded: boolean; unchanged: true };

export type SharedOp = { opId?: string } & (
  | { type: 'seed'; data: unknown }
  | { type: 'replaceAll'; data: unknown }
  | { type: 'upsert'; item: any; index?: number }
  | { type: 'remove'; id: string }
  | { type: 'add'; value: string }
  | { type: 'drop'; value: string }
);

const MAX_ITEM_CHARS = 16_000;
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

const cleanListItem = (raw: any): any | null => {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const id = typeof raw.id === 'string' ? raw.id.trim().slice(0, 80) : '';
  if (!id) return null;
  try {
    if (JSON.stringify(raw).length > MAX_ITEM_CHARS) return null;
  } catch {
    return null;
  }
  return { ...raw, id };
};
const cleanValue = (raw: unknown) => (typeof raw === 'string' ? raw.trim().slice(0, 80) : '');

export function cleanData(kind: SharedKind, raw: unknown, max: number): any[] {
  const list = Array.isArray(raw) ? raw : [];
  if (kind === 'list') {
    const seen = new Set<string>();
    return list
      .map(cleanListItem)
      .filter((i) => i && !seen.has(i.id) && (seen.add(i.id), true))
      .slice(0, max);
  }
  const out: string[] = [];
  for (const v of list.map(cleanValue)) if (v && !out.some((o) => same(o, v))) out.push(v);
  return out.slice(0, max);
}

export function applySharedOp<T extends any[]>(kind: SharedKind, max: number, state: SharedState<T>, op: SharedOp | any): SharedState<T> {
  if (!op || typeof op !== 'object') return state;
  const id = cleanOpId(op.opId);
  if (alreadyApplied(state.applied, id)) return state;
  const next = applyOne(kind, max, state, op);
  return id ? { ...next, applied: remember(state.applied, id) } : next;
}

function applyOne<T extends any[]>(kind: SharedKind, max: number, state: SharedState<T>, op: any): SharedState<T> {
  const data = state.data as any[];
  switch (op.type) {
    case 'seed':
      return state.seeded ? state : { ...state, seeded: true, data: cleanData(kind, op.data, max) as T };
    case 'replaceAll':
      return { ...state, seeded: true, data: cleanData(kind, op.data, max) as T };
    case 'upsert': {
      if (kind !== 'list') return state;
      const item = cleanListItem(op.item);
      if (!item) return state;
      const at = data.findIndex((i) => i.id === item.id);
      const list = [...data];
      if (at >= 0) list[at] = item;
      else {
        const index = typeof op.index === 'number' ? Math.max(0, Math.min(list.length, Math.floor(op.index))) : list.length;
        list.splice(index, 0, item);
      }
      return { ...state, data: list.slice(0, max) as T };
    }
    case 'remove':
      return kind === 'list' ? { ...state, data: data.filter((i) => i.id !== op.id) as T } : state;
    case 'add': {
      const v = cleanValue(op.value);
      if (kind !== 'set' || !v || data.some((x) => same(x, v))) return state;
      return { ...state, data: [...data, v].slice(0, max) as T };
    }
    case 'drop': {
      const v = cleanValue(op.value);
      return kind === 'set' ? { ...state, data: data.filter((x) => !same(x, v)) as T } : state;
    }
    default:
      return state;
  }
}

/** The operations that turn `prev` into `next`. A large change goes as one replacement. */
export function diffShared(kind: SharedKind, prev: any[], next: any[]): SharedOp[] {
  const ops: SharedOp[] = [];
  if (kind === 'list') {
    const nextIds = new Set(next.map((i) => i?.id));
    const before = new Map(prev.map((i) => [i?.id, JSON.stringify(i)]));
    for (const i of prev) if (!nextIds.has(i?.id)) ops.push({ type: 'remove', id: i.id });
    next.forEach((item, index) => {
      const was = before.get(item?.id);
      if (was === undefined) ops.push({ type: 'upsert', item, index });
      else if (was !== JSON.stringify(item)) ops.push({ type: 'upsert', item });
    });
  } else {
    for (const v of prev) if (!next.some((n) => same(n, v))) ops.push({ type: 'drop', value: v });
    for (const v of next) if (!prev.some((p) => same(p, v))) ops.push({ type: 'add', value: v });
  }
  return ops.length > 60 ? [{ type: 'replaceAll', data: next }] : ops;
}

export const emptyShared = (): SharedState<any[]> => ({ version: 0, seeded: false, data: [] });
