import { useCallback, useEffect, useRef, useState } from 'react';
import { SHARED, SharedName, SharedOp, SharedState, applySharedOp, diffShared } from '../utils/sharedSync';
import { newOpId, withOpIds } from '../utils/opIds';

/**
 * Keeps one of this phone's lists (recipes, cupboard, likes...) in step with the family group.
 *
 * The list stays ordinary React state, so nothing else in the app changes. This hook watches it:
 * when it changes here, the difference goes to the server as small operations (queued, so offline
 * edits are sent later); when another phone changes it, the server copy is written back into the
 * state. Without a family group it does nothing and the list stays on this phone.
 */
export function useMirrorSync<T extends any[]>(opts: {
  name: SharedName;
  storageKey: string;
  value: T;
  setValue: (next: T) => void;
  household: unknown;
  authHeaders: () => Record<string, string>;
  /** When this phone joins a group that already has the list: extra operations to add what only this phone had. */
  joinOps?: (server: T, local: T) => SharedOp[];
  pollMs?: number;
}) {
  const { name, storageKey, value, setValue, household, authHeaders, joinOps, pollMs = 5000 } = opts;
  const { kind, max } = SHARED[name];
  const queueKey = `${storageKey}_sync_${name}_queue`;
  // Per family group, so moving to another group runs the join step again.
  const joinedKeyFor = () => `${storageKey}_sync_${name}_joined_${String((ctx.current.household as any)?.id || '')}`;

  const read = <V,>(key: string, fallback: V): V => {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  };
  const write = (key: string, v: unknown) => {
    try {
      localStorage.setItem(key, JSON.stringify(v));
    } catch {
      // storage full or blocked
    }
  };

  const [online, setOnline] = useState<boolean | null>(null);
  const baseline = useRef<T>(value); // what the server plus our queue already holds
  const valueRef = useRef(value);
  valueRef.current = value;
  const queue = useRef<SharedOp[]>(read(queueKey, []));
  const lastVersion = useRef<number | null>(null);
  const busy = useRef(false);
  const dirty = useRef(false);
  const ctx = useRef({ household, authHeaders, setValue, joinOps });
  ctx.current = { household, authHeaders, setValue, joinOps };

  const apply = (s: SharedState<T>, op: SharedOp) => applySharedOp<T>(kind, max, s, op);

  const post = (ops: SharedOp[]) =>
    fetch(`/api/shared/${name}/ops`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...ctx.current.authHeaders() },
      body: JSON.stringify({ ops }),
    });

  const sync = useCallback(async (): Promise<void> => {
    if (!ctx.current.household) return;
    if (busy.current) {
      dirty.current = true;
      return;
    }
    busy.current = true;
    try {
      do {
        dirty.current = false;
        const queued = queue.current;
        let res = queued.length
          ? await post(queued)
          : await fetch(`/api/shared/${name}${lastVersion.current !== null ? `?v=${lastVersion.current}` : ''}`, {
              headers: ctx.current.authHeaders(),
            });
        if (!res.ok) throw new Error(`${name} sync failed`);
        let json = await res.json();
        if (queued.length) {
          queue.current = queue.current.slice(queued.length);
          write(queueKey, queue.current);
        }
        if (json.unchanged) {
          setOnline(true);
          continue;
        }
        if (!json.seeded) {
          // First phone in the group: share what this phone has. Ignored if another phone beat us to it.
          res = await post([{ type: 'seed', data: valueRef.current, opId: newOpId() }]);
          if (!res.ok) throw new Error(`${name} seed failed`);
          json = await res.json();
          write(joinedKeyFor(), true);
        } else if (!read(joinedKeyFor(), false)) {
          // Joining a group that already has this list: keep theirs, add what only this phone had.
          const extra = withOpIds(ctx.current.joinOps?.(json.data as T, valueRef.current) || []);
          if (extra.length) {
            res = await post(extra);
            if (!res.ok) throw new Error(`${name} join failed`);
            json = await res.json();
          }
          write(joinedKeyFor(), true);
        }
        lastVersion.current = json.version;
        const merged = queue.current.reduce(apply, json as SharedState<T>).data;
        if (JSON.stringify(merged) !== JSON.stringify(valueRef.current)) {
          baseline.current = merged;
          valueRef.current = merged;
          ctx.current.setValue(merged);
        } else {
          baseline.current = valueRef.current;
        }
        setOnline(true);
      } while (dirty.current);
    } catch {
      setOnline(false); // offline: changes stay queued and go out next time
    } finally {
      busy.current = false;
    }
  }, [name]);

  // Edits made on this phone become operations.
  useEffect(() => {
    if (value === baseline.current) return;
    const ops = diffShared(kind, baseline.current, value);
    baseline.current = value;
    if (!ctx.current.household || ops.length === 0) return;
    queue.current = [...queue.current, ...withOpIds(ops)];
    write(queueKey, queue.current);
    sync();
  }, [value]);

  useEffect(() => {
    if (typeof window === 'undefined' || !household) return;
    lastVersion.current = null;
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
  }, [sync, household, pollMs]);

  return { online };
}
