import test from 'node:test';
import assert from 'node:assert/strict';
import { freezerCandidates, pickSurprise, cupboardCandidates } from './cupboard';
import { createFreezerItem } from './freezer';
import { INITIAL_MEALS, INITIAL_PANTRY, INITIAL_STAPLES } from '../data/initialData';

const NOW = new Date(2026, 5, 1);
const batch = (name: string, daysAgo: number, portions = 3, mealId?: string) => {
  const item = createFreezerItem({ name, portions, mealId }, NOW)!;
  return { ...item, frozenDate: new Date(NOW.getTime() - daysAgo * 86_400_000).toISOString() };
};

test('freezer batches become dinners that need nothing from the shop, oldest first', () => {
  const c = freezerCandidates([batch('Chilli', 10), batch('Lasagne', 120), batch('Soup', 40)], INITIAL_MEALS, [], [], NOW);
  assert.deepEqual(c.map((x) => x.meal.title), ['Lasagne', 'Soup', 'Chilli']);
  assert.ok(c.every((x) => x.kind === 'freezer'));
  assert.equal(c[0].eatSoon, true);
  assert.equal(c[2].eatSoon, false);
  assert.equal(c[0].portionsLeft, 3);
});

test('a batch from one of our recipes uses that recipe', () => {
  const recipe = INITIAL_MEALS[0];
  const [c] = freezerCandidates([batch(recipe.title, 5, 2, recipe.id)], INITIAL_MEALS, [], [], NOW);
  assert.equal(c.meal.id, recipe.id);
});

test('used-up batches, diets and the avoid list are respected', () => {
  const empty = { ...batch('Old stew', 5), portions: 0, usedDate: NOW.toISOString() };
  assert.equal(freezerCandidates([empty], INITIAL_MEALS, [], [], NOW).length, 0);
  assert.equal(freezerCandidates([batch('Beef stew', 5)], INITIAL_MEALS, [], ['vegetarian'], NOW).length, 0);
  assert.equal(freezerCandidates([batch('Mushroom soup', 5)], INITIAL_MEALS, ['mushrooms'], [], NOW).length, 0);
  assert.equal(freezerCandidates([batch('Tomato soup', 5)], INITIAL_MEALS, ['mushrooms'], ['vegetarian'], NOW).length, 1);
});

test('the surprise offers the freezer first, then moves on', () => {
  const frozen = freezerCandidates([batch('Lasagne', 120), batch('Soup', 40)], INITIAL_MEALS, [], [], NOW);
  const rest = cupboardCandidates({ meals: INITIAL_MEALS, pantry: INITIAL_PANTRY, staples: INITIAL_STAPLES, banned: [], diets: [] });
  const all = [...frozen, ...rest];
  const first = pickSurprise(all, [], () => 0.99);
  assert.equal(first?.meal.title, 'Lasagne');
  const second = pickSurprise(all, [first!.meal.id], () => 0.99);
  assert.equal(second?.meal.title, 'Soup');
  const third = pickSurprise(all, [first!.meal.id, second!.meal.id], () => 0.5);
  assert.notEqual(third?.kind, 'freezer');
});
