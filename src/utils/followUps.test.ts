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

import { suggestWeek } from './planner';
import { seasonOf } from './seasons';

const mk = (id: string, title: string): Meal => ({ id, title, ingredients: ['x'], tags: [], effort: 'any', timeStake: '30m' }) as unknown as Meal;
const POOL = [mk('a', 'Beef stew'), mk('b', 'Greek salad'), mk('c', 'Plain pasta'), { ...mk('d', 'Fish pie'), ingredients: ['cod fillet'] }];

function share(day: string, seasonal: 'north' | 'south' | false, runs = 400) {
  let seed = 7;
  const rng = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
  let winter = 0;
  for (let i = 0; i < runs; i++) {
    const plan = suggestWeek(POOL, { days: [day], plan: {}, themes: {}, diets: [], banned: [], seasonal, rng, now: 0 });
    if (seasonOf(POOL.find((m) => m.id === plan[day].mealId)!) === 'winter') winter++;
  }
  return winter / runs;
}

test('the week planner leans to the night\'s own season, and picks evenly when the setting is off', () => {
  assert.equal(seasonOf(POOL[0]), 'winter');
  const off = share('2026-01-15', false);
  const north = share('2026-01-15', 'north');
  const south = share('2026-01-15', 'south');
  assert.ok(north > off, `winter dishes likelier in a northern January (${north} vs ${off})`);
  assert.ok(south < off, `and less likely in a southern January (${south} vs ${off})`);
  const spring = share('2026-04-15', 'north');
  assert.ok(Math.abs(spring - off) < 0.08, 'in-between months change nothing');
});

test('the seasonal week still honours themes and never repeats a dish', () => {
  const days = ['2026-01-15', '2026-01-16', '2026-01-17'];
  const plan = suggestWeek(POOL, { days, plan: {}, themes: { [days[0]]: 'fish' }, diets: [], banned: [], seasonal: 'north' });
  assert.equal(plan[days[0]].mealId, 'd');
  assert.equal(new Set(Object.values(plan).map((v) => v.mealId)).size, 3);
});
