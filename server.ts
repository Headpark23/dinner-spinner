import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { applyShoppingOpToState } from './src/utils/shopping';
import { applyFridgeOp, type FridgeState } from './src/utils/fridge';
import { applyFreezerOp, type FreezerState } from './src/utils/freezer';
import { cleanLog, unionLog } from './src/utils/history';
import { DEFAULT_RADIUS_M, MAX_RADIUS_M, chainOf, cleanHub, distanceM, emptyHub, mergeHub, placeFromHtml, sameSpot, type SharedSpot } from './src/utils/takeaways';
import { createPlaces, type Places } from './src/server/places';
import { createPhotoSearch } from './src/server/photoSearch';
import { createDealsService } from './src/server/dealsFeed';
import { cleanDealPin, pruneDealPins } from './src/utils/deliveryDeals';
import { fetchPublicPage } from './src/server/fetchPage';
import { extractRecipeFromHtml, htmlToText } from './src/utils/recipeImport';
import { Household, HttpError, MealsBook, Store, UserLink, createFileStore, createStoreFromEnv, mutate, mutateMealsBook } from './src/server/store';
import { cleanSub, notActor, pushPublicKey, sendToAll, voteMessage, type PushSub } from './src/server/push';
import { SHARED, SHARED_NAMES, applySharedOp, emptyShared, isLargeShared, isSharedName, type SharedName, type SharedPollEntry, type SharedState } from './src/utils/sharedSync';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// Behind a host's proxy (Vercel) every request would look like one visitor without this.
if (process.env.VERCEL) app.set('trust proxy', true);
const PORT = Number(process.env.PORT) || 3000;
const IS_TEST = process.env.NODE_ENV === 'test';
// Everything a household has shared lives here. Never written during tests.
const HOUSEHOLDS_PATH = IS_TEST ? null : path.resolve(__dirname, '.households.json');

app.disable('x-powered-by');
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Frame-Options', 'DENY');
  next();
});

// Small JSON bodies everywhere; only image scans may be large.
const smallJson = express.json({ limit: '1mb' });
const imageJson = express.json({ limit: '12mb' });

// Server-side Gemini client (validates that key is not the default placeholder)
const rawApiKey = process.env.GEMINI_API_KEY?.trim() || '';
const hasRealGeminiKey = Boolean(rawApiKey && rawApiKey !== 'MY_GEMINI_API_KEY');

const ai = hasRealGeminiKey
  ? new GoogleGenAI({
      apiKey: rawApiKey,
      httpOptions: {
        headers: {
          'User-Agent': 'aistudio-build',
        },
      },
    })
  : null;

// ---------------------------------------------------------------------------
// Tiny in-memory rate limiter (fixed window, per client address).
// ---------------------------------------------------------------------------
function rateLimit(name: string, max: number, windowMs: number): express.RequestHandler {
  const hits = new Map<string, { count: number; resetAt: number }>();
  return (req, res, next) => {
    if (IS_TEST && process.env.RATE_LIMIT_IN_TEST !== '1') return next();
    const now = Date.now();
    const key = req.ip || 'unknown';
    const entry = hits.get(key);
    if (!entry || entry.resetAt <= now) {
      hits.set(key, { count: 1, resetAt: now + windowMs });
      if (hits.size > 5000) for (const [k, v] of hits) if (v.resetAt <= now) hits.delete(k);
      return next();
    }
    entry.count += 1;
    if (entry.count > max) {
      res.setHeader('Retry-After', String(Math.ceil((entry.resetAt - now) / 1000)));
      return res.status(429).json({ error: `Too many ${name} requests. Please wait a moment.` });
    }
    next();
  };
}
app.use('/api', rateLimit('API', 600, 60_000));

// ---------------------------------------------------------------------------
// Households. A household is created with a random id and secret key; the two
// together form the "household code" people share to join. Only a hash of the
// key is stored. Every data route below requires it, so one household can never
// read or overwrite another's data.
// ---------------------------------------------------------------------------
// Where households live: Redis when the host provides one, otherwise a local file.
let store: Store = IS_TEST ? createFileStore(null) : createStoreFromEnv(HOUSEHOLDS_PATH);
/** Tests swap in a different store. */
export const useStore = (next: Store) => {
  store = next;
};

/** Turns a thrown HttpError into a JSON reply; anything else is a storage problem. */
const fail = (res: express.Response, err: unknown) => {
  if (err instanceof HttpError) return res.status(err.status).json(err.body);
  console.warn('Storage error:', (err as Error)?.message);
  return res.status(503).json({ error: 'Storage is unavailable just now. Try again in a moment.' });
};

const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID?.trim() || '';

export type GoogleProfile = { sub: string; email: string; name: string; picture?: string };
/** Checks a Google sign-in token with Google and returns who it belongs to. Tests replace this. */
let verifyGoogle: (credential: string) => Promise<GoogleProfile> = async (credential) => {
  if (!GOOGLE_CLIENT_ID) throw new HttpError(503, { error: 'Google sign-in is not set up on this server.' });
  const res = await fetch('https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(credential));
  if (!res.ok) throw new HttpError(401, { error: 'Google sign-in could not be verified.' });
  const t: any = await res.json();
  const issuerOk = t.iss === 'accounts.google.com' || t.iss === 'https://accounts.google.com';
  if (t.aud !== GOOGLE_CLIENT_ID || !issuerOk || !t.sub || String(t.email_verified) !== 'true') {
    throw new HttpError(401, { error: 'Google sign-in could not be verified.' });
  }
  return { sub: String(t.sub), email: String(t.email || ''), name: String(t.name || t.given_name || ''), picture: t.picture };
};
export const useGoogleVerifier = (fn: typeof verifyGoogle) => {
  verifyGoogle = fn;
};

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest();

async function authenticate(req: express.Request): Promise<{ id: string; household: Household } | null> {
  const id = String(req.header('x-household-id') || '');
  const key = String(req.header('x-household-key') || '');
  if (!id || !key) return null;
  const household = await store.get(id);
  if (!household) return null;
  const given = sha256(key);
  const matches = [household.keyHash, ...(household.keyHashes || [])].some((h) => {
    const stored = Buffer.from(h, 'hex');
    return given.length === stored.length && crypto.timingSafeEqual(given, stored);
  });
  return matches ? { id, household } : null;
}

type AuthedRequest = express.Request & { household?: Household; householdId?: string };
const requireHousehold: express.RequestHandler = async (req, res, next) => {
  try {
    const auth = await authenticate(req);
    if (!auth) return res.status(401).json({ error: 'Household code missing or wrong.' });
    (req as AuthedRequest).household = auth.household;
    (req as AuthedRequest).householdId = auth.id;
    next();
  } catch (err) {
    fail(res, err);
  }
};

// Health check (nothing sensitive)
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    appName: 'Dinner Spinner',
    aiEnabled: hasRealGeminiKey,
    // The Google client id is public by design; the page needs it to show the button.
    googleClientId: GOOGLE_CLIENT_ID || null,
    timestamp: new Date().toISOString(),
  });
});

app.post('/api/households', rateLimit('household', 10, 60 * 60_000), async (_req, res) => {
  const id = 'h_' + crypto.randomBytes(6).toString('hex');
  const key = crypto.randomBytes(16).toString('hex');
  try {
    await store.put(id, {
      keyHash: sha256(key).toString('hex'),
      createdAt: new Date().toISOString(),
      snapshotAt: null,
      shopping: { version: 0, items: [] },
    });
    res.status(201).json({ householdId: id, key, code: `${id}.${key}` });
  } catch (err) {
    fail(res, err);
  }
});

