import { PantryItem, FreshnessLevel } from '../types';
import { alreadyApplied, cleanOpId, remember } from './opIds';

/** One change to the shared fridge. Applied identically on the server and on each phone. */
/** Every op may carry an `opId`; the server skips one it has already applied (a resend after a lost reply). */
export type FridgeOp = { opId?: string } & (
  | { type: 'seed'; items: PantryItem[] } // first phone to arrive fills an empty server; ignored afterwards
  | { type: 'replaceAll'; items: PantryItem[] } // restore a backup or reset
  | { type: 'add'; item: PantryItem }
  | { type: 'cycle'; id: string } // Fresh -> Eat soon -> Use next -> Fresh
  | { type: 'remove'; id: string }
  | { type: 'removeUseNextByNames'; names: string[] } // cooked: take the rescued "use next" items out
);

export interface FridgeState {
  version: number;
  seeded: boolean;
  items: PantryItem[];
  /** Ids of the most recent operations applied, so a repeat is ignored. */
  applied?: string[];
}

const FRESH: FreshnessLevel[] = ['green', 'amber', 'red'];
const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');

export const cleanItem = (raw: any): PantryItem | null => {
  const name = clip(raw?.name, 80);
  if (!name) return null;
  return {
    id: clip(raw?.id, 60) || 'pantry_' + Date.now() + Math.random().toString(36).slice(2, 6),
    name,
    category: clip(raw?.category, 40) || 'Other',
    freshness: FRESH.includes(raw?.freshness) ? raw.freshness : 'green',
    quantity: clip(raw?.quantity, 40) || undefined,
    addedDate: clip(raw?.addedDate, 10) || new Date().toISOString().slice(0, 10),
  };
};

const cleanList = (raw: unknown): PantryItem[] =>
  (Array.isArray(raw) ? raw : []).slice(0, 300).map(cleanItem).filter((i): i is PantryItem => Boolean(i));

/** Pure: returns the new state without touching the old one. */
export function applyFridgeOp(state: FridgeState, op: FridgeOp | any): FridgeState {
  if (!op || typeof op !== 'object') return state;
  const id = cleanOpId(op.opId);
  if (alreadyApplied(state.applied, id)) return state;
  const next = applyOne(state, op);
  return id ? { ...next, applied: remember(state.applied, id) } : next;
}

function applyOne(state: FridgeState, op: any): FridgeState {
  switch (op.type) {
    case 'seed':
      return state.seeded ? state : { ...state, seeded: true, items: cleanList(op.items) };
    case 'replaceAll':
      return { ...state, seeded: true, items: cleanList(op.items) };
    case 'add': {
      const item = cleanItem(op.item);
      if (!item || state.items.some((i) => i.id === item.id)) return state;
      return { ...state, seeded: true, items: [item, ...state.items].slice(0, 300) };
    }
    case 'cycle':
      return {
        ...state,
        items: state.items.map((i) =>
          i.id === op.id ? { ...i, freshness: FRESH[(FRESH.indexOf(i.freshness) + 1) % FRESH.length] } : i
        ),
      };
    case 'remove':
      return { ...state, items: state.items.filter((i) => i.id !== op.id) };
    case 'removeUseNextByNames': {
      const names = (Array.isArray(op.names) ? op.names : []).map((n: unknown) => String(n).toLowerCase());
      return { ...state, items: state.items.filter((i) => !(i.freshness === 'red' && names.includes(i.name.toLowerCase()))) };
    }
    default:
      return state;
  }
}
