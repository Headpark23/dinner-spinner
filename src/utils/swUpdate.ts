/**
 * Update prompt logic. The service worker no longer takes over by itself: a new version waits until the
 * person taps "Refresh", so a page is never swapped out from under someone mid-recipe. Tapping asks the
 * waiting worker to activate (`SKIP_WAITING`), and the page reloads once it has taken control.
 */
export interface WorkerLike {
  state: string;
  postMessage(message: unknown): void;
  addEventListener(type: 'statechange', fn: () => void): void;
}

export interface RegistrationLike {
  waiting: WorkerLike | null;
  installing: WorkerLike | null;
  addEventListener(type: 'updatefound', fn: () => void): void;
}

export interface ContainerLike {
  /** Null on a first visit: there is no old version to replace, so no prompt is needed. */
  controller: unknown;
  addEventListener(type: 'controllerchange', fn: () => void): void;
}

/**
 * Calls `onReady(apply)` once a new version is waiting. `apply` asks it to take over and then calls
 * `reload` when it has. Returns a function that re-checks for a new version (for when the app is reopened).
 */
export function watchForUpdate(
  reg: RegistrationLike & { update?: () => Promise<unknown> },
  container: ContainerLike,
  reload: () => void,
  onReady: (apply: () => void) => void
): () => void {
  let announced = false;
  let applying = false;

  const apply = (worker: WorkerLike) => () => {
    applying = true;
    worker.postMessage({ type: 'SKIP_WAITING' });
  };
  const announce = (worker: WorkerLike) => {
    // Without a controller this is the very first install, not an update.
    if (announced || !container.controller) return;
    announced = true;
    onReady(apply(worker));
  };

  if (reg.waiting) announce(reg.waiting);
  reg.addEventListener('updatefound', () => {
    const worker = reg.installing;
    if (!worker) return;
    worker.addEventListener('statechange', () => {
      if (worker.state === 'installed') announce(worker);
    });
  });
  // Only reload when the person asked for it, so a first-install claim never refreshes the page.
  container.addEventListener('controllerchange', () => {
    if (applying) reload();
  });

  return () => {
    reg.update?.().catch(() => {});
  };
}

/** A tiny hand-off between the registration code in main.tsx and the notice in the app. */
let pendingApply: (() => void) | null = null;
const listeners = new Set<() => void>();
export const updateSignal = {
  announce(apply: () => void) {
    pendingApply = apply;
    listeners.forEach((fn) => fn());
  },
  get: () => pendingApply,
  subscribe(fn: () => void) {
    listeners.add(fn);
    return () => void listeners.delete(fn);
  },
};