app.get('/api/households/me', requireHousehold, (req, res) => {
  const h = (req as AuthedRequest).household!;
  res.json({
    ok: true,
    hasSnapshot: Boolean(h.snapshotAt),
    createdAt: h.createdAt,
    familyNames: (h.google || []).map((g) => g.name).filter(Boolean),
    joined: h.joined || [],
  });
});

// A phone that joined with a code (no Google) says so, so whoever invited it can be told.
app.post('/api/households/joined', smallJson, requireHousehold, async (req, res) => {
  try {
    const name = String(req.body?.name || 'Someone new').trim().slice(0, 40) || 'Someone new';
    await mutate(store, (req as AuthedRequest).householdId!, (h) => {
      h.joined = [...(h.joined || []), { name, at: new Date().toISOString() }].slice(-30);
    });
    res.json({ ok: true });
  } catch (err) {
    fail(res, err);
  }
});

// Sign in with Google: the same family group on every phone, no code to copy. A phone gets its
// own key each time it signs in, so signing in elsewhere never signs anyone out.
app.post('/api/auth/google', smallJson, rateLimit('sign-in', 30, 10 * 60_000), async (req, res) => {
  try {
    const credential = String(req.body?.credential || '');
    if (!credential || credential.length > 4000) return res.status(400).json({ error: 'Missing Google sign-in.' });
    const profile = await verifyGoogle(credential);
    const userKey = sha256('google:' + profile.sub).toString('hex');
    const name = (profile.name || profile.email.split('@')[0] || 'Someone').slice(0, 40);
    const key = crypto.randomBytes(16).toString('hex');
    const keyHash = sha256(key).toString('hex');
    const me = { name, email: profile.email };

    let householdId: string | null = null;
    let created = false;
    const joinCode = String(req.body?.joinCode || '');
    if (joinCode) {
      const [jid, jkey] = joinCode.trim().split('.');
      const asReq = {
        header: (n: string) => (n === 'x-household-id' ? jid : n === 'x-household-key' ? jkey : ''),
      } as express.Request;
      const ok = jid && jkey ? await authenticate(asReq) : null;
      if (!ok) return res.status(400).json({ error: 'That family code wasn’t recognised.' });
      householdId = jid;
    } else {
      const link: UserLink | undefined = await store.getUser(userKey);
      if (link && (await store.get(link.householdId))) householdId = link.householdId;
    }

    if (householdId) {
      await mutate(store, householdId, (h) => {
        h.keyHashes = [...(h.keyHashes || []), keyHash].slice(-25);
        const alreadyIn = (h.google || []).some((g) => g.email === me.email);
        const others = (h.google || []).filter((g) => g.email !== me.email);
        h.google = [...others, me].slice(-12);
        if (joinCode && !alreadyIn) h.joined = [...(h.joined || []), { name, at: new Date().toISOString() }].slice(-30);
      });
    } else {
      householdId = 'h_' + crypto.randomBytes(6).toString('hex');
      created = true;
      await store.put(householdId, {
        keyHash,
        createdAt: new Date().toISOString(),
        snapshotAt: null,
        shopping: { version: 0, items: [] },
        google: [me],
      });
    }
    await store.putUser(userKey, { householdId, email: profile.email, name });
    const final = await store.get(householdId);
    res.json({
      householdId,
      key,
      code: householdId + '.' + key,
      created,
      profile: { name, email: profile.email, picture: profile.picture || '' },
      familyNames: (final?.google || []).map((g) => g.name).filter(Boolean),
    });
  } catch (err) {
    fail(res, err);
  }
});

app.post('/api/sync/cloud', smallJson, requireHousehold, async (req, res) => {
  const { data } = req.body || {};
  if (!data || typeof data !== 'object' || Array.isArray(data)) {
    return res.status(400).json({ error: 'Invalid sync payload' });
  }
  const id = (req as AuthedRequest).householdId!;
  const snap = { syncedAt: new Date().toISOString(), syncId: 'sync_' + Date.now(), data };
  try {
    await store.putSnapshot(id, snap);
    await mutate(store, id, (h) => {
      h.snapshotAt = snap.syncedAt;
    });
    res.json({
      success: true,
      syncedAt: snap.syncedAt,
      itemCount: Array.isArray(data?.meals) ? data.meals.length : 0,
      syncId: snap.syncId,
    });
  } catch (err) {
    fail(res, err);
  }
});

