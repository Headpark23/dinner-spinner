import fs from 'fs';
import type { ShoppingItem } from '../types';
import type { TakeawayHub } from '../utils/takeaways';

export type Snapshot = { syncedAt: string; syncId: string; data: any };

export type SharedListRecord = { version: number; seeded: boolean; data: unknown[]; applied?: string[] };

/** Heavy recipe lists live under their own Redis key (`hh:${id}:meals`) so routine polls stay tiny. */
export type MealsBook = {
  _rev?: number;
  recipes?: SharedListRecord;
  shelved?: SharedListRecord;
};

/** What a household keeps on the server. The saved copy (snapshot) and recipe book are stored apart because they are large. */
export type Household = {
  keyHash: string;
  /** Extra keys, one per phone signed in with Google. Only hashes are kept. */
  keyHashes?: string[];
  /** Google accounts in this family group (display only). */
  google?: { name: string; email: string }[];
  /** Who has joined through an invite, newest last. Lets the person who invited them see it. */
  joined?: { name: string; at: string }[];
  createdAt: string;
  snapshotAt: string | null;
  shopping: { version: number; items: ShoppingItem[]; applied?: string[] };
  tonight?: unknown;
  /** The shared fridge (small operations, like the shopping list). */
  fridge?: { version: number; seeded: boolean; items: unknown[] };
  /** The shared freezer (batch-cooked meals, ticked off a portion at a time). */
  freezer?: { version: number; seeded: boolean; items: unknown[] };
  /** Dinners the household has cooked, merged from every phone. */
  cookLog?: unknown[];
  /** Local takeaways, the family's scores and notes. Merged by id from every phone. */
  takeaways?: TakeawayHub;
  /** Targeted delivery promo codes pinned by family members for tonight/today. */
  dealPins?: import('../utils/deliveryDeals').HouseholdDealPin[];
  /** Small lists kept in step across phones: hidden dishes, cupboard, likes, dislikes, staples (plus recipes on file store). */
  shared?: Record<string, SharedListRecord>;
  /** Version/seeded pointers for heavy recipe lists stored in `hh:${id}:meals` on Redis. */
  sharedMeta?: Record<string, { version: number; seeded: boolean }>;
  /** Phones that asked to be told about votes (Web Push). */
  push?: import('./push').PushSub[];
  /** Bumped on every save so two phones writing at once can't silently overwrite each other. */
  _rev?: number;
  /** Older files kept the saved copy inline. Only the file store still uses this. */
  snapshot?: Snapshot | null;
};

/** A Google account's link to the family group it belongs to. */
export type UserLink = { householdId: string; email: string; name: string };

export class HttpError extends Error {
  constructor(public status: number, public body: Record<string, unknown>) {
    super(String(body.error || status));
  }
}

export interface Store {
  get(id: string): Promise<Household | undefined>;
  /** Saves; returns false if someone else saved first (the caller re-reads and tries again). */
  put(id: string, h: Household): Promise<boolean>;
  getSnapshot(id: string): Promise<Snapshot | null>;
  putSnapshot(id: string, s: Snapshot): Promise<void>;
  /** Looks up which family group a Google account (by its hashed id) belongs to. */
  getUser(userKey: string): Promise<UserLink | undefined>;
  putUser(userKey: string, link: UserLink): Promise<void>;
  /** Optional separate storage for large shared recipe lists (`recipes`, `shelved`) on Redis. */
  getMealsBook?(id: string): Promise<MealsBook | undefined>;
  putMealsBook?(id: string, book: MealsBook): Promise<boolean>;
}

// ---------------------------------------------------------------------------
// File store: everything in memory, saved to one JSON file. Good for one machine.
// ---------------------------------------------------------------------------
export function createFileStore(filePath: string | null): Store {
  let households: Record<string, Household> = {};
  try {
    if (filePath && fs.existsSync(filePath)) households = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    households = {};
  }
  for (const h of Object.values(households)) {
    if (h.snapshot && !h.snapshotAt) h.snapshotAt = h.snapshot.syncedAt;
    if (h.snapshotAt === undefined) h.snapshotAt = null;
  }

  const usersPath = filePath ? filePath.replace(/\.json$/, '') + '.users.json' : null;
  let users: Record<string, UserLink> = {};
  try {
    if (usersPath && fs.existsSync(usersPath)) users = JSON.parse(fs.readFileSync(usersPath, 'utf-8'));
  } catch {
    users = {};
  }
  let timer: NodeJS.Timeout | null = null;
  const persist = () => {
    if (!filePath || timer) return;
    timer = setTimeout(() => {
      timer = null;
      try {
        fs.writeFileSync(filePath, JSON.stringify(households), 'utf-8');
        if (usersPath) fs.writeFileSync(usersPath, JSON.stringify(users), 'utf-8');
      } catch {
        // Read-only disk: data still lives in memory.
      }
    }, 300);
  };
  const own = (id: string) => Object.prototype.hasOwnProperty.call(households, id);

  return {
    async get(id) {
      return own(id) ? households[id] : undefined;
    },
    async put(id, h) {
      households[id] = h;
      persist();
      return true;
    },
    async getSnapshot(id) {
      return own(id) ? households[id].snapshot ?? null : null;
    },
    async putSnapshot(id, s) {
      if (!own(id)) return;
      households[id].snapshot = s;
      households[id].snapshotAt = s.syncedAt;
      persist();
    },
    async getUser(userKey) {
      return Object.prototype.hasOwnProperty.call(users, userKey) ? users[userKey] : undefined;
    },
    async putUser(userKey, link) {
      users[userKey] = link;
      persist();
    },
  };
}

