import test from 'node:test';
import assert from 'node:assert/strict';
import { seasonOf, seasonForMonth, seasonWeight, IN_SEASON_WEIGHT, OUT_OF_SEASON_WEIGHT } from './seasons';
import { selectWeightedMeal } from './dinnerEngine';
import { INITIAL_MEALS } from '../data/initialData';
import { WORLD_RECIPES } from '../data/worldRecipes';

const dish = (title: string, tags: string[] = []) => ({ title, tags });

test('seasonOf reads the season from the title or tags, and leaves most dishes alone', () => {
  assert.equal(seasonOf(dish('Beef stew with dumplings')), 'winter');
  assert.equal(seasonOf(dish('Sunday roast chicken')), 'winter');
  assert.equal(seasonOf(dish('Greek salad')), 'summer');
  assert.equal(seasonOf(dish('Quick pasta', ['BBQ night'])), 'summer');
  assert.equal(seasonOf(dish('Spaghetti carbonara')), null);
  assert.equal(seasonOf(dish('Roast vegetable salad')), null, 'a dish that reads as both is left alone');
  assert.equal(seasonOf(dish('Piedmont rice')), null, 'whole words only');
});

test('seasonForMonth: winter Nov to Mar, summer Jun to Aug, otherwise none', () => {
  assert.equal(seasonForMonth(0), 'winter');
  assert.equal(seasonForMonth(2), 'winter');
  assert.equal(seasonForMonth(3), null);
  assert.equal(seasonForMonth(4), null);
  assert.equal(seasonForMonth(5), 'summer');
  assert.equal(seasonForMonth(7), 'summer');
  assert.equal(seasonForMonth(8), null);
  assert.equal(seasonForMonth(10), 'winter');
  assert.equal(seasonForMonth(11), 'winter');
});

test('seasonWeight is mild, and neutral for unseasoned dishes and in-between months', () => {
  const jan = new Date(2026, 0, 15);
  const jul = new Date(2026, 6, 15);
  const apr = new Date(2026, 3, 15);
  assert.equal(seasonWeight(dish('Beef stew'), jan), IN_SEASON_WEIGHT);
  assert.equal(seasonWeight(dish('Beef stew'), jul), OUT_OF_SEASON_WEIGHT);
  assert.equal(seasonWeight(dish('Greek salad'), jul), IN_SEASON_WEIGHT);
  assert.equal(seasonWeight(dish('Greek salad'), jan), OUT_OF_SEASON_WEIGHT);
  assert.equal(seasonWeight(dish('Beef stew'), apr), 1);
  assert.equal(seasonWeight(dish('Carbonara'), jan), 1);
  assert.ok(IN_SEASON_WEIGHT < 4.5 && OUT_OF_SEASON_WEIGHT > 0.5, 'far below the use-next boost');
});

test('the built-in dishes include seasonal ones, so the nudge has something to act on', () => {
  const all = [...INITIAL_MEALS, ...WORLD_RECIPES];
  assert.ok(all.filter((m) => seasonOf(m) === 'winter').length >= 5);
  assert.ok(all.filter((m) => seasonOf(m) === 'summer').length >= 3);
});

test('selectWeightedMeal: in winter a winter dish is picked more often when seasonal is on, and not when off', () => {
  const base = INITIAL_MEALS[0];
  const stew = { ...base, id: 'stew', title: 'Beef stew', tags: [], isFavorite: false, lastCookedDate: null, effort: 'standard' as const };
  const salad = { ...stew, id: 'salad', title: 'Greek salad' };
  const jan = new Date(2026, 0, 15).getTime();
  const share = (seasonal: boolean) => {
    let stews = 0;
    const n = 4000;
    for (let i = 0; i < n; i++) {
      const r = (i + 0.5) / n; // an even sweep of the random range
      if (selectWeightedMeal([stew, salad], [], false, 'any', jan, () => r, seasonal).id === 'stew') stews++;
    }
    return stews / n;
  };
  assert.ok(Math.abs(share(false) - 0.5) < 0.01, 'off: an even split');
  const on = share(true);
  assert.ok(Math.abs(on - 1.25 / (1.25 + 0.85)) < 0.01, `on: winter dish favoured mildly (${on})`);
});
