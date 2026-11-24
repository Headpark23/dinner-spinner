/**
 * Keeps the phone's screen on while someone is cooking, so the timeline (and its alerts) keep running
 * and the next step is visible with floury hands. Browsers drop the lock whenever the page is hidden,
 * so it is asked for again when the page comes back.
 */
interface Sentinel {
  released: boolean;
  release(): Promise<void>;
}

export interface WakeLockDeps {
  wakeLock?: { request(type: 'screen'): Promise<Sentinel> };
  doc: {
    visibilityState: string;
    addEventListener(type: 'visibilitychange', fn: () => void): void;
    removeEventListener(type: 'visibilitychange', fn: () => void): void;
  };
}

export const wakeLockSupported = (): boolean =>
  typeof navigator !== 'undefined' && 'wakeLock' in navigator && typeof document !== 'undefined';

const browserDeps = (): WakeLockDeps => ({
  wakeLock: (navigator as unknown as { wakeLock?: WakeLockDeps['wakeLock'] }).wakeLock,
  doc: document,
});

/** Holds the screen awake until `stop()` is called. Does nothing where the browser cannot. */
export function holdScreenAwake(deps: WakeLockDeps = browserDeps()): { supported: boolean; stop: () => void } {
  const wl = deps.wakeLock;
  if (!wl) return { supported: false, stop() {} };

  let sentinel: Sentinel | null = null;
  let stopped = false;
  let asking = false;

  const acquire = async () => {
    if (stopped || asking || deps.doc.visibilityState !== 'visible') return;
    if (sentinel && !sentinel.released) return;
    asking = true;
    try {
      const s = await wl.request('screen');
      if (stopped) s.release().catch(() => {});
      else sentinel = s;
    } catch {
      // Refused (battery saver, for example). The timeline still works; the screen may just dim.
    } finally {
      asking = false;
    }
  };

  const onVisible = () => {
    if (deps.doc.visibilityState === 'visible') void acquire();
  };
  deps.doc.addEventListener('visibilitychange', onVisible);
  void acquire();

  return {
    supported: true,
    stop() {
      stopped = true;
      deps.doc.removeEventListener('visibilitychange', onVisible);
      sentinel?.release().catch(() => {});
      sentinel = null;
    },
  };
}
