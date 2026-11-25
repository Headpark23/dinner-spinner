import test from 'node:test';
import assert from 'node:assert/strict';
import { isBatchOf, kitchenRecipeMatches } from './cupboard';
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

test('freezer items count as ingredients, and a frozen batch of a dish comes first', () => {
  const freezer = [
    { id: 'f1', name: 'Frozen prawns', portions: 2, totalPortions: 2, frozenDate: new Date(NOW).toISOString() },
    { id: 'f2', name: 'Bolognese', portions: 3, totalPortions: 4, frozenDate: new Date(NOW).toISOString() },
    { id: 'f3', name: 'Peas', portions: 0, totalPortions: 2, frozenDate: new Date(NOW).toISOString(), usedDate: new Date(NOW).toISOString() },
  ];
  const meals = [
    meal('p', 'Prawn fried rice', ['Prawns', 'Rice', 'Peas', 'Soy sauce']),
    meal('b', 'Bolognese', ['Beef mince', 'Tinned tomatoes', 'Onion', 'Spaghetti']),
    meal('c', 'Cheesy rice', ['Rice', 'Cheddar']),
  ];
  const r = kitchenRecipeMatches({ meals, pantry, staples, freezer, banned: [], diets: [], nowMs: NOW });
  assert.equal(r[0].meal.title, 'Bolognese');
  assert.equal(r[0].frozenPortions, 3);
  const prawn = r.find((m) => m.meal.title === 'Prawn fried rice')!;
  assert.deepEqual(prawn.fromFreezer, ['Prawns']);
  assert.ok(prawn.missing.includes('Peas'), 'used-up freezer items do not count');
});

test('a freezer batch matches a recipe whose title contains its name', () => {
  assert.equal(isBatchOf('Chilli con carne', 'Smoky Beef Shin Chilli Con Carne'), true);
  assert.equal(isBatchOf('Shepherd’s pie', 'Traditional Shepherd’s Pie with Cheddar Crust'), true);
  assert.equal(isBatchOf('Dal', 'Dal'), true);
  assert.equal(isBatchOf('Pie', 'Fish pie'), false);
  assert.equal(isBatchOf('Bolognese', 'Spaghetti Bolognese'), true);
  assert.equal(isBatchOf('Chilli', 'Chilli con carne'), false);
  assert.equal(isBatchOf('Curry', 'Thai Green Prawn Curry'), false);
});