app.get('/api/sync/cloud', requireHousehold, async (req, res) => {
  try {
    const snap = await store.getSnapshot((req as AuthedRequest).householdId!);
    if (!snap) return res.json({ success: true, hasSnapshot: false, data: null });
    return res.json({ success: true, hasSnapshot: true, syncedAt: snap.syncedAt, syncId: snap.syncId, data: snap.data });
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// Shared household shopping list. Clients send small operations; the server
// applies them in order and bumps a version number that clients poll.
// ---------------------------------------------------------------------------
app.get('/api/shopping', requireHousehold, (req, res) => {
  res.json((req as AuthedRequest).household!.shopping);
});

app.post('/api/shopping/ops', smallJson, requireHousehold, async (req, res) => {
  const ops = Array.isArray(req.body?.ops) ? req.body.ops.slice(0, 200) : [];
  if (ops.length === 0) return res.status(400).json({ error: 'No operations' });
  try {
    const shopping = await mutate(store, (req as AuthedRequest).householdId!, (h) => {
      const next = ops.reduce(applyShoppingOpToState, h.shopping);
      h.shopping = { ...next, version: next.version + 1 };
      return h.shopping;
    });
    res.json(shopping);
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// Shared fridge: same idea as the shopping list. The first phone to arrive seeds it.
// ---------------------------------------------------------------------------
const fridgeOf = (h: Household): FridgeState => ((h.fridge ||= { version: 0, seeded: false, items: [] }) as FridgeState);

app.get('/api/fridge', requireHousehold, (req, res) => {
  res.json(fridgeOf((req as AuthedRequest).household!));
});

app.post('/api/fridge/ops', smallJson, requireHousehold, async (req, res) => {
  const ops = Array.isArray(req.body?.ops) ? req.body.ops.slice(0, 200) : [];
  if (ops.length === 0) return res.status(400).json({ error: 'No operations' });
  try {
    const fridge = await mutate(store, (req as AuthedRequest).householdId!, (h) => {
      const next = ops.reduce(applyFridgeOp, fridgeOf(h));
      next.version += 1;
      h.fridge = next;
      return next;
    });
    res.json(fridge);
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// Shared freezer: same operations idea as the fridge. The first phone to arrive seeds it.
// ---------------------------------------------------------------------------
const freezerOf = (h: Household): FreezerState => ((h.freezer ||= { version: 0, seeded: false, items: [] }) as FreezerState);

app.get('/api/freezer', requireHousehold, (req, res) => {
  res.json(freezerOf((req as AuthedRequest).household!));
});

app.post('/api/freezer/ops', smallJson, requireHousehold, async (req, res) => {
  const ops = Array.isArray(req.body?.ops) ? req.body.ops.slice(0, 200) : [];
  if (ops.length === 0) return res.status(400).json({ error: 'No operations' });
  try {
    const freezer = await mutate(store, (req as AuthedRequest).householdId!, (h) => {
      const next = ops.reduce(applyFreezerOp, freezerOf(h));
      next.version += 1;
      h.freezer = next;
      return next;
    });
    res.json(freezer);
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// Shared cooking history. Entries from every phone are merged, so nobody's dinners are lost.
// ---------------------------------------------------------------------------
app.get('/api/history', requireHousehold, (req, res) => {
  res.json({ entries: cleanLog((req as AuthedRequest).household!.cookLog) });
});

app.post('/api/history', smallJson, requireHousehold, async (req, res) => {
  const incoming = cleanLog(req.body?.entries);
  const replace = req.body?.replace === true; // a deliberate reset or restore
  try {
    const entries = await mutate(store, (req as AuthedRequest).householdId!, (h) => {
      const merged = replace ? incoming : unionLog(cleanLog(h.cookLog) as any, incoming);
      h.cookLog = merged;
      return merged;
    });
    res.json({ entries });
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// Local takeaways, family group only. Phones send what they have (spots, scores, notes) and get the
// merged result back. Merging is by id and newest edit wins, so two phones never lose each other's votes.
// The town is looked up with Nominatim and the shops with Overpass (OpenStreetMap, free, no key).
// ---------------------------------------------------------------------------
let places: Places = createPlaces(fetch, undefined, process.env.GOOGLE_PLACES_API_KEY || undefined);
/** Tests swap in a fake map service. */
export const usePlaces = (next: Places) => {
  places = next;
};

const hubOf = (h: Household) => cleanHub(h.takeaways);
const saveHub = (h: Household, hub: ReturnType<typeof emptyHub>) => {
  h.takeaways = { ...hub, version: (h.takeaways?.version || 0) + 1 };
  return h.takeaways;
};

app.get('/api/takeaways', requireHousehold, (req, res) => {
  res.json(hubOf((req as AuthedRequest).household!));
});

app.post('/api/takeaways', smallJson, requireHousehold, async (req, res) => {
  try {
    const hub = await mutate(store, (req as AuthedRequest).householdId!, (h) =>
      saveHub(h, mergeHub(hubOf(h), { place: req.body?.place, spots: req.body?.spots, ratings: req.body?.ratings }))
    );
    res.json(hub);
  } catch (err) {
    fail(res, err);
  }
});

app.post('/api/takeaways/place', smallJson, requireHousehold, rateLimit('place lookup', 20, 10 * 60_000), async (req, res) => {
  const query = clipText(req.body?.query, 80);
  if (query.length < 2) return res.status(400).json({ error: 'Type a town or postcode.' });
  try {
    const found = await places.geocode(query);
    const place = { ...found, updatedAt: new Date().toISOString() };
    const hub = await mutate(store, (req as AuthedRequest).householdId!, (h) => {
      // A newly chosen town always replaces the old one, even if a clock is a little off.
      const next = mergeHub(hubOf(h), {});
      next.place = place;
      return saveHub(h, next);
    });
    res.json(hub);
  } catch (err) {
    fail(res, err);
  }
});

// Add a place the map missed: paste its website and we read its name, cuisine, address and phone from the page.
// Nothing is saved here; the phone shows the details to check, then adds the place like any other.
app.post('/api/takeaways/lookup', smallJson, requireHousehold, rateLimit('place link', 20, 10 * 60_000), async (req, res) => {
  try {
    const url = typeof req.body?.url === 'string' ? req.body.url.trim().slice(0, 500) : '';
    if (!url) return res.status(400).json({ error: 'Paste the restaurant’s website.' });
    let page: Awaited<ReturnType<typeof pageFetcher>>;
    try {
      page = await pageFetcher(url);
    } catch (err) {
      // A restaurant's site that refuses an automated visit (or is down) is normal. The details can be typed in; keep the link.
      if (err instanceof HttpError && err.status === 502) {
        // The site refused us. If Google knows the place by this website, use its details instead.
        try {
          const host = new URL(/^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`).hostname;
          const near = hubOf((req as AuthedRequest).household!).place;
          const found = await places.findByWebsite?.(host, near ? { lat: near.lat, lon: near.lon } : undefined);
          if (found) return res.json({ details: found, website: /^[a-z][a-z0-9+.-]*:/i.test(url) ? url : `https://${url}`, via: 'google' });
        } catch {
          // fall back to typing it in
        }
        const upstream = typeof err.body.upstream === 'number' ? ` (${err.body.upstream})` : '';
        return res.status(502).json({
          error: `That site wouldn’t let the app read it${upstream}. Many restaurant sites block automated visits. Type the name below and we’ll keep the link.`,
          website: url,
        });
      }
      throw err;
    }
    const details = placeFromHtml(page.html);
    if (!details) {
      return res.status(422).json({ error: 'Couldn’t read a name from that page. Type the name and we’ll keep the link.', website: page.url });
    }
    res.json({ details, website: page.url });
  } catch (err) {
    fail(res, err);
  }
});

app.post('/api/takeaways/discover', smallJson, requireHousehold, rateLimit('takeaway search', 12, 10 * 60_000), async (req, res) => {
  const id = (req as AuthedRequest).householdId!;
  const place = hubOf((req as AuthedRequest).household!).place;
  if (!place) return res.status(400).json({ error: 'Choose your town first.' });
  const radius = Math.min(MAX_RADIUS_M, Math.max(500, Number(req.body?.radiusM) || DEFAULT_RADIUS_M));
  try {
    const { spots: found, complete } = await places.takeawaysNear(place.lat, place.lon, radius);
    const foundIds = new Set(found.map((f) => f.id));
    let added = 0;
    let gone = 0;
    const hub = await mutate(store, id, (h) => {
      added = 0; // the callback may run again if two phones write at once
      gone = 0;
      const current = hubOf(h);
      const now = new Date().toISOString();
      const byId = new Map(current.spots.map((s) => [s.id, s]));
      const changes: SharedSpot[] = [];
      // A chain already in the list (any branch) is not added again from another branch.
      const haveChains = new Set(current.spots.filter((s) => !s.gone).map((s) => chainOf(s.name)).filter(Boolean));
      for (const raw of found) {
        // A Google result for a shop already in the list (found earlier on the map) keeps the existing entry and its scores.
        const twin = byId.has(raw.id) ? undefined : current.spots.find((s) => !s.gone && sameSpot(s, raw));
        const f = twin ? { ...raw, id: twin.id } : raw;
        const have = byId.get(f.id);
        const chain = chainOf(f.name);
        if (!have && chain && haveChains.has(chain)) continue;
        if (!have) {
          if (chain) haveChains.add(chain);
          changes.push(f);
          added++;
        } else if (have.gone || (!have.website && f.website) || (!have.phone && f.phone) || (!have.address && f.address)) {
          // Keep what the family did (hidden, renamed); only fill gaps and clear a closed marker.
          changes.push({ ...have, website: have.website || f.website, phone: have.phone || f.phone, address: have.address || f.address, gone: undefined, updatedAt: now });
        }
      }
      // Only a complete search may say a place has gone, and only for places well inside the area searched.
      if (complete) {
        for (const s of current.spots) {
          if (s.source !== 'osm' || s.gone || foundIds.has(s.id) || s.lat === undefined || s.lon === undefined) continue;
          if (distanceM(place, { lat: s.lat, lon: s.lon }) > radius * 0.9) continue;
          changes.push({ ...s, gone: true, updatedAt: now });
          gone++;
        }
      }
      const next = mergeHub(current, { spots: changes });
      next.place = { ...place, searchedAt: now, found: found.length, updatedAt: now };
      return saveHub(h, next);
    });
    res.json({ found: found.length, added, gone, complete, hub });
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// Tonight's live vote. One proposal at a time per household. Phones poll it, so
// everyone can vote from their own handset. The server decides the outcome:
// any veto ends the round; enough yes votes agrees dinner.
// ---------------------------------------------------------------------------
const TIMES = ['20m', '30m', '60m', 'all-day'];
const EFFORTS = ['one-pot', 'standard', 'chef-mode'];
const clipText = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const clipList = (v: unknown, items: number, n: number) =>
  Array.isArray(v) ? v.filter((x) => typeof x === 'string').slice(0, items).map((x: string) => x.trim().slice(0, n)).filter(Boolean) : [];

function cleanMeal(raw: any) {
  if (!raw || typeof raw !== 'object') return null;
  const title = clipText(raw.title, 120);
  const id = clipText(raw.id, 60);
  if (!title || !id || !TIMES.includes(raw.timeStake) || !EFFORTS.includes(raw.effort)) return null;
  const ingredients = clipList(raw.ingredients, 40, 80);
  const prepSteps = clipList(raw.prepSteps, 30, 200);
  if (ingredients.length === 0 || prepSteps.length === 0) return null;
  return {
    id,
    title,
    description: clipText(raw.description, 400),
    cuisine: clipText(raw.cuisine, 40) || 'Other',
    timeStake: raw.timeStake,
    effort: raw.effort,
    ingredients,
    prepSteps,
    tags: clipList(raw.tags, 10, 30),
  };
}

type Tonight = {
  version: number;
  round: number;
  status: 'idle' | 'open' | 'agreed' | 'vetoed';
  meal: ReturnType<typeof cleanMeal>;
  people: string[];
  needed: number;
  ballot: Record<string, 'yes' | 'no'>;
  proposedBy: string;
  vetoedBy: string;
  openedAt: string;
};
const STALE_MS = 12 * 3600 * 1000;
const emptyTonight = (): Tonight => ({
  version: 0, round: 0, status: 'idle', meal: null, people: [], needed: 1, ballot: {}, proposedBy: '', vetoedBy: '', openedAt: '',
});
const tonightOf = (h: Household): Tonight => {
  const t = ((h as any).tonight ||= emptyTonight()) as Tonight;
  if (t.status !== 'idle' && t.openedAt && Date.now() - new Date(t.openedAt).getTime() > STALE_MS) {
    Object.assign(t, emptyTonight(), { version: t.version + 1, round: t.round });
  }
  return t;
};

app.get('/api/tonight', requireHousehold, (req, res) => {
  res.json(tonightOf((req as AuthedRequest).household!));
});

app.post('/api/tonight', smallJson, requireHousehold, async (req, res) => {
  const body = req.body || {};
  const id = (req as AuthedRequest).householdId!;
  try {
    let subs: PushSub[] = [];
    const t = await mutate(store, id, (h) => {
      subs = h.push || [];
      return applyTonightOp(h, body);
    });
    // Tell the other phones. Awaited, because a serverless host may freeze once the reply is sent.
    const msg = voteMessage(String(body.op || ''), body, t as any);
    let notified = 0;
    if (msg) {
      const targets = notActor(subs, msg.actor);
      if (targets.length) {
        const { sent, gone } = await sendToAll(targets, msg.payload);
        notified = sent;
        if (gone.length) await forgetPushSubs(id, gone);
      }
    }
    res.json({ ...t, notified });
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body);
    fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// Other shared lists (recipes, shelved, hidden dishes, store cupboard, likes, dislikes, "always have").
// Small lists live in `hh:${id}.shared`; heavy recipe lists (`recipes`, `shelved`) live in `hh:${id}:meals`
// on Redis so routine vote/shopping/fridge polls never drag hundreds of recipes along.
// ---------------------------------------------------------------------------
const sharedOf = (h: Household, name: SharedName): SharedState<any[]> => {
  const all = (h.shared ||= {});
  return (all[name] ||= emptyShared()) as SharedState<any[]>;
};

const usesSeparateMeals = () => Boolean(store.getMealsBook && store.putMealsBook);

const parseKnownVersions = (raw: unknown): Partial<Record<SharedName, number>> => {
  const out: Partial<Record<SharedName, number>> = {};
  if (typeof raw !== 'string' || !raw.trim()) return out;
  for (const part of raw.split(',')) {
    const [k, v] = part.split(':');
    const num = Number(v);
    if (isSharedName(k) && Number.isFinite(num)) out[k] = num;
  }
  return out;
};

async function readSharedList(id: string, h: Household, name: SharedName, knownV?: number): Promise<SharedPollEntry> {
  if (usesSeparateMeals() && isLargeShared(name)) {
    const legacy = h.shared?.[name] as SharedState<any[]> | undefined;
    const meta = h.sharedMeta?.[name] ?? (legacy ? { version: legacy.version, seeded: legacy.seeded } : { version: 0, seeded: false });
    if (knownV !== undefined && knownV === meta.version) {
      return { version: meta.version, seeded: meta.seeded, unchanged: true };
    }
    if (!meta.seeded && meta.version === 0 && !legacy) return emptyShared();
    const book = await store.getMealsBook!(id);
    const st = (book?.[name as 'recipes' | 'shelved'] as SharedState<any[]> | undefined) || legacy || emptyShared();
    if (knownV !== undefined && knownV === st.version) return { version: st.version, seeded: st.seeded, unchanged: true };
    return st;
  }
  const st = sharedOf(h, name);
  if (knownV !== undefined && knownV === st.version) return { version: st.version, seeded: st.seeded, unchanged: true };
  return st;
}

async function applySharedBatches(
  id: string,
  opsByList: Partial<Record<SharedName, unknown[]>>,
  knownVersions: Partial<Record<SharedName, number>> = {}
): Promise<Record<SharedName, SharedPollEntry>> {
  const separate = usesSeparateMeals();
  let updatedBook: MealsBook | null = null;

  if (separate && ((opsByList.recipes?.length || 0) > 0 || (opsByList.shelved?.length || 0) > 0)) {
    const existingH = await store.get(id);
    if (!existingH) throw new HttpError(401, { error: 'Household code missing or wrong.' });
    updatedBook = await mutateMealsBook(store, id, (book) => {
      for (const name of ['recipes', 'shelved'] as const) {
        const ops = opsByList[name];
        if (!ops?.length) continue;
        const { kind, max } = SHARED[name];
        const cur = (book[name] as SharedState<any[]> | undefined) || (existingH.shared?.[name] as SharedState<any[]> | undefined) || emptyShared();
        const next = ops.reduce((s: SharedState<any[]>, op: unknown) => applySharedOp(kind, max, s, op), cur);
        next.version += 1;
        book[name] = next;
      }
      return book;
    });
  }

  const h = await mutate(store, id, (doc) => {
    for (const name of SHARED_NAMES) {
      if (separate && isLargeShared(name)) {
        const fromBook = updatedBook?.[name as 'recipes' | 'shelved'];
        if (fromBook) {
          doc.sharedMeta = { ...(doc.sharedMeta || {}), [name]: { version: fromBook.version, seeded: fromBook.seeded } };
          if (doc.shared?.[name]) delete doc.shared[name];
        }
        continue;
      }
      const ops = opsByList[name];
      if (!ops?.length) continue;
      const { kind, max } = SHARED[name];
      const next = ops.reduce((s: SharedState<any[]>, op: unknown) => applySharedOp(kind, max, s, op), sharedOf(doc, name));
      next.version += 1;
      doc.shared![name] = next;
    }
    return doc;
  });

  const lists = {} as Record<SharedName, SharedPollEntry>;
  let fetchedBook: MealsBook | undefined;
  for (const name of SHARED_NAMES) {
    const touched = (opsByList[name]?.length || 0) > 0;
    const knownV = touched ? undefined : knownVersions[name];
    if (separate && isLargeShared(name)) {
      const inMem = updatedBook?.[name as 'recipes' | 'shelved'] as SharedState<any[]> | undefined;
      if (inMem) {
        lists[name] = inMem;
        continue;
      }
      const meta = h.sharedMeta?.[name] ?? { version: 0, seeded: false };
      if (knownV !== undefined && knownV === meta.version) {
        lists[name] = { version: meta.version, seeded: meta.seeded, unchanged: true };
      } else if (!meta.seeded && meta.version === 0 && !h.shared?.[name]) {
        lists[name] = emptyShared();
      } else {
        fetchedBook ||= await store.getMealsBook!(id);
        lists[name] = (fetchedBook?.[name as 'recipes' | 'shelved'] as SharedState<any[]> | undefined) || (h.shared?.[name] as SharedState<any[]>) || emptyShared();
      }
    } else {
      const st = sharedOf(h, name);
      lists[name] = knownV !== undefined && knownV === st.version ? { version: st.version, seeded: st.seeded, unchanged: true } : st;
    }
  }
  return lists;
}

app.get('/api/shared', requireHousehold, async (req, res) => {
  const id = (req as AuthedRequest).householdId!;
  const h = (req as AuthedRequest).household!;
  const known = parseKnownVersions(req.query.v);
  try {
    const lists = {} as Record<SharedName, SharedPollEntry>;
    let book: MealsBook | undefined;
    for (const name of SHARED_NAMES) {
      if (usesSeparateMeals() && isLargeShared(name)) {
        const legacy = h.shared?.[name] as SharedState<any[]> | undefined;
        const meta = h.sharedMeta?.[name] ?? (legacy ? { version: legacy.version, seeded: legacy.seeded } : { version: 0, seeded: false });
        if (known[name] !== undefined && known[name] === meta.version) {
          lists[name] = { version: meta.version, seeded: meta.seeded, unchanged: true };
        } else if (!meta.seeded && meta.version === 0 && !legacy) {
          lists[name] = emptyShared();
        } else {
          book ||= await store.getMealsBook!(id);
          const st = (book?.[name as 'recipes' | 'shelved'] as SharedState<any[]> | undefined) || legacy || emptyShared();
          lists[name] = known[name] !== undefined && known[name] === st.version ? { version: st.version, seeded: st.seeded, unchanged: true } : st;
        }
      } else {
        lists[name] = await readSharedList(id, h, name, known[name]);
      }
    }
    res.json({ lists });
  } catch (err) {
    fail(res, err);
  }
});

app.post('/api/shared/batch', smallJson, requireHousehold, async (req, res) => {
  const id = (req as AuthedRequest).householdId!;
  const rawBatches = req.body?.opsByList;
  if (!rawBatches || typeof rawBatches !== 'object') return res.status(400).json({ error: 'No operations' });
  const opsByList: Partial<Record<SharedName, unknown[]>> = {};
  let total = 0;
  for (const [k, v] of Object.entries(rawBatches)) {
    if (isSharedName(k) && Array.isArray(v) && v.length > 0) {
      opsByList[k] = v.slice(0, 200);
      total += opsByList[k]!.length;
    }
  }
  if (total === 0) return res.status(400).json({ error: 'No operations' });
  const known: Partial<Record<SharedName, number>> = {};
  if (req.body?.versions && typeof req.body.versions === 'object') {
    for (const [k, v] of Object.entries(req.body.versions)) {
      if (isSharedName(k) && Number.isFinite(Number(v))) known[k] = Number(v);
    }
  }
  try {
    const lists = await applySharedBatches(id, opsByList, known);
    res.json({ lists });
  } catch (err) {
    fail(res, err);
  }
});

app.get('/api/shared/:name', requireHousehold, async (req, res) => {
  const name = req.params.name;
  if (!isSharedName(name)) return res.status(404).json({ error: 'Unknown list' });
  try {
    const knownV = req.query.v !== undefined ? Number(req.query.v) : undefined;
    const entry = await readSharedList((req as AuthedRequest).householdId!, (req as AuthedRequest).household!, name, knownV);
    res.json(entry);
  } catch (err) {
    fail(res, err);
  }
});

app.post('/api/shared/:name/ops', smallJson, requireHousehold, async (req, res) => {
  const name = req.params.name;
  if (!isSharedName(name)) return res.status(404).json({ error: 'Unknown list' });
  const ops = Array.isArray(req.body?.ops) ? req.body.ops.slice(0, 200) : [];
  if (ops.length === 0) return res.status(400).json({ error: 'No operations' });
  try {
    const lists = await applySharedBatches((req as AuthedRequest).householdId!, { [name]: ops });
    res.json(lists[name]);
  } catch (err) {
    fail(res, err);
  }
});

// ---------------------------------------------------------------------------
// Vote notifications (Web Push). Each phone registers itself under the person it belongs to.
// ---------------------------------------------------------------------------
async function forgetPushSubs(id: string, endpoints: string[]) {
  try {
    await mutate(store, id, (h) => {
      h.push = (h.push || []).filter((s) => !endpoints.includes(s.endpoint));
    });
  } catch {
    // tidy-up only
  }
}

app.get('/api/push/key', (_req, res) => {
  res.json({ publicKey: pushPublicKey() });
});

app.post('/api/push/subscribe', smallJson, requireHousehold, async (req, res) => {
  const sub = cleanSub(req.body?.subscription, req.body?.name);
  if (!sub) return res.status(400).json({ error: 'Missing notification details or name.' });
  try {
    const count = await mutate(store, (req as AuthedRequest).householdId!, (h) => {
      h.push = [...(h.push || []).filter((s) => s.endpoint !== sub.endpoint), sub].slice(-30);
      return h.push.length;
    });
    res.json({ ok: true, phones: count });
  } catch (err) {
    fail(res, err);
  }
});

app.post('/api/push/unsubscribe', smallJson, requireHousehold, async (req, res) => {
  await forgetPushSubs((req as AuthedRequest).householdId!, [String(req.body?.endpoint || '')]);
  res.json({ ok: true });
});

app.post('/api/push/test', smallJson, requireHousehold, async (req, res) => {
  const h = (req as AuthedRequest).household!;
  const sub = (h.push || []).find((s) => s.endpoint === String(req.body?.endpoint || ''));
  if (!sub) return res.status(404).json({ error: 'This phone isn’t signed up for notifications yet.' });
  const { sent, gone } = await sendToAll([sub], { title: 'Dinner Spinner', body: `Notifications are working for ${sub.name}.`, tag: 'test' });
  if (gone.length) await forgetPushSubs((req as AuthedRequest).householdId!, gone);
  res.status(sent ? 200 : 502).json({ ok: sent > 0 });
});

function applyTonightOp(h: Household, body: any): Tonight {
  const t = tonightOf(h);
  switch (body.op) {
    case 'propose': {
      const meal = cleanMeal(body.meal);
      const people = Array.from(new Set(clipList(body.people, 12, 30)));
      if (!meal || people.length === 0) throw new HttpError(400, { error: 'Invalid proposal' });
      const needed = Math.min(people.length, Math.max(1, Math.floor(Number(body.needed)) || Math.ceil(people.length / 2)));
      Object.assign(t, {
        version: t.version + 1,
        round: t.round + 1,
        status: 'open',
        meal,
        people,
        needed,
        ballot: {},
        proposedBy: clipText(body.by, 30),
        vetoedBy: '',
        openedAt: new Date().toISOString(),
      });
      break;
    }
    case 'vote': {
      if (t.status !== 'open') throw new HttpError(409, { error: 'There is no open vote.', tonight: t });
      const voter = t.people.find((p) => p.toLowerCase() === clipText(body.voter, 30).toLowerCase());
      if (!voter || !['yes', 'no'].includes(body.vote)) throw new HttpError(400, { error: 'Invalid vote' });
      t.ballot[voter] = body.vote;
      if (body.vote === 'no') {
        t.status = 'vetoed';
        t.vetoedBy = voter;
      } else if (Object.values(t.ballot).filter((v) => v === 'yes').length >= t.needed) {
        t.status = 'agreed';
      }
      t.version += 1;
      break;
    }
    case 'decide': {
      if (t.status !== 'open') throw new HttpError(409, { error: 'There is no open vote.', tonight: t });
      t.status = 'agreed';
      t.version += 1;
      break;
    }
    case 'clear': {
      Object.assign(t, emptyTonight(), { version: t.version + 1, round: t.round });
      break;
    }
    default:
      throw new HttpError(400, { error: 'Unknown operation' });
  }
  return t;
}

// Live model calls must never leave the UI hanging: give up after GEMINI_TIMEOUT_MS
// and let the catch block serve the simulated response instead.
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 20000;
function withTimeout<T>(promise: Promise<T>, ms = GEMINI_TIMEOUT_MS): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Gemini request timed out after ${ms}ms`)), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        clearTimeout(timer);
        reject(err);
      }
    );
  });
}

// Gemini is sometimes overloaded (503) or rate limited (429), and old models get retired (404). So: try the main model,
// then another current flash model (found by asking Gemini what exists, not hard-coded), then the main one once more.
// The whole thing has a time budget that fits inside the serverless limit.
// The newest flash models are often swamped or over quota (Nov 2026: 3.6-3.8 failed every scan), so the default is a
// steadier one, with fast "lite" models as the first fallbacks. They answer in 1-4 seconds and read photos fine.
const PRIMARY_MODEL = process.env.GEMINI_MODEL || 'gemini-3.5-flash';
const PREFERRED_FALLBACKS = ['gemini-3.5-flash-lite', 'gemini-flash-lite-latest', 'gemini-3.1-flash-lite'];
const GEMINI_BUDGET_MS = 26000;
const isBusyError = (e: any) =>
  /\b(503|429|404|UNAVAILABLE|RESOURCE_EXHAUSTED|NOT_FOUND|overloaded|high demand|timed out|abort)/i.test(String(e?.message || e));

let fallbackCache: { at: number; models: string[] } | null = null;
async function fallbackModels(): Promise<string[]> {
  if (fallbackCache && Date.now() - fallbackCache.at < 10 * 60_000) return fallbackCache.models;
  const found: { name: string; v: number }[] = [];
  const preferred: string[] = [];
  try {
    const pager: any = await withTimeout(ai!.models.list(), 4000);
    for await (const m of pager) {
      const name = String(m.name || '').replace(/^models\//, '');
      const actions: string[] = m.supportedActions || [];
      if (PREFERRED_FALLBACKS.includes(name) && name !== PRIMARY_MODEL) preferred.push(name);
      if (!/flash/i.test(name) || /image|tts|audio|live|embed|robot|computer|lite|thinking|exp/i.test(name)) continue;
      if (actions.length && !actions.includes('generateContent')) continue;
      if (name === PRIMARY_MODEL) continue;
      found.push({ name, v: parseFloat((name.match(/(\d+(?:\.\d+)?)/) || [])[1] || '0') });
    }
  } catch (e) {
    console.warn('Could not list Gemini models:', (e as any)?.message);
  }
  found.sort((x, y) => y.v - x.v);
  preferred.sort((a, b) => PREFERRED_FALLBACKS.indexOf(a) - PREFERRED_FALLBACKS.indexOf(b));
  const models = [...preferred.slice(0, 2), ...found.slice(0, 1).map((m) => m.name)];
  console.warn('Gemini fallback models:', models.join(', ') || '(none)');
  fallbackCache = { at: Date.now(), models };
  return models;
}

async function generateWithFallback(request: any): Promise<any> {
  const started = Date.now();
  const left = () => GEMINI_BUDGET_MS - (Date.now() - started);
  let last: any;
  const dead = new Set<string>(); // models that don't exist (404) are skipped
  let fallbacks: string[] | null = null;
  // Overload spikes are short and a refused call comes back in about a second, so keep rotating through the models
  // (main, a fallback, main, the other fallback, ...) with a short pause, until the time budget is spent.
  for (let round = 0; ; round++) {
    if (round === 1) fallbacks = await fallbackModels();
    const aliveFallbacks = (fallbacks || []).filter((m) => !dead.has(m));
    const model =
      round % 2 === 0
        ? PRIMARY_MODEL
        : aliveFallbacks.length > 0
          ? aliveFallbacks[Math.floor(round / 2) % aliveFallbacks.length]
          : PRIMARY_MODEL;
    if (model && !dead.has(model)) {
      const ms = Math.min(round === 0 ? 14000 : 9000, left() - 300);
      if (ms < 2500) throw last || new Error('Gemini timed out');
      try {
        return await withTimeout(
          ai!.models.generateContent({ ...request, model, config: { ...request.config, abortSignal: AbortSignal.timeout(ms) } }),
          ms
        );
      } catch (e) {
        last = e;
        if (!isBusyError(e)) throw e;
        if (/\b404\b|NOT_FOUND/i.test(String((e as any)?.message))) dead.add(model);
        console.warn(`Gemini ${model} unavailable (round ${round + 1}):`, String((e as any)?.message).slice(0, 160));
      }
    }
    if (left() < 3500) throw last || new Error('Gemini timed out');
    await new Promise((r) => setTimeout(r, 900));
  }
}

// Realistic UK Kitchen Demo Fallbacks when GEMINI_API_KEY is not configured
function getSimulatedVisionResponse(type: string, textPrompt?: string) {
  if (type === 'snap-cupboard') {
    return {
      demoMode: true,
      detectedItems: [
        { name: 'Chopped Tomatoes', category: 'Tins & jars', freshness: 'green', estimatedQuantity: '3 tins' },
        { name: 'Coconut Milk', category: 'Tins & jars', freshness: 'green', estimatedQuantity: '1 tin' },
        { name: 'Soy Sauce', category: 'Sauces & condiments', freshness: 'green', estimatedQuantity: '1 bottle' },
        { name: 'Basmati Rice', category: 'Pasta, rice & grains', freshness: 'green', estimatedQuantity: 'half a bag' },
        { name: 'Smoked Paprika', category: 'Herbs & spices', freshness: 'green', estimatedQuantity: '1 jar' },
      ],
    };
  }
  if (type === 'snap-fridge') {
    return {
      demoMode: true,
      detectedItems: [
        {
          name: 'Chestnut Mushrooms',
          category: 'Produce',
          freshness: 'red',
          estimatedQuantity: '250g punnet',
        },
        {
          name: 'Baby Spinach Leaves',
          category: 'Produce',
          freshness: 'amber',
          estimatedQuantity: '1/2 bag',
        },
        {
          name: 'Double Cream',
          category: 'Dairy & Eggs',
          freshness: 'red',
          estimatedQuantity: '150ml pot',
        },
        {
          name: 'British Free-Range Eggs',
          category: 'Dairy & Eggs',
          freshness: 'green',
          estimatedQuantity: '6 box',
        },
      ],
    };
  }
  if (type === 'scan-receipt') {
    return {
      demoMode: true,
      storeName: 'Sainsbury’s Local',
      receiptDate: new Date().toISOString().slice(0, 10),
      items: [
        {
          name: 'Cypriot Halloumi 225g',
          category: 'Dairy & Eggs',
          quantity: '225g pack',
          price: '£2.50',
        },
        {
          name: 'British Chicken Breast Fillets',
          category: 'Meat & Fish',
          quantity: '500g',
          price: '£4.25',
        },
        {
          name: 'San Marzano Chopped Tomatoes',
          category: 'Cupboard & Grains',
          quantity: '2 x 400g tins',
          price: '£2.20',
        },
        {
          name: 'Fresh Coriander Bunch',
          category: 'Produce',
          quantity: '30g pack',
          price: '£1.05',
        },
      ],
    };
  }
  const cleanTitle = textPrompt?.trim()
    ? textPrompt.trim().slice(0, 60)
    : 'Creamy Garlic Mushroom & Spinach Chicken Skillet';
  return {
    demoMode: true,
    meal: {
      title: cleanTitle,
      description:
        'Golden pan-seared British chicken thighs simmered in a velvety garlic, thyme, chestnut mushroom, and double cream pan sauce with wilted baby spinach.',
      cuisine: 'British',
      timeStake: '30m',
      effort: 'one-pot',
      ingredients: [
        'Free-Range Chicken Thighs',
        'Chestnut Mushrooms',
        'Double Cream',
        'Baby Spinach Leaves',
        'Garlic Bulbs',
        'Butter',
        'Chicken Stock',
      ],
      prepSteps: [
        'Season chicken thighs and sear skin-side down in heavy skillet (-26m)',
        'Slice chestnut mushrooms and sauté in pan drippings with butter (-18m)',
        'Add crushed garlic, thyme, and splash of chicken stock to deglaze (-12m)',
        'Pour in double cream and return chicken to bubble gently (-6m)',
        'Fold through baby spinach until wilted and serve immediately (-0m)',
      ],
      tags: ['One-Pot Wonder', 'Clearout Hero', 'AI Extracted'],
    },
  };
}

// A freely licensed photo for a dish (Wikimedia Commons), so recipes the family adds get a picture. Only the dish name is sent.
let photoSearch = createPhotoSearch(fetch);
export const usePhotoSearch = (next: ReturnType<typeof createPhotoSearch>) => {
  photoSearch = next;
};
app.get('/api/photos/find', rateLimit('photo', 60, 10 * 60_000), async (req, res) => {
  const title = typeof req.query.title === 'string' ? req.query.title.trim().slice(0, 100) : '';
  if (title.length < 3) return res.status(400).json({ error: 'Give the dish a name first.' });
  const found = await photoSearch.findPhoto(title);
  res.set('Cache-Control', 'public, max-age=86400');
  res.json({ photo: found });
});

// Daily UK delivery deals (day-of-week calendar + optional live Awin affiliate feed) and household-pinned codes.
let dealsService = createDealsService();
export const useDealsService = (next: ReturnType<typeof createDealsService>) => {
  dealsService = next;
};
app.get('/api/deals/today', rateLimit('deals', 60, 10 * 60_000), async (_req, res) => {
  try {
    const snapshot = await dealsService.getTodayDeals();
    res.set('Cache-Control', 'public, max-age=1800');
    res.json(snapshot);
  } catch (err) {
    fail(res, err);
  }
});

app.get('/api/deals/pins', requireHousehold, (req, res) => {
  const h = (req as any).household as Household;
  const pins = pruneDealPins(h.dealPins || []);
  res.json({ pins });
});

app.post('/api/deals/pins', smallJson, requireHousehold, async (req, res) => {
  try {
    const id: string = (req as any).householdId;
    const raw = req.body || {};
    const pin = cleanDealPin({
      ...raw,
      id: typeof raw.id === 'string' && raw.id.trim() ? raw.id : `pin_${crypto.randomBytes(6).toString('hex')}`,
    });
    if (!pin) return res.status(400).json({ error: 'Pick a delivery firm and enter the offer.' });
    let nextPins = [] as ReturnType<typeof pruneDealPins>;
    await mutate(store, id, (h) => {
      const existing = pruneDealPins(h.dealPins || []).filter((p) => p.id !== pin.id);
      nextPins = pruneDealPins([pin, ...existing]);
      h.dealPins = nextPins;
    });
    res.json({ pin, pins: nextPins });
  } catch (err) {
    fail(res, err);
  }
});

app.delete('/api/deals/pins/:pinId', requireHousehold, async (req, res) => {
  try {
    const id: string = (req as any).householdId;
    const pinId = String(req.params.pinId || '').trim();
    let nextPins = [] as ReturnType<typeof pruneDealPins>;
    await mutate(store, id, (h) => {
      nextPins = pruneDealPins((h.dealPins || []).filter((p) => p.id !== pinId));
      h.dealPins = nextPins;
    });
    res.json({ pins: nextPins });
  } catch (err) {
    fail(res, err);
  }
});

// Recipe from a web address. Most recipe sites embed structured recipe data, which we read directly (no AI needed).
// If a page has none, the readable text comes back so the phone can still split it into a draft.
let pageFetcher: typeof fetchPublicPage = fetchPublicPage;
/** Tests swap in a fake page fetcher. */
export const usePageFetcher = (next: typeof fetchPublicPage) => {
  pageFetcher = next;
};
app.post('/api/recipes/import', smallJson, rateLimit('recipe link', 20, 10 * 60_000), async (req, res) => {
  try {
    const url = typeof req.body?.url === 'string' ? req.body.url.trim().slice(0, 500) : '';
    if (!url) return res.status(400).json({ error: 'Paste a link to a recipe.' });
    const page = await pageFetcher(url);
    const recipe = extractRecipeFromHtml(page.html);
    if (recipe) return res.json({ recipe: { ...recipe, tags: [...recipe.tags, 'From a website'].slice(0, 5) }, source: page.url });
    res.status(422).json({
      error: 'That page doesn’t have a recipe the app can read. Here is its text; check it over.',
      text: htmlToText(page.html, 12_000),
      source: page.url,
    });
  } catch (err) {
    fail(res, err);
  }
});

// Multimodal Gemini Vision & Text API endpoint for Fridge, Receipt & Meal Grab
app.post('/api/pantry/analyze', imageJson, rateLimit('scan', 20, 10 * 60_000), async (req, res) => {
  try {
    const { type, imageBase64, mimeType = 'image/jpeg', textPrompt, demo } = req.body || {};

    if (!type || !['snap-fridge', 'snap-cupboard', 'scan-receipt', 'recipe-photo', 'recipe-text'].includes(type)) {
      return res.status(400).json({ error: `Unsupported analysis type: ${type}` });
    }

    // Explicit demo requests (the "Try a sample" buttons) never call the live model and are
    // always labelled as sample data. They ignore any text the user typed.
    if (demo === true) {
      return res.json(getSimulatedVisionResponse(type));
    }

    if (!imageBase64 && !textPrompt) {
      return res.status(400).json({ error: 'Missing image or text prompt' });
    }

    // Never invent a result for something the user actually asked for.
    if (!ai) {
      return res.status(503).json({
        error: 'Scanning isn’t switched on for this app. Try a sample, or add the recipe by hand.',
      });
    }

    // Live model calls cost money, so only household members may make them.
    if (!(await authenticate(req))) {
      return res.status(401).json({ error: 'Turn on household sharing before using scanning.' });
    }

    const cleanBase64 = imageBase64 ? imageBase64.replace(/^data:[^;]+;base64,/, '') : '';
    const parts: any[] = [];
    if (cleanBase64) {
      parts.push({
        inlineData: {
          mimeType,
          data: cleanBase64,
        },
      });
    }

    if (type === 'snap-fridge' || type === 'snap-cupboard') {
      const prompt = type === 'snap-cupboard'
        ? `You are the inventory scanner for a UK kitchen. Look at this photo of a store cupboard, larder or shelf. Identify every distinct tin, jar, packet, bottle, sauce, spice and dry good you can read or recognise.
For each item:
- name: clear UK English product name without the brand where possible (e.g. "Chopped Tomatoes", "Coconut Milk", "Basmati Rice", "Soy Sauce", "Smoked Paprika", "Chickpeas").
- category: one of ["Tins & jars", "Sauces & condiments", "Pasta, rice & grains", "Herbs & spices", "Baking", "Oils & vinegars", "Other"].
- freshness: always "green".
- estimatedQuantity: rough quantity (e.g. "2 tins", "1 jar", "half a bag").`
        : `You are the pantry inventory scanner for a UK kitchen. Look at this photo of a fridge or store cupboard. Identify all distinct food items, ingredients, vegetables, meats, dairy, and condiments visible.
For each item:
- name: clear UK English ingredient name (e.g., "Mature Cheddar", "Courgettes", "Semi-Skimmed Milk", "Greek Style Yoghurt", "Free-Range Eggs", "Chestnut Mushrooms").
- category: one of ["Produce", "Dairy & Eggs", "Meat & Fish", "Cupboard & Grains", "Sauces & Condiments", "Bakery", "Frozen"].
- freshness: determine likely freshness based on visual cues. Set to "red" for items that look like they need eating immediately ("Use Next"), "amber" for standard fridge items ("Eat Soon"), or "green" for fresh/unopened items ("Fresh").
- estimatedQuantity: rough quantity (e.g., "1/2 block", "3 items", "1 bottle", "Approx 200g").`;

      parts.push({ text: prompt });

      const response = await generateWithFallback({
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              detectedItems: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    category: { type: Type.STRING },
                    freshness: {
                      type: Type.STRING,
                      description: 'Must be "green", "amber", or "red"',
                    },
                    estimatedQuantity: { type: Type.STRING },
                  },
                  required: ['name', 'category', 'freshness', 'estimatedQuantity'],
                },
              },
            },
            required: ['detectedItems'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{"detectedItems":[]}');
      return res.json(parsed);
    } else if (type === 'scan-receipt') {
      const prompt = `You are a UK supermarket receipt scanner (e.g. Tesco, Sainsbury's, Marks & Spencer, Waitrose, Aldi, Lidl). Scan this receipt image and extract all grocery and food line items purchased. Ignore non-food items (like carrier bags, cleaning products, toilet roll) or total line rows.
Extract:
- name: cleaned-up ingredient/food item name (e.g., "Free-Range Chicken Thighs 600g", "British Maris Piper Potatoes", "Tinned Chopped Tomatoes").
- category: one of ["Produce", "Dairy & Eggs", "Meat & Fish", "Cupboard & Grains", "Sauces & Condiments", "Bakery", "Snacks"].
- quantity: quantity or weight string.
- price: approximate price with £ symbol if visible, or "N/A".`;

      parts.push({ text: prompt });

      const response = await generateWithFallback({
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              storeName: { type: Type.STRING },
              receiptDate: { type: Type.STRING },
              items: {
                type: Type.ARRAY,
                items: {
                  type: Type.OBJECT,
                  properties: {
                    name: { type: Type.STRING },
                    category: { type: Type.STRING },
                    quantity: { type: Type.STRING },
                    price: { type: Type.STRING },
                  },
                  required: ['name', 'category', 'quantity'],
                },
              },
            },
            required: ['items'],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{"items":[]}');
      return res.json(parsed);
    } else if (type === 'recipe-photo' || type === 'recipe-text') {
      const prompt = `You are creating a structured Meal Card for "Dinner Spinner", a British dinner decider game.
Analyze the uploaded photo (which may be a photo of a plated dish, a recipe book page, or hand-written recipe card) or the user's description: "${textPrompt || ''}".
Extract a complete, appetizing UK dinner recipe.
Fields:
- title: clear, punchy UK dinner title (e.g., "Pan-Fried Seabass with Crushed New Potatoes", "Rigatoni Arrabbiata with Crispy Pancetta", "Slow-Cooked Beef Shin Chilli").
- description: 1-2 sentence appetizing summary.
- cuisine: e.g. "British", "Italian", "Indian", "Mexican", "Chinese", "Thai", "Mediterranean", "American".
- timeStake: must be exactly one of ["20m", "30m", "60m", "all-day"].
- effort: must be exactly one of ["one-pot", "standard", "chef-mode"].
- ingredients: list of key ingredients (strings).
- prepSteps: 4 to 6 chronological cooking milestones with estimated offset in minutes before eating time (e.g., ["Preheat oven to 200°C (-35m)", "Chop potatoes and parboil (-30m)", "Sear meat in cast iron (-20m)", "Simmer sauce and reduce (-10m)", "Rest and serve (-0m)"]).
- tags: array of tags e.g. ["Comfort Food", "Kid Friendly", "High Protein", "Vegetarian", "Quick Midweek"].`;

      parts.push({ text: prompt });

      const response = await generateWithFallback({
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              title: { type: Type.STRING },
              description: { type: Type.STRING },
              cuisine: { type: Type.STRING },
              timeStake: {
                type: Type.STRING,
                description: 'Must be "20m", "30m", "60m", or "all-day"',
              },
              effort: {
                type: Type.STRING,
                description: 'Must be "one-pot", "standard", or "chef-mode"',
              },
              ingredients: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              prepSteps: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
              tags: {
                type: Type.ARRAY,
                items: { type: Type.STRING },
              },
            },
            required: [
              'title',
              'description',
              'cuisine',
              'timeStake',
              'effort',
              'ingredients',
              'prepSteps',
            ],
          },
        },
      });

      const parsed = JSON.parse(response.text || '{}');
      return res.json({ meal: parsed });
    }
  } catch (error: any) {
    console.warn('Gemini API error:', error?.message);
    if (isBusyError(error)) {
      return res.status(503).json({ busy: true, error: 'The scanner is busy right now. Give it a minute and try again.' });
    }
    return res.status(502).json({
      error: 'The scanner couldn’t read that just now. Try again, or add it by hand.',
    });
  }
});

// Start Express server and mount Vite in development
async function startServer() {
  const isProduction = process.env.NODE_ENV === 'production';

  if (!isProduction) {
    const { createServer: createViteServer } = await import('vite');
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.resolve(__dirname, 'dist');
    app.use(
      express.static(distPath, {
        setHeaders: (res, filePath) => {
          // The service worker and page must always be re-checked; hashed assets can be cached for a year.
          if (/sw\.js$|index\.html$|manifest\.webmanifest$/.test(filePath)) res.setHeader('Cache-Control', 'no-cache');
          else if (filePath.includes(`${path.sep}assets${path.sep}`)) res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
        },
      })
    );
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dinner Spinner server listening on http://0.0.0.0:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test' && !process.env.VERCEL) {
  startServer().catch((err) => {
    console.error('Server startup error:', err);
  });
}

export { app };
