import type { CookLogEntry } from '../types';

const MAX_LOG = 1000;

/** Keep only well-formed entries so a client can't stash arbitrary data. */
export const cleanLog = (raw: unknown): CookLogEntry[] =>
  (Array.isArray(raw) ? raw : [])
    .filter((e: any) => e && typeof e.id === 'string' && typeof e.mealId === 'string' && typeof e.title === 'string')
    .slice(0, MAX_LOG);

/** Union by id; entries in `incoming` win (they may carry newer reviews). Newest first. Nothing is lost. */
export function unionLog(existing: CookLogEntry[], incoming: CookLogEntry[]): CookLogEntry[] {
  const byId = new Map<string, CookLogEntry>();
  for (const e of existing) byId.set(e.id, e);
  for (const e of incoming) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, MAX_LOG);
}