// ---------------------------------------------------------------------------
// Redis store over HTTP (Upstash style REST API), for hosts with no disk such as Vercel.
// ---------------------------------------------------------------------------
const CAS = `
local cur = redis.call('GET', KEYS[1])
if cur then
  local rev = cjson.decode(cur)['_rev'] or 0
  if rev ~= tonumber(ARGV[1]) then return 0 end
elseif tonumber(ARGV[1]) ~= 0 then
  return 0
end
redis.call('SET', KEYS[1], ARGV[2])
return 1`;

export function createRedisStore(url: string, token: string, doFetch: typeof fetch = fetch): Store {
  const run = async (...args: (string | number)[]): Promise<any> => {
    const res = await doFetch(url, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
    });
    const json: any = await res.json().catch(() => ({}));
    if (!res.ok || json.error) throw new Error(`Storage error: ${json.error || res.status}`);
    return json.result;
  };
  const safeId = (id: string) => /^h_[0-9a-f]{12}$/.test(id);

  return {
    async get(id) {
      if (!safeId(id)) return undefined;
      const raw = await run('GET', `hh:${id}`);
      return raw ? (JSON.parse(raw) as Household) : undefined;
    },
    async put(id, h) {
      if (!safeId(id)) return false;
      const expected = h._rev || 0;
      const { snapshot: _inline, ...core } = h;
      const ok = await run('EVAL', CAS, 1, `hh:${id}`, expected, JSON.stringify({ ...core, _rev: expected + 1 }));
      if (Number(ok) === 1) {
        h._rev = expected + 1;
        return true;
      }
      return false;
    },
    async getSnapshot(id) {
      if (!safeId(id)) return null;
      const raw = await run('GET', `hh:${id}:snap`);
      return raw ? (JSON.parse(raw) as Snapshot) : null;
    },
    async putSnapshot(id, s) {
      if (!safeId(id)) return;
      await run('SET', `hh:${id}:snap`, JSON.stringify(s));
    },
    async getUser(userKey) {
      if (!/^[0-9a-f]{64}$/.test(userKey)) return undefined;
      const raw = await run('GET', `user:${userKey}`);
      return raw ? (JSON.parse(raw) as UserLink) : undefined;
    },
    async putUser(userKey, link) {
      if (!/^[0-9a-f]{64}$/.test(userKey)) return;
      await run('SET', `user:${userKey}`, JSON.stringify(link));
    },
    async getMealsBook(id) {
      if (!safeId(id)) return undefined;
      const raw = await run('GET', `hh:${id}:meals`);
      return raw ? (JSON.parse(raw) as MealsBook) : { _rev: 0 };
    },
    async putMealsBook(id, book) {
      if (!safeId(id)) return false;
      const expected = book._rev || 0;
      const ok = await run('EVAL', CAS, 1, `hh:${id}:meals`, expected, JSON.stringify({ ...book, _rev: expected + 1 }));
      if (Number(ok) === 1) {
        book._rev = expected + 1;
        return true;
      }
      return false;
    },
  };
}

/** Redis when the host provides it (Vercel's Upstash integration), otherwise a local file. */
export function createStoreFromEnv(filePath: string | null): Store {
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  if (url && token) return createRedisStore(url, token);
  return createFileStore(filePath);
}

const pause = (attempt: number) =>
  new Promise((r) => setTimeout(r, 15 + attempt * 20 + Math.floor(Math.random() * 25)));

/** Re-runs `fn` on a fresh copy until the save wins, with jittered backoff so simultaneous writes never 503. */
export async function mutate<T>(store: Store, id: string, fn: (h: Household) => T): Promise<T> {
  for (let attempt = 0; attempt < 10; attempt++) {
    const h = await store.get(id);
    if (!h) throw new HttpError(401, { error: 'Household code missing or wrong.' });
    const result = fn(h);
    if (await store.put(id, h)) return result;
    await pause(attempt);
  }
  throw new HttpError(503, { error: 'Busy. Try again in a moment.' });
}

export async function mutateMealsBook<T>(store: Store, id: string, fn: (book: MealsBook) => T): Promise<T> {
  if (!store.getMealsBook || !store.putMealsBook) {
    throw new Error('MealsBook storage not supported on this store');
  }
  for (let attempt = 0; attempt < 10; attempt++) {
    const book = (await store.getMealsBook(id)) || { _rev: 0 };
    const result = fn(book);
    if (await store.putMealsBook(id, book)) return result;
    await pause(attempt);
  }
  throw new HttpError(503, { error: 'Busy. Try again in a moment.' });
}
