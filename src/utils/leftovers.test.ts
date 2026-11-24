import test from 'node:test';
import assert from 'node:assert/strict';
import { leftoverFridgeItem, useByLabel, useByStatus, keepDaysFor, defaultPortions, daysUntil, toDateOnly } from './leftovers';
import { cleanItem, applyFridgeOp } from './fridge';

const NOW = new Date(2026, 0, 30, 19, 0); // 30 Jan 2026, evening

test('leftoverFridgeItem: use next, with an eat-by date three days on by default', () => {
  const item = leftoverFridgeItem({ title: 'Chilli' }, 2, NOW);
  assert.equal(item.name, 'Leftover Chilli');
  assert.equal(item.freshness, 'red');
  assert.equal(item.quantity, '2 portions');
  assert.equal(item.useBy, '2026-02-02'); // crosses the month end
});

test('leftoverFridgeItem: a recipe can set its own keep days and a single portion reads naturally', () => {
  const item = leftoverFridgeItem({ title: 'Rice', makesLeftovers: { portions: 2, keepDays: 1 } }, 1, NOW);
  assert.equal(item.useBy, '2026-01-31');
  assert.equal(item.quantity, '1 portion');
});

test('keepDaysFor and defaultPortions fall back for missing or silly values', () => {
  assert.equal(keepDaysFor(undefined), 3);
  assert.equal(keepDaysFor({ makesLeftovers: { portions: 2, keepDays: 40 } }), 3);
  assert.equal(defaultPortions(undefined), 2);
  assert.equal(defaultPortions({ makesLeftovers: { portions: 99, keepDays: 2 } }), 8);
});

test('useByStatus: ok, soon, today, over', () => {
  assert.equal(useByStatus('2026-02-10', NOW), 'ok');
  assert.equal(useByStatus('2026-02-01', NOW), 'soon');
  assert.equal(useByStatus('2026-01-30', NOW), 'today');
  assert.equal(useByStatus('2026-01-29', NOW), 'over');
  assert.equal(useByStatus(undefined, NOW), null);
  assert.equal(useByStatus('soon', NOW), null);
});

test('useByLabel reads in plain words', () => {
  assert.equal(useByLabel('2026-01-30', NOW), 'Eat today');
  assert.equal(useByLabel('2026-01-31', NOW), 'Eat by tomorrow');
  assert.equal(useByLabel('2026-02-02', NOW), 'Eat within 3 days');
  assert.equal(useByLabel('2026-01-29', NOW), 'Past its date yesterday');
  assert.equal(useByLabel('2026-01-27', NOW), 'Past its date by 3 days');
});

test('daysUntil ignores the time of day', () => {
  assert.equal(daysUntil('2026-01-31', new Date(2026, 0, 30, 23, 59)), 1);
  assert.equal(toDateOnly(new Date(2026, 4, 3)), '2026-05-03');
});

test('the fridge keeps a valid useBy and drops a bad one, through the shared server logic', () => {
  const ok = cleanItem({ name: 'Leftover Chilli', useBy: '2026-02-02' });
  assert.equal(ok?.useBy, '2026-02-02');
  assert.equal(cleanItem({ name: 'Milk', useBy: 'next week' })?.useBy, undefined);
  const next = applyFridgeOp({ version: 1, seeded: true, items: [] }, { type: 'add', item: { id: 'x', name: 'Leftover Chilli', freshness: 'red', useBy: '2026-02-02' } });
  assert.equal(next.items[0].useBy, '2026-02-02');
});
