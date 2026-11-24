import test from 'node:test';
import assert from 'node:assert/strict';
import { stepDelays } from './stepAlerts';
import { holdScreenAwake, WakeLockDeps } from './wakeLock';

test('stepDelays: only unfinished steps still to come today are scheduled', () => {
  const now = new Date(2026, 0, 5, 17, 0, 0, 0);
  const out = stepDelays(
    [
      { id: 'a', timeString: '16:30', done: false }, // already past
      { id: 'b', timeString: '17:00', done: false }, // due exactly now: not in the future
      { id: 'c', timeString: '17:15', done: false },
      { id: 'd', timeString: '18:00', done: true }, // ticked off
      { id: 'e', timeString: '18:30', done: false },
    ],
    now
  );
  assert.deepEqual(out, [
    { id: 'c', ms: 15 * 60 * 1000 },
    { id: 'e', ms: 90 * 60 * 1000 },
  ]);
});

test('stepDelays: a malformed time is skipped rather than throwing', () => {
  const now = new Date(2026, 0, 5, 9, 0, 0, 0);
  assert.deepEqual(stepDelays([{ id: 'x', timeString: 'soon', done: false }], now), []);
});

function fakeDeps(visible = true) {
  const state = {
    visibility: visible ? 'visible' : 'hidden',
    listeners: new Set<() => void>(),
    requests: 0,
    sentinels: [] as { released: boolean; release(): Promise<void> }[],
  };
  const deps: WakeLockDeps = {
    wakeLock: {
      async request() {
        state.requests += 1;
        const s = {
          released: false,
          async release() {
            s.released = true;
          },
        };
        state.sentinels.push(s);
        return s;
      },
    },
    doc: {
      get visibilityState() {
        return state.visibility;
      },
      addEventListener: (_t, fn) => state.listeners.add(fn),
      removeEventListener: (_t, fn) => state.listeners.delete(fn),
    },
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));
  return { state, deps, tick };
}

test('wake lock: requested while visible, re-requested when the page comes back, released on stop', async () => {
  const { state, deps, tick } = fakeDeps(true);
  const hold = holdScreenAwake(deps);
  assert.equal(hold.supported, true);
  await tick();
  assert.equal(state.requests, 1);

  // Browser drops the lock when the page is hidden; coming back must ask again.
  state.sentinels[0].released = true;
  state.visibility = 'hidden';
  state.listeners.forEach((fn) => fn());
  await tick();
  assert.equal(state.requests, 1, 'does not ask while hidden');
  state.visibility = 'visible';
  state.listeners.forEach((fn) => fn());
  await tick();
  assert.equal(state.requests, 2);

  hold.stop();
  await tick();
  assert.equal(state.sentinels[1].released, true);
  assert.equal(state.listeners.size, 0);
});

test('wake lock: does nothing where the browser has no support, and survives a refusal', async () => {
  const none = holdScreenAwake({ doc: fakeDeps().deps.doc });
  assert.equal(none.supported, false);
  none.stop();

  const refusing: WakeLockDeps = {
    wakeLock: {
      async request() {
        throw new Error('NotAllowedError');
      },
    },
    doc: fakeDeps().deps.doc,
  };
  const hold = holdScreenAwake(refusing);
  await new Promise((r) => setTimeout(r, 0));
  hold.stop();
});
