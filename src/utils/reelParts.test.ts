import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReels, cleanIngredient, jackpotRecipeId, kindOf, reelExtras } from './reelParts';
import type { Meal } from '../types';

const meal = (id: string, title: string, ingredients: string[], source: Meal['source'] = 'own'): Meal => ({
  id,
  title,
  description: '',
  cuisine: 'British',
  timeStake: '30m',
  effort: 'standard',
  ingredients,
  prepSteps: [],
  rating: 0,
  isFavorite: false,
  lastCookedDate: null,
  cookCount: 0,
  tags: [],
  source,
});

test('cleans quantities and prep words off ingredients', () => {
  assert.equal(cleanIngredient('500g chicken thighs, diced'), 'Chicken thighs');
  assert.equal(cleanIngredient('2 tbsp jerk paste'), 'Jerk paste');
  assert.equal(cleanIngredient('1 tin chopped tomatoes'), 'Chopped tomatoes');
  assert.equal(cleanIngredient('a handful of fresh spinach'), 'Spinach');
});

test('sorts ingredients into base, main, sauce and veg', () => {
  assert.equal(kindOf('Jerk paste'), 'sauce');
  assert.equal(kindOf('Basmati rice'), 'carb');
  assert.equal(kindOf('Chicken thighs'), 'protein');
  assert.equal(kindOf('Sweetcorn'), 'veg');
  assert.equal(kindOf('Salt'), null);
});

test('only recipes the household saved add parts and dishes', () => {
  const ours = meal('a', 'Jerk Chicken', ['500g chicken thighs', '2 tbsp jerk paste', '300g basmati rice', 'peas', 'salt']);
  const starter = meal('b', 'Starter Dish', ['pork chops'], 'starter');
  const x = reelExtras([ours, starter]);
  assert.deepEqual(x.parts[1].map((p) => p.label), ['Chicken thighs']);
  assert.deepEqual(x.parts[2].map((p) => p.label), ['Jerk paste']);
  assert.deepEqual(x.parts[0].map((p) => p.label), ['Basmati rice']);
  assert.deepEqual(x.parts[3].map((p) => p.label), ['Peas']);
  assert.equal(x.dishes.length, 1);
  assert.equal(jackpotRecipeId(x.dishes[0].label, x), 'a');
  assert.equal(jackpotRecipeId('Free-Range Chicken', x), null);
});

test('reels get the extras: parts on their reel, whole dishes on the Main reel, Sunday untouched', () => {
  const x = reelExtras([meal('a', 'Jerk Chicken', ['chicken thighs', 'jerk paste', 'rice'])]);
  const three = buildReels('3-reel', x);
  assert.ok(three[0].some((i) => i.label === 'Rice'));
  assert.ok(three[1].some((i) => i.label === 'Chicken thighs'));
  assert.ok(three[1].some((i) => i.category === 'Our recipe'));
  assert.ok(!three[0].some((i) => i.category === 'Our recipe'));
  const sunday = buildReels('sunday', x);
  assert.ok(!sunday.flat().some((i) => i.category === 'Ours' || i.category === 'Our recipe'));
});

test('the allowed filter drops clashing recipes and ingredients', () => {
  const x = reelExtras([meal('a', 'Beef Stew', ['beef mince', 'carrots'])], (label) => !/beef/i.test(label));
  assert.equal(x.dishes.length, 0);
  assert.equal(x.parts[1].length, 0);
});
