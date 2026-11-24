import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ingredientCost, missingCost, costLimitValue, costText, costPerHead, costPerHeadText, FREE_TOP_UP } from './cost';
import { suggestWeek } from './planner';
import { filterEligibleMeals } from './dinnerEngine';
import { INITIAL_MEALS, INITIAL_PANTRY, INITIAL_STAPLES } from '../data/initialData';

test('ingredient prices come from the words used', () => {
  assert.ok(ingredientCost('chicken thighs') > ingredientCost('onion'));
  assert.equal(ingredientCost('mystery thing'), 1);
});

test('cost limits', () => {
  assert.equal(costLimitValue('any'), Infinity);
  assert.equal(costLimitValue('5'), 5);
  assert.equal(costLimitValue('free'), FREE_TOP_UP);
  assert.equal(costText(0), 'Nothing to buy');
  assert.equal(costText(4.4), 'about £4 to buy');
});

test('a cost limit narrows the pool, and relaxes when nothing fits', () => {
  const of = (m: (typeof INITIAL_MEALS)[number]) => missingCost(m, INITIAL_PANTRY, INITIAL_STAPLES);
  const all = filterEligibleMeals(INITIAL_MEALS, 'any' as never, 'any' as never, [], []);
  const cheap = filterEligibleMeals(INITIAL_MEALS, 'any' as never, 'any' as never, [], [], { limit: 10, of });
  assert.ok(cheap.pool.length <= all.pool.length);
  const none = filterEligibleMeals(INITIAL_MEALS, 'any' as never, 'any' as never, [], [], { limit: -1, of });
  assert.equal(none.costRelaxed, true);
  assert.equal(none.pool.length, all.pool.length);
});

test('cost per head is a quarter of the price table, ignores the fridge, and skips staples', () => {
  const meal = { ...INITIAL_MEALS[0], ingredients: ['chicken thighs', 'onion', 'salt'] };
  const withSalt = costPerHead(meal, []);
  const saltStaple = costPerHead(meal, ['Salt']);
  assert.equal(withSalt, Math.round(((ingredientCost('chicken thighs') + ingredientCost('onion') + ingredientCost('salt')) / 4) * 10) / 10);
  assert.ok(saltStaple < withSalt, 'a staple is not counted');
  assert.equal(costPerHead({ ...meal, ingredients: [] }, []), 0);
});

test('cost per head reads in pounds and pence', () => {
  assert.equal(costPerHeadText(2.4), 'about £2.40 a head');
  assert.equal(costPerHeadText(0.8), 'about 80p a head');
  assert.equal(costPerHeadText(0), 'nothing a head');
});

test('the week planner honours a cost cap, and relaxes it when nothing is cheap enough', () => {
  const of = (m: (typeof INITIAL_MEALS)[number]) => missingCost(m, INITIAL_PANTRY, INITIAL_STAPLES);
  const cheapest = [...INITIAL_MEALS].sort((a, b) => of(a) - of(b))[0];
  const limit = of(cheapest);
  const day = '2026-03-02';
  const plan = suggestWeek(INITIAL_MEALS, { days: [day], plan: {}, themes: {}, diets: [], banned: [], cost: { limit, of } });
  const picked = INITIAL_MEALS.find((m) => m.id === plan[day].mealId)!;
  assert.ok(of(picked) <= limit, 'only dishes within the cap are suggested');
  const relaxed = suggestWeek(INITIAL_MEALS, { days: [day], plan: {}, themes: {}, diets: [], banned: [], cost: { limit: -1, of } });
  assert.ok(relaxed[day], 'an impossible cap still fills the night rather than leaving it empty');
});
