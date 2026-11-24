import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import React from 'react';
import { renderToString } from 'react-dom/server';
import {
  isMealCoolingOff,
  getMealCoolingOffDays,
  calculateMealPantryMatch,
  filterEligibleMeals,
  selectWeightedMeal,
  buildComboMeal,
  buildReverseTimerSteps,
} from './dinnerEngine';
import { INITIAL_MEALS, INITIAL_PANTRY, INITIAL_STAPLES } from '../data/initialData';
import { DinnerProvider } from '../context/DinnerContext';
import { MachineView } from '../components/views/MachineView';
import { TakeawayView } from '../components/views/TakeawayView';
import { PantryView } from '../components/views/PantryView';
import { MoreView } from '../components/views/MoreView';
import { DinnerSteps } from '../components/DinnerSteps';
import { WelcomeSheet } from '../components/WelcomeSheet';
import { VotingView } from '../components/views/VotingView';
import { ScorecardView } from '../components/views/ScorecardView';
import { RulesModal } from '../components/RulesModal';
import { ProfileSyncModal } from '../components/ProfileSyncModal';

process.env.NODE_ENV = 'test';
// Keep the suite hermetic: never call the live model from tests (dotenv won't override a defined var).
process.env.GEMINI_API_KEY = '';

test('Cooling-Off Algorithm: 4-day rule boundary verification', () => {
  const now = new Date('2026-11-12T18:00:00Z').getTime();

  const cooked2DaysAgo = {
    ...INITIAL_MEALS[0],
    lastCookedDate: new Date(now - 2 * 86400000).toISOString(),
  };
  assert.equal(isMealCoolingOff(cooked2DaysAgo, now), true);
  assert.equal(getMealCoolingOffDays(cooked2DaysAgo, now), 2);

  const cooked5DaysAgo = {
    ...INITIAL_MEALS[0],
    lastCookedDate: new Date(now - 5 * 86400000).toISOString(),
  };
  assert.equal(isMealCoolingOff(cooked5DaysAgo, now), false);
  assert.equal(getMealCoolingOffDays(cooked5DaysAgo, now), null);
});

test('Eligibility Engine: respects timeStake, effort, and bannedIngredients', () => {
  const res = filterEligibleMeals(INITIAL_MEALS, '20m', 'one-pot', []);
  assert.equal(res.isExactEffortMatch, true);
  assert.ok(res.pool.length > 0);
  for (const m of res.pool) {
    assert.equal(m.timeStake, '20m');
    assert.equal(m.effort, 'one-pot');
  }

  const withBan = filterEligibleMeals(INITIAL_MEALS, '20m', 'one-pot', ['Halloumi']);
  assert.equal(
    withBan.pool.some((m) => m.title.includes('Halloumi')),
    false
  );
});

test('Eligibility Engine: time and effort mean "up to", so wider limits widen the reel', () => {
  const tight = filterEligibleMeals(INITIAL_MEALS, '20m', 'one-pot', []);
  const wide = filterEligibleMeals(INITIAL_MEALS, '30m', 'standard', []);
  assert.ok(wide.pool.length > tight.pool.length);
  for (const m of tight.pool) assert.ok(wide.pool.some((w) => w.id === m.id));
  for (const m of wide.pool) {
    assert.ok(['20m', '30m'].includes(m.timeStake));
    assert.notEqual(m.effort, 'chef-mode');
  }
  const everything = filterEligibleMeals(INITIAL_MEALS, 'all-day', 'chef-mode', []);
  assert.equal(everything.pool.length, INITIAL_MEALS.length);
});

test('4-reel plate: adds a veg reel to the title, shopping list and timeline', () => {
  const plate = buildComboMeal('4-reel', ['Basmati Rice', 'King Prawns', 'Thai Green Coconut', 'Charred Broccoli'], '30m', 'standard');
  assert.equal(plate.title, 'King Prawns with Thai Green Coconut');
  assert.ok(plate.description.includes('Basmati Rice') && plate.description.includes('Charred Broccoli'));
  assert.ok(plate.ingredients.includes('Charred Broccoli'));
  assert.ok(plate.prepSteps.some((s) => s.includes('Charred Broccoli')));
  assert.ok(plate.prepSteps.every((s) => /\(-\d+m\)$/.test(s)));
  assert.ok(plate.tags.includes('4-Reel Custom Combo'));
});

