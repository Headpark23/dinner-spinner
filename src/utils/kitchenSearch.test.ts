import test from 'node:test';
import assert from 'node:assert/strict';
import { searchKitchen } from './kitchenSearch';
import type { CupboardItem, FreezerItem, PantryItem } from '../types';

const fridge = (id: string, name: string, freshness: PantryItem['freshness'] = 'green'): PantryItem => ({
  id,
  name,
  category: 'Fridge',
  freshness,
  addedDate: '2026-11-25',
});
const shelf = (id: string, name: string, low = false): CupboardItem => ({ id, name, shelf: 'Tins', low });
const frozen = (id: string, name: string, portions: number, note?: string): FreezerItem => ({
  id,
  name,
  portions,
  totalPortions: 4,
  frozenDate: '2026-11-01T00:00:00Z',
  note,
});

const stock = {
  pantry: [fridge('p1', 'Cherry tomatoes', 'red'), fridge('p2', 'Chicken thighs'), fridge('p3', 'Milk')],
  cupboard: [shelf('c1', 'Tinned tomatoes', true), shelf('c2', 'Chickpeas')],
  freezer: [frozen('f1', 'Chicken curry', 2, 'Blue tub'), frozen('f2', 'Peas', 0)],
  staples: ['Olive oil', 'Salt'],
};

test('finds an item in every place it is kept, best matches first', () => {
  const r = searchKitchen('chick', stock);
  assert.deepEqual(
    r.map((h) => `${h.place}:${h.name}`),
    ['fridge:Chicken thighs', 'freezer:Chicken curry', 'cupboard:Chickpeas']
  );
  assert.equal(r[1].detail, '2 portions left · Blue tub');
});

test('plural, word-start and case do not matter; used-up freezer items are skipped', () => {
  assert.deepEqual(
    searchKitchen('Tomato', stock).map((h) => h.name),
    ['Cherry tomatoes', 'Tinned tomatoes']
  );
  assert.equal(searchKitchen('tomato', stock)[0].warn, true);
  assert.equal(searchKitchen('peas', stock).length, 0);
  assert.deepEqual(searchKitchen('oil', stock).map((h) => h.place), ['staples']);
  assert.equal(searchKitchen('   ', stock).length, 0);
});
