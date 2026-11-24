import test from 'node:test';
import assert from 'node:assert/strict';
import { cookingStreak, homeCookedThisWeek, takeawayFreeDays, freezerPortionsEaten, statsFrom, milestones } from './milestones';

const NOW = new Date(2026, 2, 10, 19, 0); // 10 March 2026, evening
const daysAgo = (n: number, hour = 18) => new Date(2026, 2, 10 - n, hour).toISOString();
const cooks = (...ns: number[]) => ns.map((n) => ({ date: daysAgo(n) }));

test('cookingStreak counts nights in a row, and today not cooked yet does not break it', () => {
  assert.equal(cookingStreak(cooks(0, 1, 2), NOW), 3);
  assert.equal(cookingStreak(cooks(1, 2, 3), NOW), 3, 'today still to come');
  assert.equal(cookingStreak(cooks(0, 2, 3), NOW), 1, 'a gap ends the run');
  assert.equal(cookingStreak([], NOW), 0);
  assert.equal(cookingStreak(cooks(2, 3), NOW), 0, 'a missed night before today ends it');
});

test('cookingStreak counts two dinners in one day once, and ignores bad dates', () => {
  assert.equal(cookingStreak([...cooks(0, 0), { date: 'nonsense' }], NOW), 1);
});

test('homeCookedThisWeek counts distinct days in the last seven', () => {
  assert.equal(homeCookedThisWeek(cooks(0, 1, 3, 6, 7, 9), NOW), 4);
});

test('takeawayFreeDays counts from the last takeaway, or from the first home dinner', () => {
  assert.equal(takeawayFreeDays([], [{ date: daysAgo(5) }, { date: daysAgo(12) }], NOW), 5);
  assert.equal(takeawayFreeDays(cooks(0, 4, 9), [], NOW), 9);
  assert.equal(takeawayFreeDays([], [], NOW), 0);
  assert.equal(takeawayFreeDays(cooks(0), [{ date: daysAgo(0) }], NOW), 0, 'a takeaway tonight starts again from zero');
});

test('freezerPortionsEaten adds up what has come out of every batch', () => {
  assert.equal(freezerPortionsEaten([{ portions: 1, totalPortions: 4 }, { portions: 0, totalPortions: 2 }, { portions: 3, totalPortions: 3 }]), 5);
  assert.equal(freezerPortionsEaten([]), 0);
});

test('milestones: reports the highest step reached in each ladder', () => {
  const stats = statsFrom({ cookLog: cooks(0, 1, 2, 3, 4, 5, 6, 7), takeawayLog: [], freezer: [{ portions: 0, totalPortions: 4 }], rescued: 12, now: NOW });
  const { earned } = milestones(stats);
  const byKey = Object.fromEntries(earned.map((e) => [e.key, e.step]));
  assert.equal(byKey.streak, 7);
  assert.equal(byKey.rescued, 10);
  assert.equal(byKey.freezerEaten, 3);
  assert.equal(byKey.takeawayFree, 7);
  assert.equal(byKey.homeDinners, undefined, '8 dinners is short of the first step');
});

test('milestones: the next one is the closest by share, said kindly, and unstarted things are not nudged', () => {
  const stats = statsFrom({ cookLog: cooks(0, 1), takeawayLog: [], freezer: [], rescued: 9, now: NOW });
  const { next } = milestones(stats);
  assert.equal(next?.key, 'rescued');
  assert.equal(next?.left, 1);
  assert.equal(next?.label, '1 more item used up to reach 10 rescued');
  const none = milestones(statsFrom({ cookLog: [], takeawayLog: [], freezer: [], rescued: 0, now: NOW }));
  assert.equal(none.next, null);
  assert.deepEqual(none.earned, []);
});

test('milestones never use words that scold', () => {
  const stats = statsFrom({ cookLog: cooks(1, 2, 3, 4, 5, 6, 7, 8, 9, 10), takeawayLog: [{ date: daysAgo(0) }], freezer: [{ portions: 1, totalPortions: 5 }], rescued: 3, now: NOW });
  const { earned, next } = milestones(stats);
  const text = [...earned.map((e) => e.label), next?.label ?? ''].join(' ').toLowerCase();
  assert.ok(!/lost|broke|failed|only|missed|shame|bad/.test(text), text);
});
