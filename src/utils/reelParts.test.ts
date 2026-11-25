import test from 'node:test';
import assert from 'node:assert/strict';
import { buildReels, cleanIngredient, kindOf, reelExtras } from './reelParts';
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

test('cleans quantities and prep words off ingredients, including compound imported amounts', () => {
  assert.equal(cleanIngredient('500g chicken thighs, diced'), 'Chicken thighs');
  assert.equal(cleanIngredient('2 tbsp jerk paste'), 'Jerk paste');
  assert.equal(cleanIngredient('2 x 400g tins chopped tomatoes'), 'Chopped tomatoes');
  assert.equal(cleanIngredient('▢ 4 skinless salmon fillets'), 'Salmon fillets');
  assert.equal(cleanIngredient('a handful of fresh spinach'), 'Spinach');
});

test('sorts ingredients into base, main, sauce and veg, skipping stock', () => {
  assert.equal(kindOf('Jerk paste'), 'sauce');
  assert.equal(kindOf('Basmati rice'), 'carb');
  assert.equal(kindOf('Chicken thighs'), 'protein');
  assert.equal(kindOf('Sweetcorn'), 'veg');
  assert.equal(kindOf('Chicken stock'), null);
  assert.equal(kindOf('Salt'), null);
});

test('saved recipes contribute real ingredient parts only, never blanking reels with whole-recipe placeholders', () => {
  const ours = meal('a', 'Jerk Chicken', ['500g chicken thighs', '2 tbsp jerk paste', '300g basmati rice', 'peas', 'salt']);
  const starter = meal('b', 'Starter Dish', ['pork chops'], 'starter');
  const x = reelExtras([ours, starter]);
  assert.deepEqual(x.parts[1].map((p) => p.label), ['Chicken thighs']);
  assert.deepEqual(x.parts[2].map((p) => p.label), ['Jerk paste']);
  assert.deepEqual(x.parts[0].map((p) => p.label), ['Basmati rice']);
  assert.deepEqual(x.parts[3].map((p) => p.label), ['Peas']);
});

test('3-reel and 4-reel modes contain only genuine food parts on every reel, leaving Sunday untouched', () => {
  const x = reelExtras([meal('a', 'Jerk Chicken', ['chicken thighs', 'jerk paste', 'rice', 'broccoli'])]);
  const three = buildReels('3-reel', x);
  assert.ok(three[0].some((i) => i.label === 'Rice'));
  assert.ok(three[1].some((i) => i.label === 'Chicken thighs'));
  assert.ok(three[2].some((i) => i.label === 'Jerk paste'));
  assert.ok(three.flat().every((i) => !/part of the recipe|^★/i.test(i.label)));
  const sunday = buildReels('sunday', x);
  assert.ok(!sunday.flat().some((i) => i.category === 'Ours'));
});

test('the allowed filter drops clashing ingredients', () => {
  const x = reelExtras([meal('a', 'Beef Stew', ['beef mince', 'carrots'])], (label) => !/beef/i.test(label));
  assert.equal(x.parts[1].length, 0);
  assert.deepEqual(x.parts[3].map((p) => p.label), ['Carrots']);
});
