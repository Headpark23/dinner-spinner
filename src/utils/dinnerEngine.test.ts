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

test('Server: shared fridge and cooking history, isolated per household', async () => {
  await withServer(async (baseUrl) => {
    for (const [method, path] of [['GET', '/api/fridge'], ['POST', '/api/fridge/ops'], ['GET', '/api/history'], ['POST', '/api/history']]) {
      const res = await fetch(`${baseUrl}${path}`, { method, headers: json, body: method === 'POST' ? JSON.stringify({ ops: [{ type: 'remove', id: 'x' }] }) : undefined });
      assert.equal(res.status, 401, `${method} ${path} should be 401`);
    }
    const a = await newHousehold(baseUrl);
    const b = await newHousehold(baseUrl);
    const item = (id: string, name: string, freshness = 'green') => ({ id, name, category: 'Fridge', freshness, addedDate: '2026-01-01' });
    const send = (h: any, ops: any[]) => fetch(`${baseUrl}/api/fridge/ops`, { method: 'POST', headers: authed(h), body: JSON.stringify({ ops }) }).then((r) => r.json());

    const empty = await (await fetch(`${baseUrl}/api/fridge`, { headers: authed(a) })).json();
    assert.equal(empty.seeded, false);
    const first = await send(a, [{ type: 'seed', items: [item('f1', 'Milk'), item('f2', 'Courgettes', 'red')] }]);
    assert.equal(first.items.length, 2);
    const second = await send(a, [{ type: 'seed', items: [item('z', 'Other')] }]);
    assert.equal(second.items.length, 2, 'a second phone cannot overwrite the first seed');
    const edited = await send(a, [{ type: 'cycle', id: 'f1' }, { type: 'add', item: item('f3', 'Eggs') }, { type: 'remove', id: 'f2' }]);
    assert.deepEqual(edited.items.map((i: any) => i.id).sort(), ['f1', 'f3']);
    assert.equal(edited.items.find((i: any) => i.id === 'f1').freshness, 'amber');
    assert.equal((await (await fetch(`${baseUrl}/api/fridge`, { headers: authed(b) })).json()).items.length, 0, 'other households see nothing');

    const log = (id: string, date: string, title = 'Curry') => ({ id, mealId: 'm1', title, cuisine: 'x', date, rescued: [] });
    const postHistory = (h: any, body: any) => fetch(`${baseUrl}/api/history`, { method: 'POST', headers: authed(h), body: JSON.stringify(body) }).then((r) => r.json());
    await postHistory(a, { entries: [log('l1', '2026-01-01')] });
    const merged = await postHistory(a, { entries: [log('l2', '2026-02-01'), { id: 5 }] });
    assert.deepEqual(merged.entries.map((e: any) => e.id), ['l2', 'l1'], 'newest first, junk dropped, nothing lost');
    const reset = await postHistory(a, { entries: [], replace: true });
    assert.equal(reset.entries.length, 0);
    assert.equal((await (await fetch(`${baseUrl}/api/history`, { headers: authed(b) })).json()).entries.length, 0);
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

test('React UI Component Suite: renders every screen and modal cleanly without error', () => {
  const views = [
    { name: 'MachineView', el: React.createElement(MachineView), expectedText: 'What’s for dinner?' },
    { name: 'TakeawayView', el: React.createElement(TakeawayView), expectedText: 'Spin for takeaway' },
    { name: 'Fridge', el: React.createElement(PantryView, { scope: 'fridge' }), expectedText: '>Fridge</h1>' },
    { name: 'Recipes', el: React.createElement(PantryView, { scope: 'recipes' }), expectedText: '>Recipes</h1>' },
    { name: 'Shopping', el: React.createElement(PantryView, { scope: 'shop' }), expectedText: '>Shopping</h1>' },
    {
      name: 'MoreView',
      el: React.createElement(MoreView, { onOpenProfile: () => {}, onOpenRules: () => {}, onOpenFamily: () => {} }),
      expectedText: 'Order takeaway',
    },
    { name: 'DinnerSteps', el: React.createElement(DinnerSteps), expectedText: 'Pick' },
    { name: 'VotingView', el: React.createElement(VotingView), expectedText: 'Nothing on the table yet' },
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

test('Server: live tonight vote - majority agrees, any veto ends the round, outsiders refused', async () => {
  await withServer(async (baseUrl) => {
    const a = await newHousehold(baseUrl);
    const b = await newHousehold(baseUrl);
    const post = (h: any, body: any) =>
      fetch(`${baseUrl}/api/tonight`, { method: 'POST', headers: authed(h), body: JSON.stringify(body) });
    const meal = { ...INITIAL_MEALS[0] };

    assert.equal((await fetch(`${baseUrl}/api/tonight`)).status, 401);
    assert.equal((await (await fetch(`${baseUrl}/api/tonight`, { headers: authed(a) })).json()).status, 'idle');

    // Bad proposals are refused.
    assert.equal((await post(a, { op: 'propose', meal: { title: 'x' }, people: ['Sam'] })).status, 400);
    assert.equal((await post(a, { op: 'propose', meal, people: [] })).status, 400);

    // Three people, two yes votes needed.
    let t = await (await post(a, { op: 'propose', meal, people: ['Sam', 'Jo', 'Alex'], needed: 2, by: 'Sam' })).json();
    assert.equal(t.status, 'open');
    assert.equal(t.round, 1);
    assert.equal((await post(a, { op: 'vote', voter: 'Nobody', vote: 'yes' })).status, 400);
    t = await (await post(a, { op: 'vote', voter: 'sam', vote: 'yes' })).json();
    assert.equal(t.status, 'open', 'one yes is not enough');
    t = await (await post(a, { op: 'vote', voter: 'Jo', vote: 'yes' })).json();
    assert.equal(t.status, 'agreed');
    assert.equal((await post(a, { op: 'vote', voter: 'Alex', vote: 'no' })).status, 409, 'closed rounds take no more votes');

    // A veto ends a round straight away.
    t = await (await post(a, { op: 'propose', meal, people: ['Sam', 'Jo'], needed: 2 })).json();
    assert.equal(t.round, 2);
    t = await (await post(a, { op: 'vote', voter: 'Jo', vote: 'no' })).json();
    assert.equal(t.status, 'vetoed');
    assert.equal(t.vetoedBy, 'Jo');

    // "Just decide" closes an open vote as agreed.
    await post(a, { op: 'propose', meal, people: ['Sam', 'Jo'], needed: 2 });
    assert.equal((await (await post(a, { op: 'decide' })).json()).status, 'agreed');

    // Households never see each other's votes.
    assert.equal((await (await fetch(`${baseUrl}/api/tonight`, { headers: authed(b) })).json()).status, 'idle');
    assert.equal((await (await post(a, { op: 'clear' })).json()).status, 'idle');
  });
});

// ---------------------------------------------------------------------------
// Diets, quantities and scaling
// ---------------------------------------------------------------------------
import { ingredientBreaks, mealFitsDiets } from './diets';
import { scaleQuantity, quantityFor, baseQuantity } from './quantities';
import { WORLD_RECIPES } from '../data/worldRecipes';
import quantityTable from '../data/quantities.json';

test('Diets: obvious breaches are caught and safe look-alikes are not', () => {
  assert.equal(ingredientBreaks('Chicken Thighs', ['vegetarian']), 'vegetarian');
  assert.equal(ingredientBreaks('Prawns', ['vegetarian']), 'vegetarian');
  assert.equal(ingredientBreaks('Prawns', ['pescatarian']), null);
  assert.equal(ingredientBreaks('Streaky Bacon', ['pescatarian']), 'pescatarian');
  assert.equal(ingredientBreaks('Honey', ['vegan']), 'vegan');
  assert.equal(ingredientBreaks('Free-range Eggs', ['vegan']), 'vegan');
  assert.equal(ingredientBreaks('Aubergine', ['vegan']), null);
  assert.equal(ingredientBreaks('Eggplant', ['vegan']), null, 'eggplant is not an egg');
  assert.equal(ingredientBreaks('Coconut Milk', ['dairy-free']), null);
  assert.equal(ingredientBreaks('Whole Milk', ['dairy-free']), 'dairy-free');
  assert.equal(ingredientBreaks('Butter Beans', ['dairy-free']), null);
  assert.equal(ingredientBreaks('Butternut Squash', ['dairy-free']), null);
  assert.equal(ingredientBreaks('Peanut Butter', ['dairy-free']), null);
  assert.equal(ingredientBreaks('Plain Flour', ['gluten-free']), 'gluten-free');
  assert.equal(ingredientBreaks('Rice Noodles', ['gluten-free']), null);
  assert.equal(ingredientBreaks('Buckwheat', ['gluten-free']), null);
  assert.equal(ingredientBreaks('Soy Sauce', ['gluten-free']), 'gluten-free');
  assert.equal(ingredientBreaks('Pine Nuts', ['nut-free']), 'nut-free');
  assert.equal(ingredientBreaks('Coconut Milk', ['nut-free']), null);
  assert.equal(ingredientBreaks('Nutmeg', ['nut-free']), null);
  assert.equal(ingredientBreaks('Minced Garlic', ['vegetarian']), null, 'minced garlic is not mince');
  assert.equal(mealFitsDiets(['Lamb Mince', 'Onion'], []), true);
});

test('Diets: the spinner pool is strict and never falls back to a clashing dish', () => {
  const veg = filterEligibleMeals(INITIAL_MEALS, 'any', 'any', [], ['vegetarian']);
  assert.ok(veg.pool.length > 0);
  assert.ok(veg.pool.every((m) => mealFitsDiets(m.ingredients, ['vegetarian'])));
  const none = filterEligibleMeals(
    [{ ...INITIAL_MEALS[0], ingredients: ['Beef Mince'] }],
    'any',
    'any',
    [],
    ['vegan']
  );
  assert.equal(none.pool.length, 0, 'an all-meat library yields an empty pool for a vegan household');
  // Same inputs without diets still behave as before.
  assert.ok(filterEligibleMeals(INITIAL_MEALS, 'any', 'any', []).pool.length === INITIAL_MEALS.length);
});

test('Quantities: scaling keeps units, handles counts, ranges and unscalable phrases', () => {
  assert.equal(scaleQuantity('200g', 2), '400g');
  assert.equal(scaleQuantity('200g', 0.5), '100g');
  assert.equal(scaleQuantity('2 x 400g tins', 1.5), '3 x 400g tins');
  assert.equal(scaleQuantity('1 large', 2), '2 large');
  assert.equal(scaleQuantity('1/2 tsp', 2), '1 tsp');
  assert.equal(scaleQuantity('1 tsp', 0.5), '½ tsp');
  assert.equal(scaleQuantity('1-2 tbsp', 2), '2-4 tbsp');
  assert.equal(scaleQuantity('to taste', 3), 'to taste');
  assert.equal(scaleQuantity('a pinch', 0.5), 'a pinch');
  assert.equal(scaleQuantity('1kg', 1), '1kg');
  assert.equal(quantityFor('w_fish_chips', 'Plain Flour', 8), '400g');
  assert.equal(quantityFor('w_fish_chips', 'Plain Flour', 4), '200g');
  assert.equal(quantityFor('no_such_dish', 'x', 4), null);
});

test('Quantities: every bundled recipe has a quantity for every ingredient', () => {
  const table = quantityTable as Record<string, Record<string, string>>;
  const dishes = [...WORLD_RECIPES, ...INITIAL_MEALS.filter((m) => /^meal_\d+$/.test(m.id))];
  assert.ok(dishes.length >= 130);
  const gaps: string[] = [];
  for (const d of dishes) {
    for (const ing of d.ingredients) if (baseQuantity(d.id, ing) === null) gaps.push(`${d.id}: ${ing}`);
  }
  assert.deepEqual(gaps, []);
  const odd = Object.values(table)
    .flatMap((o) => Object.values(o))
    .filter((v) => !/^\d/.test(v) && !['to taste', 'a pinch', 'a handful', 'to serve', 'to fry'].includes(v));
  assert.deepEqual(odd, []);
});

// ---------------------------------------------------------------------------
// Week planner
// ---------------------------------------------------------------------------
import { nextDays, suggestWeek, tidyPlan, weekShopping, themeFits, STORES } from './planner';

test('Planner: seven distinct dishes, diets and themes respected, existing nights kept', () => {
  const pool = [...INITIAL_MEALS, ...WORLD_RECIPES.slice(0, 40)];
  const days = nextDays(new Date(2026, 10, 15), 7);
  assert.equal(days.length, 7);
  assert.equal(days[0], '2026-11-15');
  assert.equal(days[6], '2026-11-21');

  const kept = { [days[2]]: { mealId: pool[0].id, title: pool[0].title } };
  const plan = suggestWeek(pool, { days, plan: kept, themes: { [days[0]]: 'meatless' }, diets: ['vegetarian'], banned: [] });
  assert.equal(Object.keys(plan).length, 7);
  assert.equal(plan[days[2]].mealId, pool[0].id, 'a night you already chose is untouched');
  const ids = Object.values(plan).map((p) => p.mealId);
  assert.equal(new Set(ids).size, ids.length, 'no repeats in a week');
  for (const [day, v] of Object.entries(plan)) {
    if (day === days[2]) continue;
    const meal = pool.find((m) => m.id === v.mealId)!;
    assert.ok(mealFitsDiets(meal.ingredients, ['vegetarian']), `${meal.title} suits a vegetarian household`);
  }

  const fish = suggestWeek(pool, { days: [days[0]], plan: {}, themes: { [days[0]]: 'fish' }, diets: [], banned: [] });
  const fishMeal = pool.find((m) => m.id === fish[days[0]].mealId)!;
  assert.ok(themeFits('fish', fishMeal), 'a fish night gets a fish dish when one exists');

  const nothing = suggestWeek([], { days, plan: {}, themes: {}, diets: [], banned: [] });
  assert.deepEqual(nothing, {});
});

test('Planner: old days and deleted dishes are dropped; shopping is merged once', () => {
  const meals = INITIAL_MEALS.slice(0, 3);
  const old = { '2020-01-01': { mealId: meals[0].id, title: 'x' } };
  const gone = { '2999-01-01': { mealId: 'nope', title: 'y' } };
  assert.deepEqual(tidyPlan({ ...old, ...gone }, new Date(2026, 10, 15), meals), {});

  const plan = {
    '2026-11-16': { mealId: meals[0].id, title: meals[0].title },
    '2026-11-17': { mealId: meals[0].id, title: meals[0].title },
    '2026-11-18': { mealId: meals[1].id, title: meals[1].title },
  };
  const list = weekShopping(plan, meals, [], [], []);
  assert.equal(new Set(list.map((x) => x.toLowerCase())).size, list.length, 'each item once');
  const onList = weekShopping(plan, meals, [], [], [list[0]]);
  assert.ok(!onList.includes(list[0]), 'anything already on the list is skipped');
  const stocked = weekShopping(plan, meals, [], meals[0].ingredients, []);
  assert.ok(meals[0].ingredients.every((i) => !stocked.includes(i)), 'staples are never bought');
});

test('Planner: supermarket links encode the search term', () => {
  for (const s of STORES) {
    const url = s.url('chilli flakes & oil');
    assert.ok(url.startsWith('https://'));
    assert.ok(!url.includes(' ') && !url.includes('&oil'), `${s.id} escapes the term`);
  }
});

// ---------------------------------------------------------------------------
// Hosted storage: the same server behaviour on a Redis-style store, including
// two phones writing at the same moment.
// ---------------------------------------------------------------------------
import { createRedisStore, createFileStore, mutate, Store, HttpError } from '../server/store';

/** A stand-in for Upstash's REST API that understands GET, SET and the compare-and-set script. */
async function withFakeRedis(run: (url: string, data: Map<string, string>) => Promise<void>) {
  const data = new Map<string, string>();
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => (body += c));
    req.on('end', () => {
      if (req.headers.authorization !== 'Bearer tok') {
        res.statusCode = 401;
        return res.end(JSON.stringify({ error: 'unauthorized' }));
      }
      const [cmd, ...a] = JSON.parse(body) as (string | number)[];
      let result: unknown = null;
      if (cmd === 'GET') result = data.get(String(a[0])) ?? null;
      else if (cmd === 'SET') {
        data.set(String(a[1 - 1]), String(a[1]));
        result = 'OK';
      } else if (cmd === 'EVAL') {
        const key = String(a[2]);
        const expected = Number(a[3]);
        const cur = data.get(key);
        const rev = cur ? JSON.parse(cur)._rev || 0 : 0;
        if ((cur && rev !== expected) || (!cur && expected !== 0)) result = 0;
        else {
          data.set(key, String(a[4]));
          result = 1;
        }
      }
      res.setHeader('Content-Type', 'application/json');
      res.end(JSON.stringify({ result }));
    });
  });
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const { port } = server.address() as { port: number };
  try {
    await run(`http://127.0.0.1:${port}`, data);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
  }
}

test('Hosted storage: households, shopping, saved copy and live vote work on a Redis-style store', async () => {
  await withFakeRedis(async (redisUrl, data) => {
    const { useStore } = await import('../../server');
    const store = createRedisStore(redisUrl, 'tok');
    useStore(store);
    await withServer(async (baseUrl) => {
      const a = await newHousehold(baseUrl);
      const b = await newHousehold(baseUrl);
      assert.equal((await fetch(`${baseUrl}/api/households/me`, { headers: authed(a) })).status, 200);
      assert.equal(
        (await fetch(`${baseUrl}/api/households/me`, { headers: { ...authed(a), 'x-household-key': 'wrong' } })).status,
        401
      );
      assert.equal(
        (await fetch(`${baseUrl}/api/households/me`, { headers: { ...json, 'x-household-id': '__proto__', 'x-household-key': 'x' } })).status,
        401
      );

      await fetch(`${baseUrl}/api/shopping/ops`, {
        method: 'POST',
        headers: authed(a),
        body: JSON.stringify({ ops: [{ type: 'add', item: { id: 's1', name: 'Milk' } }] }),
      });
      const list = await (await fetch(`${baseUrl}/api/shopping`, { headers: authed(a) })).json();
      assert.equal(list.items.length, 1);
      assert.equal((await (await fetch(`${baseUrl}/api/shopping`, { headers: authed(b) })).json()).items.length, 0);

      const save = await fetch(`${baseUrl}/api/sync/cloud`, {
        method: 'POST',
        headers: authed(a),
        body: JSON.stringify({ data: { meals: [{ id: 'x' }] } }),
      });
      assert.equal((await save.json()).itemCount, 1);
      const got = await (await fetch(`${baseUrl}/api/sync/cloud`, { headers: authed(a) })).json();
      assert.equal(got.hasSnapshot, true);
      assert.equal((await (await fetch(`${baseUrl}/api/households/me`, { headers: authed(a) })).json()).hasSnapshot, true);
      // The big saved copy lives under its own key, so polling never drags it along.
      assert.ok(data.has(`hh:${a.householdId}:snap`));
      assert.ok(!data.get(`hh:${a.householdId}`)!.includes('"meals"'));
      assert.equal((await (await fetch(`${baseUrl}/api/sync/cloud`, { headers: authed(b) })).json()).hasSnapshot, false);

      const meal = {
        id: 'meal_1', title: 'Pasta', timeStake: '20m', effort: 'one-pot', ingredients: ['Pasta'], prepSteps: ['Boil (-10m)'],
      };
      const post = (h: any, body: object) =>
        fetch(`${baseUrl}/api/tonight`, { method: 'POST', headers: authed(h), body: JSON.stringify(body) });
      await post(a, { op: 'propose', meal, people: ['Sam', 'Jo', 'Pat'], needed: 3 });
      // Three phones vote at the same moment: nobody's vote may be lost.
      await Promise.all(['Sam', 'Jo', 'Pat'].map((voter) => post(a, { op: 'vote', voter, vote: 'yes' })));
      const t = await (await fetch(`${baseUrl}/api/tonight`, { headers: authed(a) })).json();
      assert.deepEqual(Object.keys(t.ballot).sort(), ['Jo', 'Pat', 'Sam']);
      assert.equal(t.status, 'agreed');
      assert.equal((await (await fetch(`${baseUrl}/api/tonight`, { headers: authed(b) })).json()).status, 'idle');
    });
  });
});

test('Google sign-in: one family group across phones, kept apart from others', async () => {
  const { useGoogleVerifier, useStore } = await import('../../server');
  useStore(createFileStore(null));
  const people: Record<string, { sub: string; email: string; name: string }> = {
    mum: { sub: 'g-mum', email: 'mum@example.com', name: 'Mum' },
    dad: { sub: 'g-dad', email: 'dad@example.com', name: 'Dad' },
    other: { sub: 'g-other', email: 'other@example.com', name: 'Other' },
  };
  useGoogleVerifier(async (cred) => {
    if (!people[cred]) throw new HttpError(401, { error: 'bad token' });
    return people[cred];
  });
  await withServer(async (baseUrl) => {
    const signIn = (credential: string, joinCode?: string) =>
      fetch(`${baseUrl}/api/auth/google`, { method: 'POST', headers: json, body: JSON.stringify({ credential, joinCode }) });

    // A bad token is refused.
    assert.equal((await signIn('nope')).status, 401);

    // First sign-in makes a family group.
    const first = await (await signIn('mum')).json();
    assert.equal(first.created, true);
    assert.deepEqual(first.familyNames, ['Mum']);

    // Mum's data is reachable with the key she was given.
    await fetch(`${baseUrl}/api/shopping/ops`, {
      method: 'POST',
      headers: authed(first),
      body: JSON.stringify({ ops: [{ type: 'add', item: { id: 's1', name: 'Milk', addedBy: 'Mum' } }] }),
    });

    // Signing in again, on another phone, lands in the same group with a different key.
    const second = await (await signIn('mum')).json();
    assert.equal(second.created, false);
    assert.equal(second.householdId, first.householdId);
    assert.notEqual(second.key, first.key);
    const list = await (await fetch(`${baseUrl}/api/shopping`, { headers: authed(second) })).json();
    assert.equal(list.items.length, 1);
    // The first phone still works.
    assert.equal((await fetch(`${baseUrl}/api/shopping`, { headers: authed(first) })).status, 200);

    // Dad joins Mum's group with her code; a stranger gets their own.
    const dad = await (await signIn('dad', first.code)).json();
    assert.equal(dad.householdId, first.householdId);
    assert.deepEqual(dad.familyNames.sort(), ['Dad', 'Mum']);
    const other = await (await signIn('other')).json();
    assert.notEqual(other.householdId, first.householdId);
    assert.equal((await fetch(`${baseUrl}/api/shopping`, { headers: authed(other) })).status, 200);
    assert.equal(
      (await (await fetch(`${baseUrl}/api/shopping`, { headers: authed(other) })).json()).items.length,
      0
    );

    // A wrong family code is refused and nothing is created.
    assert.equal((await signIn('other', 'h_aaaaaaaaaaaa.wrong')).status, 400);

    // Dad, signing in later with no code, returns to Mum's group.
    const dadAgain = await (await signIn('dad')).json();
    assert.equal(dadAgain.householdId, first.householdId);
  });
});

test('Hosted storage: a failing store gives a calm error, not a crash', async () => {
  const broken: Store = {
    async get() {
      throw new Error('down');
    },
    async put() {
      throw new Error('down');
    },
    async getSnapshot() {
      throw new Error('down');
    },
    async putSnapshot() {
      throw new Error('down');
    },
    async getUser() {
      throw new Error('down');
    },
    async putUser() {
      throw new Error('down');
    },
  };
  const { useStore } = await import('../../server');
  useStore(broken);
  await withServer(async (baseUrl) => {
    const r = await fetch(`${baseUrl}/api/households`, { method: 'POST' });
    assert.equal(r.status, 503);
    const me = await fetch(`${baseUrl}/api/tonight`, { headers: { 'x-household-id': 'h_aaaaaaaaaaaa', 'x-household-key': 'k' } });
    assert.equal(me.status, 503);
    assert.ok(typeof (await me.json()).error === 'string');
  });
  await assert.rejects(mutate(broken, 'h_aaaaaaaaaaaa', () => 1));
});

test('Cook from what we have: ideas come only from stock, rescue use-next items, respect bans and diets', async () => {
  const { cupboardCandidates, pickSurprise } = await import('./cupboard');
  const item = (name: string, freshness: 'green' | 'amber' | 'red' = 'green') => ({
    id: name, name, category: 'Fridge', freshness, addedDate: '2026-01-01',
  });
  const base = { meals: [], banned: [], diets: [] as any[] };

  // Default staples: pasta, tinned tomatoes, garlic, oil, rice, onions, butter.
  const ids = (c: { meal: { id: string } }[]) => c.map((x) => x.meal.id);
  const plain = cupboardCandidates({ ...base, pantry: [], staples: INITIAL_STAPLES });
  assert.ok(ids(plain).includes('idea_aglio'));
  assert.ok(ids(plain).includes('idea_tomato-pasta'));
  assert.ok(!ids(plain).includes('idea_frittata'), 'no eggs, no frittata');

  // Eggs and a wilting spinach unlock a frittata that rescues the spinach.
  const withEggs = cupboardCandidates({ ...base, pantry: [item('Eggs'), item('Spinach', 'red')], staples: INITIAL_STAPLES });
  const frittata = withEggs.find((c) => c.meal.id === 'idea_frittata');
  assert.ok(frittata);
  assert.deepEqual(frittata!.rescues, ['Spinach']);
  assert.ok(frittata!.meal.ingredients.includes('Eggs'));

  // Nothing is invented: every ingredient is something the household has.
  const have = new Set([...INITIAL_STAPLES, 'Eggs', 'Spinach']);
  for (const c of withEggs.filter((x) => x.kind === 'idea')) {
    for (const ing of c.meal.ingredients) assert.ok(have.has(ing), `${c.meal.id} invented ${ing}`);
  }

  // A banned ingredient removes dishes that need it; a vegan household gets no egg dishes.
  const noGarlic = cupboardCandidates({ ...base, banned: ['garlic'], pantry: [], staples: INITIAL_STAPLES });
  assert.ok(!ids(noGarlic).includes('idea_aglio'));
  const vegan = cupboardCandidates({ ...base, diets: ['vegan'], pantry: [item('Eggs')], staples: INITIAL_STAPLES });
  assert.ok(!vegan.some((c) => c.meal.ingredients.some((i) => /egg/i.test(i))));

  // A saved recipe only appears when everything in it is in the house.
  const recipe = { ...INITIAL_MEALS[0], ingredients: ['Basmati Rice', 'Butter'], lastCookedDate: null };
  const saved = cupboardCandidates({ ...base, meals: [recipe, { ...INITIAL_MEALS[1], ingredients: ['Unobtainium', 'Butter'], lastCookedDate: null }], pantry: [], staples: INITIAL_STAPLES });
  assert.ok(saved.some((c) => c.kind === 'saved' && c.meal.id === recipe.id));
  assert.ok(!saved.some((c) => c.meal.id === INITIAL_MEALS[1].id));

  // The surprise skips recent picks when it can, and handles an empty cupboard.
  assert.equal(pickSurprise([]), null);
  const first = pickSurprise(plain, [], () => 0)!;
  const second = pickSurprise(plain, [first.meal.id], () => 0)!;
  assert.notEqual(second.meal.id, first.meal.id);
});

test('Cook from what we have: peppercorns are not a vegetable', async () => {
  const { cupboardCandidates } = await import('./cupboard');
  const c = cupboardCandidates({ meals: [], pantry: [], staples: INITIAL_STAPLES, banned: [], diets: [] });
  assert.ok(!c.some((x) => x.meal.ingredients.some((i) => /peppercorn/i.test(i))), 'spices are never the vegetable');
  assert.ok(!c.some((x) => x.meal.id === 'idea_rice-bowl'), 'stock cubes are not leftover chicken');
});

test('Taste engine: dislikes shelve and replace dishes, likes bring in more, and it is reversible', async () => {
  const { adaptRecipes, mealContains } = await import('./taste');
  const { WORLD_RECIPES } = await import('../data/worldRecipes');
  const { STARTER_MEALS } = await import('../data/initialData');
  const base = { meals: STARTER_MEALS.slice(0, 6), shelved: [] as any[], rejectedIds: [] as string[], loved: [] as string[], diets: [] as any[], library: WORLD_RECIPES };

  // Pick an ingredient that really is in some of the starter dishes.
  const term = base.meals[0].ingredients[0].split(' ').pop()!.toLowerCase();
  const hit = base.meals.filter((m) => mealContains(m, [term]));
  assert.ok(hit.length >= 1);

  const r1 = adaptRecipes({ ...base, banned: [term] });
  assert.equal(r1.removed.length, hit.length);
  assert.ok(r1.meals.every((m) => !mealContains(m, [term])), 'nothing left in the rotation contains the refused ingredient');
  assert.ok(r1.added.length > 0 && r1.added.length <= hit.length, 'replaced, never more than were removed');
  assert.equal(r1.meals.length, base.meals.length - r1.removed.length + r1.added.length);
  assert.deepEqual(r1.shelved.map((m) => m.id).sort(), hit.map((m) => m.id).sort());

  // Taking it off the list brings the shelved dishes back.
  const r2 = adaptRecipes({ ...base, meals: r1.meals, shelved: r1.shelved, banned: [] });
  assert.deepEqual(r2.restored.map((m) => m.id).sort(), hit.map((m) => m.id).sort());
  assert.equal(r2.shelved.length, 0);

  // Loving something brings in dishes that contain it, none that are refused, hidden, or already there.
  const loved = adaptRecipes({ ...base, banned: ['mushroom'], loved: ['chilli'], extraSlots: 3, mustContain: 'chilli' });
  assert.ok(loved.added.length > 0 && loved.added.length <= 3);
  assert.ok(loved.added.every((m) => mealContains(m, ['chilli']) && !mealContains(m, ['mushroom'])));
  const ids = loved.meals.map((m) => m.id);
  assert.equal(new Set(ids).size, ids.length, 'no duplicates');
  const hidden = adaptRecipes({ ...base, banned: [], loved: ['chilli'], extraSlots: 50, mustContain: 'chilli', rejectedIds: loved.added.map((m) => m.id) });
  assert.ok(!hidden.added.some((m) => loved.added.some((l) => l.id === m.id)), 'hidden dishes stay hidden');

  // Diets are respected for the new dishes.
  const vegan = adaptRecipes({ ...base, banned: [term], diets: ['vegan'] });
  assert.ok(vegan.added.every((m) => !m.ingredients.some((i) => /chicken|beef|pork|cheese|egg|milk|butter/i.test(i))));
});