test('Pantry Match Engine: detects stock percentage and Red rescue items', () => {
  const dopiaza = INITIAL_MEALS[1];
  const match = calculateMealPantryMatch(dopiaza, INITIAL_PANTRY, INITIAL_STAPLES);

  assert.ok(match.matchPercentage > 0);
  assert.ok(match.redMatchedItems.includes('Free-Range Chicken Thighs'));
});

test('Dynamic Reel Synthesis: 3-Reel and 4-Reel Sunday Roast generate accurate meals', () => {
  const combo3 = buildComboMeal(
    '3-reel',
    ['Basmati Rice', 'King Prawns', 'Thai Green Coconut'],
    '20m',
    'one-pot'
  );
  assert.equal(combo3.title, 'King Prawns with Thai Green Coconut & Basmati Rice');
  assert.equal(combo3.cuisine, 'Thai');
  assert.equal(combo3.timeStake, '20m');
  assert.equal(combo3.effort, 'one-pot');

  const sunday4 = buildComboMeal(
    'sunday',
    [
      'Crispy Pork Belly',
      'Duck Fat Garlic Parmentier',
      'Cauliflower Vintage Cheese',
      'Buttered Leeks & Red Wine Gravy',
    ],
    'all-day',
    'chef-mode'
  );
  assert.ok(sunday4.title.includes('Crispy Pork Belly'));
  assert.ok(sunday4.title.includes('Duck Fat Garlic Parmentier'));
  assert.equal(sunday4.prepSteps.length, 6);
});

test('Reverse Prep Timer Engine: calculates accurate HH:MM steps from eating time', () => {
  const meal = INITIAL_MEALS[0];
  const steps = buildReverseTimerSteps('19:00', meal);

  assert.equal(steps.length, 6);
  assert.equal(steps[0].timeString, '18:42');
  assert.equal(steps[0].minuteOffset, 18);
  assert.equal(steps[5].timeString, '19:00');
  assert.equal(steps[5].minuteOffset, 0);
});

test('Weighted Selection Engine: deterministic boundary selection', () => {
  const { pool } = filterEligibleMeals(INITIAL_MEALS, '30m', 'standard', []);
  const firstPick = selectWeightedMeal(
    pool,
    INITIAL_PANTRY,
    true,
    'standard',
    Date.now(),
    () => 0.01
  );
  assert.ok(firstPick && firstPick.id);
});

