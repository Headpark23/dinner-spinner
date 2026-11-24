import test from 'node:test';
import assert from 'node:assert/strict';
import { captureInstallPrompt, installMode, isDismissed, rememberDismissal, InstallEnv, INSTALL_DISMISS_DAYS } from './installPrompt';
import { watchForUpdate, WorkerLike, RegistrationLike } from './swUpdate';

const env = (over: Partial<InstallEnv> = {}): InstallEnv => ({
  userAgent: 'Mozilla/5.0 (Linux; Android 14) Chrome/120',
  platform: 'Linux armv8l',
  maxTouchPoints: 5,
  displayModeStandalone: false,
  ...over,
});
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) AppleWebKit/605 Version/17.0 Mobile/15E148 Safari/604.1';

test('installMode: Chrome with a captured event offers the install button', () => {
  assert.equal(installMode(env(), true), 'prompt');
  assert.equal(installMode(env(), false), 'none');
});

test('installMode: iPhone Safari gets the Add to Home Screen guidance', () => {
  assert.equal(installMode(env({ userAgent: IPHONE, platform: 'iPhone' }), false), 'ios');
});

test('installMode: iPadOS posing as a Mac is still recognised', () => {
  const ipad = env({ userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) Version/17 Safari/605', platform: 'MacIntel', maxTouchPoints: 5 });
  assert.equal(installMode(ipad, false), 'ios');
  assert.equal(installMode({ ...ipad, maxTouchPoints: 0 }, false), 'none'); // a real Mac
});

test('installMode: Chrome on iPhone cannot add to the home screen, so no guidance', () => {
  assert.equal(installMode(env({ userAgent: IPHONE + ' CriOS/120', platform: 'iPhone' }), false), 'none');
});

test('installMode: hidden once installed, in either standalone signal', () => {
  assert.equal(installMode(env({ displayModeStandalone: true }), true), 'none');
  assert.equal(installMode(env({ userAgent: IPHONE, platform: 'iPhone', navigatorStandalone: true }), false), 'none');
});

test('dismissal is remembered, and expires', () => {
  const data = new Map<string, string>();
  const store = { getItem: (k: string) => data.get(k) ?? null, setItem: (k: string, v: string) => void data.set(k, v) };
  const t0 = Date.UTC(2026, 0, 1);
  assert.equal(isDismissed(store, t0), false);
  rememberDismissal(store, t0);
  assert.equal(isDismissed(store, t0 + 86_400_000), true);
  assert.equal(isDismissed(store, t0 + (INSTALL_DISMISS_DAYS + 1) * 86_400_000), false);
  assert.equal(isDismissed(undefined, t0), false);
});

test('captureInstallPrompt: holds the event, prompts on request, forgets it after install', async () => {
  const handlers = new Map<string, (e: Event) => void>();
  const target = {
    addEventListener: (t: string, fn: (e: Event) => void) => void handlers.set(t, fn),
    removeEventListener: (t: string) => void handlers.delete(t),
  };
  let changes = 0;
  const ctl = captureInstallPrompt(target, () => (changes += 1));
  assert.equal(ctl.hasEvent(), false);
  assert.equal(await ctl.install(), false);

  let prevented = false;
  let prompted = false;
  handlers.get('beforeinstallprompt')!({
    preventDefault: () => (prevented = true),
    prompt: async () => void (prompted = true),
    userChoice: Promise.resolve({ outcome: 'accepted' }),
  } as unknown as Event);
  assert.ok(prevented);
  assert.equal(ctl.hasEvent(), true);
  assert.equal(await ctl.install(), true);
  assert.ok(prompted);
  assert.equal(ctl.hasEvent(), false);
  assert.ok(changes >= 2);
  ctl.stop();
  assert.equal(handlers.size, 0);
});

function fakeWorker(state = 'installed') {
  const w = {
    state,
    messages: [] as unknown[],
    fn: undefined as undefined | (() => void),
    postMessage(m: unknown) {
      w.messages.push(m);
    },
    addEventListener(_t: 'statechange', fn: () => void) {
      w.fn = fn;
    },
  };
  return w;
}
function fakeReg(waiting: WorkerLike | null = null) {
  const reg = {
    waiting,
    installing: null as WorkerLike | null,
    found: undefined as undefined | (() => void),
    addEventListener(_t: 'updatefound', fn: () => void) {
      reg.found = fn;
    },
  };
  return reg satisfies RegistrationLike & Record<string, unknown>;
}
function fakeContainer(controller: unknown) {
  const c = {
    controller,
    changed: undefined as undefined | (() => void),
    addEventListener(_t: 'controllerchange', fn: () => void) {
      c.changed = fn;
    },
  };
  return c;
}

test('watchForUpdate: an already waiting worker is announced; applying messages it, then reloads', () => {
  const worker = fakeWorker();
  const container = fakeContainer({});
  let reloads = 0;
  let apply: (() => void) | undefined;
  watchForUpdate(fakeReg(worker), container, () => (reloads += 1), (a) => (apply = a));
  assert.ok(apply);
  container.changed!(); // not asked yet: no reload
  assert.equal(reloads, 0);
  apply!();
  assert.deepEqual(worker.messages, [{ type: 'SKIP_WAITING' }]);
  container.changed!();
  assert.equal(reloads, 1);
});

test('watchForUpdate: a worker installed later is announced once it reaches "installed"', () => {
  const reg = fakeReg();
  const worker = fakeWorker('installing');
  let ready = 0;
  watchForUpdate(reg, fakeContainer({}), () => {}, () => (ready += 1));
  reg.installing = worker;
  reg.found!();
  assert.equal(ready, 0);
  worker.state = 'installed';
  worker.fn!();
  assert.equal(ready, 1);
  worker.fn!(); // not announced twice
  assert.equal(ready, 1);
});

test('watchForUpdate: the first ever install is not an update', () => {
  const reg = fakeReg();
  const worker = fakeWorker('installing');
  let ready = 0;
  watchForUpdate(reg, fakeContainer(null), () => {}, () => (ready += 1));
  reg.installing = worker;
  reg.found!();
  worker.state = 'installed';
  worker.fn!();
  assert.equal(ready, 0);
});
