import type { ShoppingItem } from '../types/index.js';

/** One change to the shared shopping list. Applied identically on the server and on the phone. */
export type ShoppingOp =
  | { type: 'add'; item: { id?: string; name: string; forMeal?: string; addedBy?: string } }
  | { type: 'set'; id: string; checked: boolean; by?: string }
  | { type: 'toggle'; id: string; by?: string }
  | { type: 'remove'; id: string }
  | { type: 'removeByName'; name: string }
  | { type: 'clearChecked' };

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
