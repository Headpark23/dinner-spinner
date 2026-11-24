import { useCallback, useEffect, useRef, useState } from 'react';
import { SHARED, SHARED_NAMES, SharedName, SharedOp, SharedPollEntry, SharedState, applySharedOp, diffShared } from '../utils/sharedSync';
import { newOpId, withOpIds } from '../utils/opIds';

export type SharedBinding<T extends any[] = any[]> = {
  value: T;
  setValue: (next: T) => void;
  joinOps?: (server: T, local: T) => SharedOp[];
};

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

/**
 * Keeps all shared household lists (recipes, shelved, hidden, cupboard, liked, avoid, staples)
 * in step across phones through ONE calm batched loop instead of 7 parallel pollers.
 *
 * Local edits queue immediately in localStorage and flush together in a single `/api/shared/batch`
 * request; background polling runs once every 15s (and on tab focus) with version tags so unchanged
 * lists cost zero payload and zero extra Redis reads.
 */
export function useSharedListsSync(opts: {
  storageKey: string;
  household: unknown;
  authHeaders: () => Record<string, string>;
  lists: Record<SharedName, SharedBinding<any[]>>;
  pollMs?: number;
}): { online: boolean | null } {
  const { storageKey, household, authHeaders, lists, pollMs = 15_000 } = opts;

  const queueKey = (name: SharedName) => `${storageKey}_sync_${name}_queue`;
  const joinedKey = (name: SharedName, hid: string) => `${storageKey}_sync_${name}_joined_${hid}`;

  const [online, setOnline] = useState<boolean | null>(null);

  const baselines = useRef<Record<SharedName, any[]>>({} as Record<SharedName, any[]>);
  const valueRefs = useRef<Record<SharedName, any[]>>({} as Record<SharedName, any[]>);
  const queues = useRef<Record<SharedName, SharedOp[]>>({} as Record<SharedName, SharedOp[]>);
  const versions = useRef<Partial<Record<SharedName, number>>>({});

  for (const name of SHARED_NAMES) {
    if (!(name in baselines.current)) baselines.current[name] = lists[name].value;
    valueRefs.current[name] = lists[name].value;
    if (!(name in queues.current)) queues.current[name] = read<SharedOp[]>(queueKey(name), []);
  }

  const busy = useRef(false);
  const dirty = useRef(false);
  const flushTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const ctx = useRef({ household, authHeaders, lists });
  ctx.current = { household, authHeaders, lists };

  const hasQueued = () => SHARED_NAMES.some((n) => queues.current[n].length > 0);

  const sync = useCallback(async (): Promise<void> => {
    const hh = ctx.current.household as { id?: string } | null;
    if (!hh) return;
    if (busy.current) {
      dirty.current = true;
      return;
    }
    busy.current = true;
    const hid = String(hh.id || '');
    try {
      do {
        dirty.current = false;
        let replyLists: Record<SharedName, SharedPollEntry>;

        if (hasQueued()) {
          const sentCounts = {} as Record<SharedName, number>;
          const opsByList: Partial<Record<SharedName, SharedOp[]>> = {};
          for (const name of SHARED_NAMES) {
            const q = queues.current[name];
            if (q.length) {
              opsByList[name] = q;
              sentCounts[name] = q.length;
            }
          }
          const res = await fetch('/api/shared/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...ctx.current.authHeaders() },
            body: JSON.stringify({ opsByList, versions: versions.current }),
          });
          if (!res.ok) throw new Error('shared batch sync failed');
          const json = await res.json();
          replyLists = json.lists;
          for (const name of SHARED_NAMES) {
            if (sentCounts[name]) {
              queues.current[name] = queues.current[name].slice(sentCounts[name]);
              write(queueKey(name), queues.current[name]);
            }
          }
        } else {
          const vQuery = SHARED_NAMES.filter((n) => versions.current[n] !== undefined)
            .map((n) => `${n}:${versions.current[n]}`)
            .join(',');
          const res = await fetch(`/api/shared${vQuery ? `?v=${encodeURIComponent(vQuery)}` : ''}`, {
            headers: ctx.current.authHeaders(),
          });
          if (!res.ok) throw new Error('shared poll failed');
          const json = await res.json();
          replyLists = json.lists;
        }

        // First-time seed or join merge across all lists in a single follow-up batch.
        const initOps: Partial<Record<SharedName, SharedOp[]>> = {};
        const markJoined: SharedName[] = [];
        for (const name of SHARED_NAMES) {
          const entry = replyLists?.[name];
          if (!entry || 'unchanged' in entry) continue;
          if (!entry.seeded) {
            initOps[name] = [{ type: 'seed', data: valueRefs.current[name], opId: newOpId() }];
            markJoined.push(name);
          } else if (hid && !read(joinedKey(name, hid), false)) {
            const extra = withOpIds(ctx.current.lists[name].joinOps?.(entry.data, valueRefs.current[name]) || []);
            if (extra.length) initOps[name] = extra;
            markJoined.push(name);
          }
        }

        if (Object.keys(initOps).length > 0) {
          const res = await fetch('/api/shared/batch', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...ctx.current.authHeaders() },
            body: JSON.stringify({ opsByList: initOps, versions: versions.current }),
          });
          if (!res.ok) throw new Error('shared seed/join failed');
          const json = await res.json();
          replyLists = json.lists;
        }
        for (const name of markJoined) {
          if (hid) write(joinedKey(name, hid), true);
        }

        for (const name of SHARED_NAMES) {
          const entry = replyLists?.[name];
          if (!entry) continue;
          versions.current[name] = entry.version;
          if ('unchanged' in entry) continue;
          const { kind, max } = SHARED[name];
          const merged = queues.current[name].reduce(
            (s: SharedState<any[]>, op: SharedOp) => applySharedOp(kind, max, s, op),
            entry
          ).data;
          if (JSON.stringify(merged) !== JSON.stringify(valueRefs.current[name])) {
            baselines.current[name] = merged;
            valueRefs.current[name] = merged;
            ctx.current.lists[name].setValue(merged);
          } else {
            baselines.current[name] = valueRefs.current[name];
          }
        }

        setOnline(true);
      } while (dirty.current);
    } catch {
      setOnline(false);
    } finally {
      busy.current = false;
    }
  }, [storageKey]);

  const scheduleFlush = useCallback(() => {
    if (flushTimer.current) clearTimeout(flushTimer.current);
    flushTimer.current = setTimeout(() => {
      flushTimer.current = null;
      void sync();
    }, 40);
  }, [sync]);

  // Watch all 7 lists: diff local changes into each list's persistent queue and flush once.
  useEffect(() => {
    let anyQueued = false;
    for (const name of SHARED_NAMES) {
      const cur = lists[name].value;
      if (cur === baselines.current[name]) continue;
      const { kind } = SHARED[name];
      const ops = diffShared(kind, baselines.current[name], cur);
      baselines.current[name] = cur;
      if (ctx.current.household && ops.length > 0) {
        queues.current[name] = [...queues.current[name], ...withOpIds(ops)];
        write(queueKey(name), queues.current[name]);
        anyQueued = true;
      }
    }
    if (anyQueued) scheduleFlush();
  }, [
    lists.recipes.value,
    lists.shelved.value,
    lists.hidden.value,
    lists.cupboard.value,
    lists.liked.value,
    lists.avoid.value,
    lists.staples.value,
    scheduleFlush,
  ]);

  useEffect(() => {
    if (typeof window === 'undefined' || !household) {
      setOnline(null);
      return;
    }
    versions.current = {};
    void sync();
    const timer = setInterval(() => {
      if (document.visibilityState === 'visible') void sync();
    }, pollMs);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      if (flushTimer.current) clearTimeout(flushTimer.current);
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sync, household, pollMs]);

  return { online };
}
