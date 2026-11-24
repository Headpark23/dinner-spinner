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

test('Cupboard ops: add dedupes and restocks, low flag records who, remove', async () => {
  const { applyCupboardOp, guessCupboardCategory } = await import('./household');
  let items = applyCupboardOp([], { type: 'add', item: { id: 'a', name: 'Coconut Milk', category: 'Tins & jars' } });
  items = applyCupboardOp(items, { type: 'setLow', id: 'a', low: true, by: 'Mum' });
  assert.equal(items[0].low, true);
  assert.equal(items[0].lowBy, 'Mum');
  items = applyCupboardOp(items, { type: 'add', item: { name: 'coconut milk' } });
  assert.equal(items.length, 1, 'adding an existing item restocks it rather than duplicating');
  assert.equal(items[0].low, false);
  items = applyCupboardOp(items, { type: 'remove', id: 'a' });
  assert.equal(items.length, 0);
  assert.equal(guessCupboardCategory('Chopped Tomatoes 400g tin'), 'Tins & jars');
  assert.equal(guessCupboardCategory('Soy sauce'), 'Sauces & condiments');
});

test('Tastes ops: like and avoid are exclusive, seed only fills once', async () => {
  const { applyTastesOp } = await import('./household');
  let t = applyTastesOp({ likes: [], avoid: [] }, { type: 'seed', likes: ['Garlic'], avoid: ['Olives'] });
  assert.deepEqual(t, { likes: ['Garlic'], avoid: ['Olives'], seeded: true });
  t = applyTastesOp(t, { type: 'seed', likes: [], avoid: [] });
  assert.deepEqual(t.likes, ['Garlic'], 'a second seed never wipes the household list');
  t = applyTastesOp(t, { type: 'like', name: 'olives' });
  assert.deepEqual(t.avoid, []);
  assert.ok(t.likes.includes('olives'));
  t = applyTastesOp(t, { type: 'clear', name: 'GARLIC' });
  assert.deepEqual(t.likes, ['olives']);
});

test('Spinner favours liked ingredients', () => {
  const make = (id: string, ingredients: string[]) => ({
    ...INITIAL_MEALS[0],
    id,
    ingredients,
    effort: 'standard' as const,
    isFavorite: false,
    lastCookedDate: null,
  });
  const pool = [make('a', ['Rice']), make('b', ['Halloumi', 'Peppers'])];
  // Equal weights: a draw at 45% lands on the first dish. Liking halloumi tips it to the second.
  assert.equal(selectWeightedMeal(pool, [], false, 'standard', Date.now(), () => 0.45).id, 'a');
  assert.equal(selectWeightedMeal(pool, [], false, 'standard', Date.now(), () => 0.45, ['halloumi']).id, 'b');
});

test('Shared vote: majority agrees, a veto closes it, decided votes ignore late ballots', async () => {
  const { castVote } = await import('./household');
  const base = {
    id: 'v1',
    meal: INITIAL_MEALS[0],
    proposedBy: { id: 'm1', name: 'Dad' },
    members: [
      { id: 'm1', name: 'Dad' },
      { id: 'm2', name: 'Mum' },
      { id: 'm3', name: 'Alex' },
    ],
    ballot: {},
    status: 'open' as const,
    createdAt: new Date().toISOString(),
  };
  let v = castVote(base, 'm2', 'yes');
  assert.equal(v.status, 'open');
  v = castVote(v, 'm1', 'yes');
  assert.equal(v.status, 'agreed');
  assert.equal(v.decidedBy?.name, 'Dad');
  assert.equal(castVote(v, 'm3', 'no'), v);
  const vetoed = castVote(base, 'm3', 'no');
  assert.equal(vetoed.status, 'vetoed');
  assert.equal(vetoed.decidedBy?.name, 'Alex');
});

