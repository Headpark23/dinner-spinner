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

test('React UI Component Suite: renders all 5 Cabinet Views and Modals cleanly without error', () => {
  const views = [
    { name: 'MachineView', el: React.createElement(MachineView), expectedText: 'What’s for dinner?' },
    { name: 'TakeawayView', el: React.createElement(TakeawayView), expectedText: 'Spin for takeaway' },
    { name: 'PantryView', el: React.createElement(PantryView), expectedText: '>Pantry</h1>' },
    { name: 'VotingView', el: React.createElement(VotingView), expectedText: 'Who’s voting?' },
    { name: 'ScorecardView', el: React.createElement(ScorecardView), expectedText: 'Your kitchen' },
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
