import { ShoppingItem } from '../types';
import { alreadyApplied, cleanOpId, remember } from './opIds';

/** One change to the shared shopping list. Applied identically on the server and on the phone. */
/** Every op may carry an `opId`; the server skips one it has already applied (a resend after a lost reply). */
export type ShoppingOp = { opId?: string } & (
  | { type: 'add'; item: { id?: string; name: string; forMeal?: string; addedBy?: string } }
  | { type: 'set'; id: string; checked: boolean; by?: string }
  | { type: 'toggle'; id: string; by?: string }
  | { type: 'remove'; id: string }
  | { type: 'removeByName'; name: string }
  | { type: 'clearChecked' }
);

/** The shared list as the server keeps it. */
export interface ShoppingState {
  version: number;
  items: ShoppingItem[];
  /** Ids of the most recent operations applied, so a repeat is ignored. */
  applied?: string[];
}

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : undefined);

export const newShoppingId = () => `s_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

export function applyShoppingOp(items: ShoppingItem[], op: ShoppingOp | any): ShoppingItem[] {
  const now = new Date().toISOString();
  if (!op || typeof op !== 'object') return items;
  switch (op.type) {
    case 'add': {
      const name = clip(op.item?.name, 80);
      if (!name) return items;
      // Never duplicate something that's already waiting to be bought.
      if (items.some((i) => !i.checked && i.name.toLowerCase() === name.toLowerCase())) return items;
      return [
        ...items,
        {
          id: clip(op.item?.id, 60) || newShoppingId(),
          name,
          forMeal: clip(op.item?.forMeal, 120),
          addedBy: clip(op.item?.addedBy, 40),
          checked: false,
          updatedAt: now,
        },
      ].slice(-300);
    }
    case 'set':
    case 'toggle':
      return items.map((i) => {
        if (i.id !== op.id) return i;
        const checked = op.type === 'set' ? Boolean(op.checked) : !i.checked;
        return { ...i, checked, checkedBy: checked ? clip(op.by, 40) : undefined, updatedAt: now };
      });
    case 'remove':
      return items.filter((i) => i.id !== op.id);
    case 'removeByName': {
      const name = String(op.name || '').toLowerCase();
      return items.filter((i) => i.checked || i.name.toLowerCase() !== name);
    }
    case 'clearChecked':
      return items.filter((i) => !i.checked);
    default:
      return items;
  }
}

/** Applies one operation to the whole shared list, skipping it if its id was already applied. */
export function applyShoppingOpToState(state: ShoppingState, op: ShoppingOp | any): ShoppingState {
  if (!op || typeof op !== 'object') return state;
  const id = cleanOpId(op.opId);
  if (alreadyApplied(state.applied, id)) return state;
  const items = applyShoppingOp(state.items, op);
  return id ? { ...state, items, applied: remember(state.applied, id) } : { ...state, items };
}
