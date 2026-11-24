import type { CookLogEntry, Meal } from '../types';

/** The household recipe book: recipes, hidden dishes and what you've cooked. Shared through the server. */
export interface Library {
  version: number;
  seeded: boolean;
  meals: Meal[];
  rejectedMealIds: string[];
  cookLog: CookLogEntry[];
}

export interface LibraryPayload {
  meals: Meal[];
  rejectedMealIds: string[];
  cookLog: CookLogEntry[];
  /** Set when history was deliberately reset or restored, so the server replaces its log instead of merging. */
  replaceLog?: boolean;
}

export const emptyLibrary = (): Library => ({ version: 0, seeded: false, meals: [], rejectedMealIds: [], cookLog: [] });

const MAX_MEALS = 600;
const MAX_LOG = 2000;

/** Keep only well-formed entries so a client can't stash arbitrary data. */
export function cleanPayload(raw: any): LibraryPayload | null {
  if (!raw || typeof raw !== 'object' || !Array.isArray(raw.meals)) return null;
  const meals = raw.meals
    .slice(0, MAX_MEALS)
    .filter((m: any) => m && typeof m.id === 'string' && typeof m.title === 'string');
  const rejectedMealIds = (Array.isArray(raw.rejectedMealIds) ? raw.rejectedMealIds : [])
    .filter((x: unknown) => typeof x === 'string')
    .slice(0, 1000);
  const cookLog = (Array.isArray(raw.cookLog) ? raw.cookLog : [])
    .slice(0, MAX_LOG)
    .filter((e: any) => e && typeof e.id === 'string' && typeof e.mealId === 'string');
  return { meals, rejectedMealIds, cookLog, replaceLog: raw.replaceLog === true };
}

/** Union by id; entries in `incoming` win (they may carry newer reviews). Newest first. */
export function unionLog(existing: CookLogEntry[], incoming: CookLogEntry[]): CookLogEntry[] {
  const byId = new Map<string, CookLogEntry>();
  for (const e of existing) byId.set(e.id, e);
  for (const e of incoming) byId.set(e.id, e);
  return [...byId.values()].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0)).slice(0, MAX_LOG);
}

/** Recipes and hidden dishes: the latest save wins. History never loses entries. */
export function applyLibraryPut(lib: Library, incoming: LibraryPayload): Library {
  return {
    version: lib.version + 1,
    seeded: true,
    meals: incoming.meals,
    rejectedMealIds: incoming.rejectedMealIds,
    cookLog: incoming.replaceLog ? incoming.cookLog : unionLog(lib.cookLog, incoming.cookLog),
  };
}

/** A phone joining a household that already has a recipe book keeps its own extra recipes and history. */
export function joinPayload(server: LibraryPayload, local: LibraryPayload): LibraryPayload {
  const ids = new Set(server.meals.map((m) => m.id));
  const hidden = new Set(server.rejectedMealIds);
  return {
    meals: [...server.meals, ...local.meals.filter((m) => !ids.has(m.id) && !hidden.has(m.id))],
    rejectedMealIds: server.rejectedMealIds,
    cookLog: unionLog(server.cookLog, local.cookLog),
  };
}
