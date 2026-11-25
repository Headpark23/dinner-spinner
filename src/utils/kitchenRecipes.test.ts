import test from 'node:test';
import assert from 'node:assert/strict';
import { kitchenRecipeMatches } from './cupboard';
import type { Meal, PantryItem } from '../types';

const NOW = new Date(2026, 10, 25).getTime();
const meal = (id: string, title: string, ingredients: string[], extra: Partial<Meal> = {}): Meal =>
  ({
    id,
    title,
    description: '',
    cuisine: 'British',
    timeStake: '30m',
    effort: 'standard',
    ingredients,
    prepSteps: [],
    rating: 3,
    cookCount: 0,
    isFavorite: false,
    ...extra,
  }) as unknown as Meal;
const fridge = (name: string, freshness: PantryItem['freshness'] = 'green'): PantryItem => ({
  id: name,
  name,
  category: 'Fridge',
  freshness,
  addedDate: new Date(NOW).toISOString(),
});

const pantry = [fridge('Chicken thighs'), fridge('Spinach', 'red'), fridge('Cheddar')];
const staples = ['Rice', 'Pasta', 'Tinned tomatoes', 'Onion'];

test('recipes using more of the kitchen rank first, and ones using nothing are left out', () => {
  const meals = [
    meal('a', 'Fish pie', ['Cod', 'Prawns', 'Potatoes']),
    meal('b', 'Chicken rice', ['Chicken thighs', 'Rice', 'Onion']),
    meal('c', 'Pasta bake', ['Pasta', 'Tinned tomatoes', 'Cheddar', 'Spinach', 'Onion']),
    meal('d', 'Chicken curry', ['Chicken thighs', 'Coconut milk', 'Curry paste', 'Rice']),
  ];
  const r = kitchenRecipeMatches({ meals, pantry, staples, banned: [], diets: [], nowMs: NOW });
  assert.deepEqual(r.map((m) => m.meal.title), ['Pasta bake', 'Chicken rice', 'Chicken curry']);
  assert.deepEqual(r[0].rescues, ['Spinach']);
  assert.deepEqual(r[2].missing, ['Coconut milk', 'Curry paste']);
  assert.deepEqual(r[2].uses, ['Chicken thighs', 'Rice']);
});

test('the avoid list is respected and dishes cooked lately drop to the end', () => {
  const meals = [
    meal('b', 'Chicken rice', ['Chicken thighs', 'Rice', 'Onion'], { lastCookedDate: new Date(NOW - 86_400_000).toISOString() }),
    meal('c', 'Cheesy rice', ['Rice', 'Cheddar']),
    meal('e', 'Spinach pasta', ['Pasta', 'Spinach', 'Mushrooms']),
  ];
  const r = kitchenRecipeMatches({ meals, pantry, staples, banned: ['mushroom'], diets: [], nowMs: NOW });
  assert.deepEqual(r.map((m) => m.meal.title), ['Cheesy rice', 'Chicken rice']);
  assert.equal(r[1].coolingOff, true);
});
