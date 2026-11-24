import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Household data shared between phones through the server (store cupboard,
 * likes & dislikes). Changes apply on this phone at once, are queued (and kept
 * across reloads), sent to the server, and the server copy is polled so other
 * phones' changes appear within a few seconds. Works offline: the queue is
 * flushed when the server is reachable again.
 */
export function useSharedStore<T, Op>(opts: {
  endpoint: string; // e.g. '/api/cupboard'
  storageKey: string;
  initial: T;
  apply: (state: T, op: Op) => T;
  pollMs?: number;
}) {
  const { endpoint, storageKey, initial, apply, pollMs = 5000 } = opts;
  const load = <V,>(suffix: string, fallback: V): V => {
    try {
      const raw = localStorage.getItem(`${storageKey}${suffix}`);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };

  const [state, setState] = useState<T>(() => load('', initial));
  const [online, setOnline] = useState<boolean | null>(null);
  const [version, setVersion] = useState<number | null>(null);
  const queue = useRef<Op[]>(load('_queue', [] as Op[]));
  // The newest state, including edits made earlier in the same tap (React state lags a render).
  const latest = useRef<T>(state);
  const applyRef = useRef(apply);
  applyRef.current = apply;

  const persist = (key: string, value: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage full or blocked
    }
  };

  useEffect(() => persist(storageKey, state), [state, storageKey]);

  const inFlight = useRef(false);
  const again = useRef(false);

  const sync = useCallback(async (): Promise<void> => {
    // One request at a time, so queued edits are never sent twice.
    if (inFlight.current) {
      again.current = true;
      return;
    }
    inFlight.current = true;
    try {
      const queued = queue.current;
      const res = queued.length
        ? await fetch(`${endpoint}/ops`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ ops: queued }),
          })
        : await fetch(endpoint);
      if (!res.ok) throw new Error('sync failed');
      const json = await res.json();
      if (queued.length) {
        queue.current = queue.current.slice(queued.length);
        persist(`${storageKey}_queue`, queue.current);
      }
      // Re-apply anything queued meanwhile so local edits never flicker away.
      const next = queue.current.reduce(applyRef.current, json.data as T);
      latest.current = next;
      setState(next);
      setVersion(json.version);
      setOnline(true);
    } catch {
      setOnline(false);
    } finally {
      inFlight.current = false;
      if (again.current) {
        again.current = false;
        sync();
      }
    }
  }, [endpoint, storageKey]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    sync();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') sync();
    }, pollMs);
    const onVisible = () => document.visibilityState === 'visible' && sync();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sync, pollMs]);

  const send = useCallback(
    (ops: Op[]) => {
      if (ops.length === 0) return;
      const next = ops.reduce(applyRef.current, latest.current);
      latest.current = next;
      setState(next);
      queue.current = [...queue.current, ...ops];
      persist(`${storageKey}_queue`, queue.current);
      sync();
    },
    [sync, storageKey]
  );

  const getLatest = useCallback(() => latest.current, []);
  return { state, send, online, version, getLatest };
}
