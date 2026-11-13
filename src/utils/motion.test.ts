import assert from 'node:assert/strict';
import test from 'node:test';
import { getSpinMotionPlan, prefersReducedMotion } from './motion';

test('reduced-motion spin plans settle immediately without lever or reel ticks', () => {
  assert.deepEqual(getSpinMotionPlan(1250, true), {
    durationMs: 0,
    tickIntervalMs: null,
    animateLever: false,
  });

  assert.deepEqual(getSpinMotionPlan(1300, false), {
    durationMs: 1300,
    tickIntervalMs: 90,
    animateLever: true,
  });
});

test('motion preference detection is injectable and safe without a browser', () => {
  assert.equal(prefersReducedMotion(() => ({ matches: true })), true);
  assert.equal(prefersReducedMotion(() => ({ matches: false })), false);
  assert.equal(prefersReducedMotion(undefined), false);
});