test('Server API Endpoints: health, cloud sync roundtrip, and AI kitchen analysis fallback', async () => {
  const { app } = await import('../../server');
  const server = http.createServer(app);

  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address() as { port: number };
  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // 1. Health endpoint
    const healthRes = await fetch(`${baseUrl}/api/health`);
    assert.equal(healthRes.status, 200);
    const healthJson = await healthRes.json();
    assert.equal(healthJson.status, 'ok');
    assert.equal(healthJson.demoFallbackReady, true);

    // 2. Cloud Sync POST + GET roundtrip
    const syncPost = await fetch(`${baseUrl}/api/sync/cloud`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        data: { meals: INITIAL_MEALS.slice(0, 2), pantry: INITIAL_PANTRY.slice(0, 2) },
      }),
    });
    assert.equal(syncPost.status, 200);
    const syncPostJson = await syncPost.json();
    assert.equal(syncPostJson.success, true);
    assert.equal(syncPostJson.itemCount, 2);

    const syncGet = await fetch(`${baseUrl}/api/sync/cloud`);
    assert.equal(syncGet.status, 200);
    const syncGetJson = await syncGet.json();
    assert.equal(syncGetJson.hasSnapshot, true);
    assert.equal(syncGetJson.data.meals.length, 2);

    // 3. Pantry analyze fallback (recipe-text)
    const analyzeRes = await fetch(`${baseUrl}/api/pantry/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: 'recipe-text',
        textPrompt: 'Smoky Chorizo Bean Casserole',
      }),
    });
    assert.equal(analyzeRes.status, 200);
    const analyzeJson = await analyzeRes.json();
    assert.ok(analyzeJson.meal);
    assert.equal(analyzeJson.meal.title, 'Smoky Chorizo Bean Casserole');

    // 4. "Try a sample" requests are always served locally, even when a live key exists
    const sampleRes = await fetch(`${baseUrl}/api/pantry/analyze`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ type: 'snap-fridge', textPrompt: 'Sample', demo: true }),
    });
    const sampleJson = await sampleRes.json();
    assert.equal(sampleJson.demoMode, true);
    assert.ok(sampleJson.detectedItems.length > 0);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('React UI Component Suite: renders every screen and modal cleanly without error', () => {
  const views = [
    { name: 'MachineView', el: React.createElement(MachineView), expectedText: 'What’s for dinner?' },
    { name: 'TakeawayView', el: React.createElement(TakeawayView), expectedText: 'Spin for takeaway' },
    { name: 'Fridge', el: React.createElement(PantryView, { scope: 'fridge' }), expectedText: '>Fridge</h1>' },
    { name: 'Recipes', el: React.createElement(PantryView, { scope: 'recipes' }), expectedText: '>Recipes</h1>' },
    { name: 'Shopping', el: React.createElement(PantryView, { scope: 'shop' }), expectedText: '>Shopping</h1>' },
    {
      name: 'MoreView',
      el: React.createElement(MoreView, { onOpenProfile: () => {}, onOpenRules: () => {} }),
      expectedText: 'Order takeaway',
    },
    {
      name: 'WelcomeSheet',
      el: React.createElement(WelcomeSheet, { isOpen: true, onClose: () => {} }),
      expectedText: 'Dinner decided in a minute',
    },
    { name: 'DinnerSteps', el: React.createElement(DinnerSteps), expectedText: 'Pick' },
    { name: 'VotingView (nothing proposed yet)', el: React.createElement(VotingView), expectedText: 'Nothing on the table yet' },
    { name: 'ScorecardView', el: React.createElement(ScorecardView), expectedText: '>History</h1>' },
    {
      name: 'RulesModal',
      el: React.createElement(RulesModal, { isOpen: true, onClose: () => {} }),
      expectedText: 'How it works',
    },
    {
      name: 'ProfileSyncModal',
      el: React.createElement(ProfileSyncModal, { isOpen: true, onClose: () => {} }),
      expectedText: 'Household &amp; backup',
    },
  ];

  for (const v of views) {
    const html = renderToString(React.createElement(DinnerProvider, null, v.el));
    assert.ok(
      html.includes(v.expectedText),
      `Expected ${v.name} HTML to include "${v.expectedText}"`
    );
  }
});


test('World Kitchen: 100+ unique, well-formed recipes with timed steps', async () => {
  const { WORLD_RECIPES } = await import('../data/worldRecipes');
  assert.ok(WORLD_RECIPES.length >= 100);
  assert.equal(new Set(WORLD_RECIPES.map((r) => r.id)).size, WORLD_RECIPES.length);
  for (const r of WORLD_RECIPES) {
    assert.ok(['20m', '30m', '60m', 'all-day'].includes(r.timeStake), r.id);
    assert.ok(['one-pot', 'standard', 'chef-mode'].includes(r.effort), r.id);
    assert.ok(r.ingredients.length >= 3, r.id);
    assert.ok(r.prepSteps.every((s) => /\(-\d+m\)$/.test(s)), `${r.id} steps need timings`);
    assert.ok(r.prepSteps[r.prepSteps.length - 1].endsWith('(-0m)'), `${r.id} should end at serving`);
  }
});

test('Tweaks: extra ingredients count for stock and extra steps slot into the timeline', async () => {
  const { withTweaks } = await import('./dinnerEngine');
  const meal = {
    ...INITIAL_MEALS[0],
    tweaks: { extraIngredients: ['Anchovies'], extraSteps: [{ text: 'Toast breadcrumbs', minutesBefore: 9 }] },
  };
  const eff = withTweaks(meal);
  assert.ok(eff.ingredients.includes('Anchovies'));
  assert.equal(INITIAL_MEALS[0].ingredients.includes('Anchovies'), false, 'original recipe untouched');
  const steps = buildReverseTimerSteps('18:30', meal);
  const offsets = steps.map((s) => s.minuteOffset);
  assert.deepEqual(offsets, [...offsets].sort((a, b) => b - a), 'timeline stays in time order');
  assert.ok(steps.some((s) => s.label === 'Toast breadcrumbs' && s.timeString === '18:21'));
});

test('Fridge ops: seed once, add, cycle freshness, remove, rescue use-next items', async () => {
  const { applyFridgeOp } = await import('./fridge');
  const mk = (id: string, name: string, freshness: any) => ({ id, name, category: 'Fridge', freshness, addedDate: '2026-01-01' });
  let st: any = { version: 0, seeded: false, items: [] };
  st = applyFridgeOp(st, { type: 'seed', items: [mk('a', 'Milk', 'green'), mk('b', 'Courgettes', 'red')] });
  assert.equal(st.items.length, 2);
  const again = applyFridgeOp(st, { type: 'seed', items: [mk('z', 'Other', 'green')] });
  assert.equal(again.items.length, 2, 'a second seed is ignored');
  st = applyFridgeOp(st, { type: 'add', item: mk('c', 'Eggs', 'green') });
  assert.equal(st.items[0].name, 'Eggs');
  assert.equal(applyFridgeOp(st, { type: 'add', item: mk('c', 'Eggs', 'green') }).items.length, 3, 'same id is not duplicated');
  st = applyFridgeOp(st, { type: 'cycle', id: 'a' });
  assert.equal(st.items.find((i: any) => i.id === 'a').freshness, 'amber');
  st = applyFridgeOp(st, { type: 'removeUseNextByNames', names: ['courgettes'] });
  assert.equal(st.items.some((i: any) => i.name === 'Courgettes'), false);
  st = applyFridgeOp(st, { type: 'remove', id: 'c' });
  assert.equal(st.items.length, 1);
  assert.equal(applyFridgeOp(st, { type: 'nonsense' }), st);
});

test('Item icons: keywords map to graphics with a basket fallback', async () => {
  const { itemIcon } = await import('./itemIcon');
  assert.equal(itemIcon('Semi-Skimmed Milk'), '🥛');
  assert.equal(itemIcon('Free-Range Chicken Thighs'), '🍗');
  assert.equal(itemIcon('Greek yoghurt'), '🥣');
  assert.equal(itemIcon('Mystery thing'), '🛒');
});

test('Recipe book sync: latest recipes win, history merges, joiners keep their extras', async () => {
  const { emptyLibrary, applyLibraryPut, cleanPayload, joinPayload, unionLog } = await import('./library');
  const meal = (id: string) => ({ id, title: id }) as any;
  const log = (id: string, date: string) => ({ id, mealId: 'm1', title: 'm1', cuisine: 'x', date, rescued: [] }) as any;
  assert.equal(cleanPayload({ nope: 1 }), null);
  assert.equal(cleanPayload({ meals: [{ id: 1 }, meal('ok')], cookLog: [{ id: 'a' }] })!.meals.length, 1, 'malformed entries are dropped');

  let lib = applyLibraryPut(emptyLibrary(), { meals: [meal('a'), meal('b')], rejectedMealIds: ['z'], cookLog: [log('l1', '2026-01-01')] });
  assert.equal(lib.version, 1);
  assert.equal(lib.seeded, true);
  // Another phone saves different recipes and one new dinner: recipes are replaced, history is merged.
  lib = applyLibraryPut(lib, { meals: [meal('a')], rejectedMealIds: [], cookLog: [log('l2', '2026-02-01')] });
  assert.deepEqual(lib.meals.map((m: any) => m.id), ['a']);
  assert.deepEqual(lib.cookLog.map((e: any) => e.id), ['l2', 'l1'], 'newest first, nothing lost');
  // A deliberate reset replaces the log.
  lib = applyLibraryPut(lib, { meals: [meal('a')], rejectedMealIds: [], cookLog: [], replaceLog: true });
  assert.equal(lib.cookLog.length, 0);

  const joined = joinPayload(
    { meals: [meal('a')], rejectedMealIds: ['gone'], cookLog: [log('l1', '2026-01-01')] },
    { meals: [meal('a'), meal('mine'), meal('gone')], rejectedMealIds: [], cookLog: [log('l9', '2026-03-01')] }
  );
  assert.deepEqual(joined.meals.map((m: any) => m.id), ['a', 'mine'], 'own recipe kept, hidden dish not resurrected');
  assert.equal(joined.cookLog.length, 2);
  assert.equal(unionLog([log('x', '2026-01-01')], [{ ...log('x', '2026-01-01'), title: 'edited' }])[0].title, 'edited');
});

test('Rooms: create, join, update, sanitise and expire', async () => {
  const { RoomStore, cleanState, normaliseCode } = await import('./rooms');
  let t = 1000;
  const store = new RoomStore(() => t, () => 0.5);
  const state = cleanState({ members: [{ id: 'a' }], proposedMeal: { id: 'm1' }, agreedMeal: null, ballot: { a: 'yes', b: 'maybe' } });
  assert.ok(state);
  assert.deepEqual(state!.ballot, { a: 'yes' }, 'invalid votes are dropped');
  assert.equal(cleanState('nope'), null);
  const room = store.create(state!)!;
  assert.equal(room.code.length, 4);
  assert.equal(store.get(room.code.toLowerCase())?.version, 1);
  const updated = store.update(room.code, { ...state!, ballot: { a: 'yes', b: 'no' } })!;
  assert.equal(updated.version, 2);
  assert.equal(store.get('ZZZZ'), null);
  assert.equal(normaliseCode(' ab-c1d9 '), 'ABC1');
  t += 25 * 60 * 60 * 1000;
  assert.equal(store.get(room.code), null, 'rooms expire after a day');
});

test('Supermarket links: every store builds a safe, encoded search URL', async () => {
  const { STORES } = await import('./stores');
  assert.ok(STORES.length >= 4);
  for (const st of STORES) {
    const url = st.searchUrl('Greek yoghurt & honey');
    assert.ok(url.startsWith('https://'), st.id);
    assert.ok(url.includes('Greek%20yoghurt%20%26%20honey'), `${st.id} should encode the item`);
    assert.equal(url.includes(' '), false);
  }
});

test('Shopping list ops: add dedupes, ticks record who, clear removes ticked', async () => {
  const { applyShoppingOp } = await import('./shopping');
  let items = applyShoppingOp([], { type: 'add', item: { id: 'a', name: 'Limes', forMeal: 'Pad Thai' } });
  items = applyShoppingOp(items, { type: 'add', item: { id: 'b', name: 'limes' } });
  assert.equal(items.length, 1, 'no duplicate while still to buy');
  items = applyShoppingOp(items, { type: 'toggle', id: 'a', by: 'Mum' });
  assert.equal(items[0].checked, true);
  assert.equal(items[0].checkedBy, 'Mum');
  items = applyShoppingOp(items, { type: 'add', item: { id: 'c', name: 'Rice Noodles' } });
  items = applyShoppingOp(items, { type: 'removeByName', name: 'rice noodles' });
  assert.equal(items.length, 1);
  items = applyShoppingOp(items, { type: 'clearChecked' });
  assert.equal(items.length, 0);
});

test('Server: shared shopping list round trip', async () => {
  const { app } = await import('../../server');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  try {
    const post = await fetch(`http://127.0.0.1:${port}/api/shopping/ops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ops: [{ type: 'add', item: { id: 'x1', name: 'Saffron' } }, { type: 'toggle', id: 'x1', by: 'Dad' }] }),
    });
    const json = await post.json();
    assert.equal(json.items.find((i: any) => i.id === 'x1').checkedBy, 'Dad');
    const get = await (await fetch(`http://127.0.0.1:${port}/api/shopping`)).json();
    assert.equal(get.version, json.version);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
