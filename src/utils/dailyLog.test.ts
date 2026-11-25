import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeRestockSuggestions,
  findExistingStockMatches,
  groupDailyLogByDay,
  matchKitchenStockForItems,
  topConsumedIngredients,
} from './dailyLog';
import type { CupboardItem, DailyLogEntry, FreezerItem, PantryItem, ShoppingItem } from '../types';

test('matchKitchenStockForItems matches fridge, stocked cupboard, and active freezer items', () => {
  const pantry: PantryItem[] = [
    { id: 'f1', name: 'Free-Range Chicken Thighs 600g', category: 'Meat & Fish', freshness: 'red', addedDate: '2026-11-24' },
    { id: 'f2', name: 'Semi-Skimmed Milk', category: 'Dairy & Eggs', freshness: 'green', addedDate: '2026-11-24' },
  ];
  const cupboard: CupboardItem[] = [
    { id: 'c1', name: 'Tinned Chopped Tomatoes', shelf: 'Tins & jars' },
    { id: 'c2', name: 'Smoked Paprika', shelf: 'Herbs & spices', low: true },
  ];
  const freezer: FreezerItem[] = [
    { id: 'z1', name: 'Beef Bolognese', portions: 2, totalPortions: 4, frozenDate: '2026-11-10' },
    { id: 'z2', name: 'Peas', portions: 0, totalPortions: 2, frozenDate: '2026-11-01' },
  ];

  const matches = matchKitchenStockForItems({
    ingredients: ['400g chicken thighs', '1 tin chopped tomatoes', 'smoked paprika', 'beef bolognese', 'peas'],
    pantry,
    cupboard,
    freezer,
  });

  assert.deepEqual(
    matches.map((m) => ({ source: m.source, id: m.id, action: m.defaultAction })),
    [
      { source: 'fridge', id: 'f1', action: 'removed' },
      { source: 'cupboard', id: 'c1', action: 'marked-low' },
      { source: 'freezer', id: 'z1', action: 'portion-used' },
    ]
  );
});

test('computeRestockSuggestions surfaces low cupboard and finished fridge items, skipping stocked or already on list', () => {
  const now = new Date('2026-11-25T12:00:00Z');
  const pantry: PantryItem[] = [
    { id: 'f1', name: 'Eggs', category: 'Dairy & Eggs', freshness: 'green', addedDate: '2026-11-25' },
  ];
  const cupboard: CupboardItem[] = [
    { id: 'c1', name: 'Olive Oil', shelf: 'Oils & vinegars', low: true },
    { id: 'c2', name: 'Soy Sauce', shelf: 'Sauces & condiments', low: true },
  ];
  const shoppingList: ShoppingItem[] = [
    { id: 's1', name: 'Soy Sauce', checked: false, updatedAt: '2026-11-25T10:00:00Z' },
  ];
  const dailyLog: DailyLogEntry[] = [
    {
      id: 'd1',
      date: '2026-11-25T08:00:00Z',
      day: '2026-11-25',
      slot: 'breakfast',
      kind: 'meal',
      title: 'Porridge & Milk',
      usedItems: [
        { name: 'Semi-Skimmed Milk', source: 'fridge', action: 'removed' },
        { name: 'Eggs', source: 'fridge', action: 'removed' }, // back in fridge now -> excluded
      ],
    },
    {
      id: 'd2',
      date: '2026-11-23T08:00:00Z',
      day: '2026-11-23',
      slot: 'breakfast',
      kind: 'ingredients',
      title: 'Used Semi-Skimmed Milk',
      usedItems: [{ name: 'Semi-Skimmed Milk', source: 'fridge', action: 'removed' }],
    },
  ];

  const restock = computeRestockSuggestions({
    dailyLog,
    pantry,
    cupboard,
    freezer: [],
    shoppingList,
    now,
  });

  assert.deepEqual(
    restock.map((r) => r.name),
    ['Semi-Skimmed Milk', 'Olive Oil']
  );
  assert.equal(restock[0].usedCount, 2);
});

test('groupDailyLogByDay orders slots Breakfast -> Lunch -> Dinner -> Snack and aggregates top consumed items', () => {
  const log: DailyLogEntry[] = [
    {
      id: '1',
      date: '2026-11-25T19:00:00Z',
      day: '2026-11-25',
      slot: 'dinner',
      kind: 'meal',
      title: 'Pasta',
      usedItems: [{ name: 'Garlic', source: 'fridge', action: 'removed' }],
    },
    {
      id: '2',
      date: '2026-11-25T08:00:00Z',
      day: '2026-11-25',
      slot: 'breakfast',
      kind: 'meal',
      title: 'Eggs on toast',
      usedItems: [{ name: 'Eggs', source: 'fridge', action: 'removed' }],
    },
    {
      id: '3',
      date: '2026-11-24T13:00:00Z',
      day: '2026-11-24',
      slot: 'lunch',
      kind: 'meal',
      title: 'Omelette',
      usedItems: [{ name: 'Eggs', source: 'fridge', action: 'removed' }],
    },
  ];

  const groups = groupDailyLogByDay(log);
  assert.equal(groups.length, 2);
  assert.equal(groups[0].day, '2026-11-25');
  assert.deepEqual(
    groups[0].entries.map((e) => e.slot),
    ['breakfast', 'dinner']
  );

  const top = topConsumedIngredients(log);
  assert.equal(top[0].name, 'Eggs');
  assert.equal(top[0].count, 2);
});

test('findExistingStockMatches nudges on stocked fridge/cupboard/freezer items but ignores low cupboard and empty freezer', () => {
  const stock = {
    pantry: [{ id: 'f1', name: 'Semi-Skimmed Milk', category: 'Dairy & Eggs', freshness: 'green' as const, addedDate: '2026-11-25' }],
    cupboard: [
      { id: 'c1', name: 'Chopped Tomatoes', shelf: 'Tins & jars' },
      { id: 'c2', name: 'Olive Oil', shelf: 'Oils & vinegars', low: true },
    ],
    freezer: [
      { id: 'z1', name: 'Chicken Curry', portions: 2, totalPortions: 4, frozenDate: '2026-11-20' },
      { id: 'z2', name: 'Sweetcorn', portions: 0, totalPortions: 2, frozenDate: '2026-11-01' },
    ],
  };

  assert.equal(findExistingStockMatches('milk', stock)[0]?.source, 'fridge');
  assert.equal(findExistingStockMatches('tomatoes', stock)[0]?.source, 'cupboard');
  assert.equal(findExistingStockMatches('chicken curry', stock)[0]?.source, 'freezer');
  assert.equal(findExistingStockMatches('olive oil', stock).length, 0);
  assert.equal(findExistingStockMatches('sweetcorn', stock).length, 0);
});
