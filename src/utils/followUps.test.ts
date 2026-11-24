import test from 'node:test';
import assert from 'node:assert/strict';
import { withDueFreshness, toDateOnly, addDays } from './leftovers';
import { overCostLimit } from './cost';
import { seasonForMonth, seasonWeight, IN_SEASON_WEIGHT, OUT_OF_SEASON_WEIGHT } from './seasons';
import { unseenMilestones, milestoneId } from './milestones';
import { cleanPersonPrefs } from './memberDiets';
import type { Meal } from '../types';

const NOW = new Date(2026, 5, 10, 12);

test('an item due within two days reads as use next, and the stored value is untouched', () => {
  const stored = [
    { name: 'Milk', freshness: 'green', useBy: toDateOnly(addDays(NOW, 2)) },
    { name: 'Yoghurt', freshness: 'amber', useBy: toDateOnly(addDays(NOW, -1)) },
    { name: 'Cheese', freshness: 'green', useBy: toDateOnly(addDays(NOW, 3)) },
    { name: 'Rice', freshness: 'green' },
  ];
  const read = withDueFreshness(stored, NOW);
  assert.deepEqual(read.map((i) => i.freshness), ['red', 'red', 'green', 'green']);
  assert.equal(stored[0].freshness, 'green', 'not mutated');
  assert.equal(read[2], stored[2], 'items that need no change are the same object');
});

test('overCostLimit reports the cost only when it is above the limit', () => {
  const meal = { title: 'x' } as Meal;
  const rule = (limit: number, cost: number) => ({ limit, of: () => cost });
  assert.equal(overCostLimit(meal, rule(5, 7.5)), 7.5);
  assert.equal(overCostLimit(meal, rule(5, 5)), null);
  assert.equal(overCostLimit(meal, rule(Infinity, 99)), null, 'no limit means never over');
});

test('the southern hemisphere has its seasons six months out', () => {
  assert.equal(seasonForMonth(0), 'winter');
  assert.equal(seasonForMonth(0, 'south'), 'summer');
  assert.equal(seasonForMonth(6, 'south'), 'winter');
  assert.equal(seasonForMonth(3, 'south'), null);
  const stew = { title: 'Beef stew', tags: [] as string[] };
  assert.equal(seasonWeight(stew, new Date(2026, 0, 15)), IN_SEASON_WEIGHT);
  assert.equal(seasonWeight(stew, new Date(2026, 0, 15), 'south'), OUT_OF_SEASON_WEIGHT);
});

test('a milestone is celebrated once, and a first run celebrates nothing already earned', () => {
  const earned = [
    { key: 'streak', step: 7 },
    { key: 'homeDinners', step: 10 },
  ];
  const first = unseenMilestones(earned, null);
  assert.deepEqual(first.fresh, []);
  assert.deepEqual(first.seenNow.sort(), ['homeDinners:10', 'streak:7']);

  const later = unseenMilestones([...earned, { key: 'streak', step: 14 }], first.seenNow);
  assert.deepEqual(later.fresh.map(milestoneId), ['streak:14']);
  assert.equal(unseenMilestones([...earned, { key: 'streak', step: 14 }], later.seenNow).fresh.length, 0);
});

test('each person keeps their own diets from onboarding, whichever blank rows are dropped', () => {
  assert.deepEqual(cleanPersonPrefs({ diets: ['vegan', 'vegan', 'nonsense' as never] }).diets, ['vegan']);
  assert.deepEqual(cleanPersonPrefs({ diets: undefined }).diets, []);
});
