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

async function withServer(run: (baseUrl: string) => Promise<void>) {
  const { app } = await import('../../server');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}

const json = { 'Content-Type': 'application/json' };
const authed = (h: { householdId: string; key: string }) => ({
  ...json,
  'x-household-id': h.householdId,
  'x-household-key': h.key,
});
async function newHousehold(baseUrl: string) {
  const res = await fetch(`${baseUrl}/api/households`, { method: 'POST' });
  assert.equal(res.status, 201);
  return (await res.json()) as { householdId: string; key: string; code: string };
}

test('Server: health reveals nothing sensitive', async () => {
  await withServer(async (baseUrl) => {
    const body = await (await fetch(`${baseUrl}/api/health`)).json();
    assert.equal(body.status, 'ok');
    assert.equal(body.hasGeminiKey, undefined);
    assert.equal(body.hasCloudSnapshot, undefined);
  });
});

test('Server: data routes refuse callers without a valid household code', async () => {
  await withServer(async (baseUrl) => {
    for (const [method, path] of [
      ['GET', '/api/sync/cloud'],
      ['POST', '/api/sync/cloud'],
      ['GET', '/api/shopping'],
      ['POST', '/api/shopping/ops'],
      ['GET', '/api/households/me'],
    ]) {
      const res = await fetch(`${baseUrl}${path}`, {
        method,
        headers: json,
        body: method === 'POST' ? JSON.stringify({ data: { meals: [] }, ops: [{ type: 'clearChecked' }] }) : undefined,
      });
      assert.equal(res.status, 401, `${method} ${path} should be 401`);
    }
    const h = await newHousehold(baseUrl);
    const wrongKey = await fetch(`${baseUrl}/api/sync/cloud`, {
      headers: { 'x-household-id': h.householdId, 'x-household-key': 'nope' },
    });
    assert.equal(wrongKey.status, 401);
    // Prototype keys must not be treated as households.
    const proto = await fetch(`${baseUrl}/api/sync/cloud`, {
      headers: { 'x-household-id': '__proto__', 'x-household-key': 'x' },
    });
    assert.equal(proto.status, 401);
  });
});

test('Server: cloud copy round trip, isolated per household', async () => {
  await withServer(async (baseUrl) => {
    const a = await newHousehold(baseUrl);
    const b = await newHousehold(baseUrl);

    const post = await fetch(`${baseUrl}/api/sync/cloud`, {
      method: 'POST',
      headers: authed(a),
      body: JSON.stringify({ data: { meals: INITIAL_MEALS.slice(0, 2), pantry: INITIAL_PANTRY.slice(0, 2) } }),
    });
    assert.equal(post.status, 200);
    assert.equal((await post.json()).itemCount, 2);

    const getA = await (await fetch(`${baseUrl}/api/sync/cloud`, { headers: authed(a) })).json();
    assert.equal(getA.hasSnapshot, true);
    assert.equal(getA.data.meals.length, 2);

    // Household B never sees A's copy, and cannot overwrite it.
    const getB = await (await fetch(`${baseUrl}/api/sync/cloud`, { headers: authed(b) })).json();
    assert.equal(getB.hasSnapshot, false);
    await fetch(`${baseUrl}/api/sync/cloud`, {
      method: 'POST',
      headers: authed(b),
      body: JSON.stringify({ data: { meals: [] } }),
    });
    const getA2 = await (await fetch(`${baseUrl}/api/sync/cloud`, { headers: authed(a) })).json();
    assert.equal(getA2.data.meals.length, 2);

    const bad = await fetch(`${baseUrl}/api/sync/cloud`, {
      method: 'POST',
      headers: authed(a),
      body: JSON.stringify({ data: [1, 2] }),
    });
    assert.equal(bad.status, 400);
  });
});

test('Server: shared shopping list round trip, isolated per household', async () => {
  await withServer(async (baseUrl) => {
    const a = await newHousehold(baseUrl);
    const b = await newHousehold(baseUrl);
    const post = await fetch(`${baseUrl}/api/shopping/ops`, {
      method: 'POST',
      headers: authed(a),
      body: JSON.stringify({ ops: [{ type: 'add', item: { id: 'x1', name: 'Saffron' } }, { type: 'toggle', id: 'x1', by: 'Dad' }] }),
    });
    const body = await post.json();
    assert.equal(body.items.find((i: any) => i.id === 'x1').checkedBy, 'Dad');
    const get = await (await fetch(`${baseUrl}/api/shopping`, { headers: authed(a) })).json();
    assert.equal(get.version, body.version);
    const other = await (await fetch(`${baseUrl}/api/shopping`, { headers: authed(b) })).json();
    assert.equal(other.items.length, 0);
  });
});