test('Server: shared vote, cupboard, tastes, push key, and honest photo errors', async () => {
  const { app } = await import('../../server');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (url: string, body: unknown) =>
    fetch(base + url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    const proposed = await (
      await post('/api/vote/propose', {
        meal: INITIAL_MEALS[0],
        proposedBy: { id: 'm1', name: 'Dad' },
        members: [
          { id: 'm1', name: 'Dad' },
          { id: 'm2', name: 'Mum' },
        ],
      })
    ).json();
    assert.equal(proposed.vote.status, 'open');
    assert.equal(proposed.notified, 0);

    const cast = await (await post('/api/vote/cast', { voteId: proposed.vote.id, memberId: 'm2', decision: 'yes' })).json();
    assert.equal(cast.vote.status, 'agreed', 'one of two is a majority');
    const seen = await (await fetch(base + '/api/vote')).json();
    assert.equal(seen.vote.ballot.m2, 'yes');
    const late = await post('/api/vote/cast', { voteId: proposed.vote.id, memberId: 'm1', decision: 'no' });
    assert.equal(late.status, 409);

    const cupboard = await (
      await post('/api/cupboard/ops', { ops: [{ type: 'add', item: { name: 'Passata', category: 'Tins & jars' } }] })
    ).json();
    assert.equal(cupboard.data[0].name, 'Passata');
    assert.equal((await (await fetch(base + '/api/cupboard')).json()).version, cupboard.version);

    const tastes = await (await post('/api/tastes/ops', { ops: [{ type: 'avoid', name: 'Olives' }] })).json();
    assert.deepEqual(tastes.data.avoid, ['Olives']);

    const key = await (await fetch(base + '/api/push/key')).json();
    assert.ok(key.publicKey.length > 40);
    assert.equal((await post('/api/push/subscribe', { memberId: 'm1' })).status, 400);

    // A real photo with no AI key configured must fail plainly, never return sample food.
    const photo = await post('/api/pantry/analyze', { type: 'snap-fridge', imageBase64: 'data:image/jpeg;base64,AAAA' });
    assert.equal(photo.status, 503);
    assert.ok((await photo.json()).error);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});

test('Recipe ops: diff round-trips edits, hide/unhide, seed only once, big changes replace', async () => {
  const { applyRecipesOp, diffRecipes } = await import('./household');
  const start = { meals: INITIAL_MEALS.slice(0, 3), hidden: [] as string[] };
  const seeded = applyRecipesOp({ meals: [], hidden: [] }, { type: 'seed', ...start });
  assert.equal(seeded.meals.length, 3);
  assert.equal(applyRecipesOp(seeded, { type: 'seed', meals: [], hidden: [] }), seeded);

  const added = { ...INITIAL_MEALS[4], id: 'meal_new' };
  const next = [added, { ...seeded.meals[0], rating: 2 }, seeded.meals[2]];
  const ops = diffRecipes(seeded.meals, next);
  const after = ops.reduce(applyRecipesOp, seeded);
  assert.deepEqual(after.meals.map((m) => m.id), next.map((m) => m.id), 'new dish lands where it was added');
  assert.equal(after.meals[1].rating, 2);

  const hidden = applyRecipesOp(applyRecipesOp(after, { type: 'hide', id: 'x' }), { type: 'hide', id: 'x' });
  assert.deepEqual(hidden.hidden, ['x']);
  assert.deepEqual(applyRecipesOp(hidden, { type: 'unhide', id: 'x' }).hidden, []);

  const many = INITIAL_MEALS.slice(0, 12).flatMap((m) => [0, 1, 2, 3].map((i) => ({ ...m, id: `${m.id}_${i}` })));
  const bigOps = diffRecipes([], many);
  assert.equal(bigOps.length, 1);
  assert.equal(bigOps[0].type, 'replace');
});

test('Server: recipes shared between phones', async () => {
  const { app } = await import('../../server');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const post = (ops: unknown[]) =>
      fetch(base + '/api/recipes/ops', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ops }) }).then((r) => r.json());
    await post([{ type: 'seed', meals: INITIAL_MEALS.slice(0, 2), hidden: [] }]);
    await post([{ type: 'upsert', meal: { ...INITIAL_MEALS[0], rating: 1 } }, { type: 'hide', id: 'w_x' }]);
    const other = await (await fetch(base + '/api/recipes')).json();
    assert.equal(other.data.meals[0].rating, 1);
    assert.deepEqual(other.data.hidden, ['w_x']);
    assert.equal(other.data.seeded, true);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