test('Server: scanning never invents a result for something the user asked for', async () => {
  await withServer(async (baseUrl) => {
    // No AI key in tests: a real request is refused honestly...
    const real = await fetch(`${baseUrl}/api/pantry/analyze`, {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ type: 'recipe-text', textPrompt: 'Beef and Guinness stew' }),
    });
    assert.equal(real.status, 503);
    assert.match((await real.json()).error, /Try a sample/);

    // ...while "Try a sample" is served locally, flagged as sample data, ignoring typed text.
    const sample = await (
      await fetch(`${baseUrl}/api/pantry/analyze`, {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ type: 'recipe-text', textPrompt: 'Beef stew', demo: true }),
      })
    ).json();
    assert.equal(sample.demoMode, true);
    assert.notEqual(sample.meal.title, 'Beef stew');

    const fridge = await (
      await fetch(`${baseUrl}/api/pantry/analyze`, {
        method: 'POST',
        headers: json,
        body: JSON.stringify({ type: 'snap-fridge', demo: true }),
      })
    ).json();
    assert.equal(fridge.demoMode, true);
    assert.ok(fridge.detectedItems.length > 0);
  });
});

test('Server: the old fake sign-in endpoint is gone and large bodies are refused', async () => {
  await withServer(async (baseUrl) => {
    const fake = await fetch(`${baseUrl}/api/auth/profile`, { method: 'POST', headers: json, body: '{}' });
    assert.notEqual(fake.status, 200);
    const h = await newHousehold(baseUrl);
    const big = await fetch(`${baseUrl}/api/sync/cloud`, {
      method: 'POST',
      headers: authed(h),
      body: JSON.stringify({ data: { blob: 'x'.repeat(1_200_000) } }),
    });
    assert.equal(big.status, 413);
  });
});

test('Backup check: rejects damaged files, accepts real ones', async () => {
  const { checkBackup } = await import('./backup');
  assert.equal(checkBackup(null).ok, false);
  assert.equal(checkBackup({ hello: 'world' }).ok, false);
  assert.equal(checkBackup({ meals: [{ id: 'x' }] }).ok, false, 'meal missing fields');
  assert.equal(checkBackup({ members: [] }).ok, false, 'empty household');
  assert.equal(checkBackup({ staples: [1, 2] }).ok, false);
  const good = checkBackup({ data: { meals: INITIAL_MEALS, pantry: INITIAL_PANTRY, members: [{ id: 'm', name: 'A', vetoTokensRemaining: 3 }] } });
  assert.equal(good.ok, true);
  if (good.ok) assert.equal(good.summary.recipes, INITIAL_MEALS.length);
});

test('Fresh start: a new household sees no invented history, family, fridge or dislikes', async () => {
  const { STARTER_MEALS, STARTER_MEMBERS, STARTER_TAKEAWAYS, INITIAL_USER_PROFILE } = await import('../data/initialData');
  assert.ok(STARTER_MEALS.length > 0);
  for (const m of STARTER_MEALS) {
    assert.equal(m.cookCount, 0);
    assert.equal(m.lastCookedDate, null);
    assert.equal(m.rating, 0);
    assert.equal(m.isFavorite, false);
  }
  assert.equal(STARTER_MEMBERS.length, 1);
  assert.ok(STARTER_TAKEAWAYS.every((t) => t.usualOrders.length === 0));
  assert.equal(INITIAL_USER_PROFILE.email, '');
  assert.equal(INITIAL_USER_PROFILE.avatarUrl, '');
});

test('React UI Component Suite: renders all 5 Cabinet Views and Modals cleanly without error', () => {
  const views = [
    { name: 'MachineView', el: React.createElement(MachineView), expectedText: 'What’s for dinner?' },
    { name: 'TakeawayView', el: React.createElement(TakeawayView), expectedText: 'Spin for takeaway' },
    { name: 'PantryView', el: React.createElement(PantryView), expectedText: '>Kitchen</h1>' },
    { name: 'VotingView', el: React.createElement(VotingView), expectedText: 'Nothing on the table yet' },
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


test('Eligibility Engine: "any" time and effort keeps the whole non-banned pool', () => {
  const all = filterEligibleMeals(INITIAL_MEALS, 'any', 'any', []);
  assert.equal(all.pool.length, INITIAL_MEALS.length);
  assert.equal(all.isExactEffortMatch, true);

  const anyTime = filterEligibleMeals(INITIAL_MEALS, 'any', 'one-pot', []);
  assert.ok(anyTime.pool.length > 0 && anyTime.pool.every((m) => m.effort === 'one-pot'));

  const banned = filterEligibleMeals(INITIAL_MEALS, 'any', 'any', ['Halloumi']);
  assert.equal(banned.pool.some((m) => m.title.includes('Halloumi')), false);

  const pick = selectWeightedMeal(all.pool, [], false, 'any', Date.now(), () => 0.5);
  assert.ok(pick && pick.id);
});
