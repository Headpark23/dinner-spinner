import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import { applyShoppingOp } from './src/utils/shopping';
import { Household, HttpError, Store, createFileStore, createStoreFromEnv, mutate } from './src/server/store';

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

const sha256 = (v: string) => crypto.createHash('sha256').update(v).digest();

async function authenticate(req: express.Request): Promise<{ id: string; household: Household } | null> {
  const id = String(req.header('x-household-id') || '');
  const key = String(req.header('x-household-key') || '');
  if (!id || !key) return null;
  const household = await store.get(id);
  if (!household) return null;
  const given = sha256(key);
  const stored = Buffer.from(household.keyHash, 'hex');
  if (given.length !== stored.length || !crypto.timingSafeEqual(given, stored)) return null;
  return { id, household };
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
  res.json({ ok: true, hasSnapshot: Boolean(h.snapshotAt), createdAt: h.createdAt });
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
      h.shopping.items = ops.reduce(applyShoppingOp, h.shopping.items);
      h.shopping.version += 1;
      return h.shopping;
    });
    res.json(shopping);
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
  try {
    const t = await mutate(store, (req as AuthedRequest).householdId!, (h) => applyTonightOp(h, body));
    res.json(t);
  } catch (err) {
    if (err instanceof HttpError) return res.status(err.status).json(err.body);
    fail(res, err);
  }
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

// Realistic UK Kitchen Demo Fallbacks when GEMINI_API_KEY is not configured
function getSimulatedVisionResponse(type: string, textPrompt?: string) {
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

// Multimodal Gemini Vision & Text API endpoint for Fridge, Receipt & Meal Grab
app.post('/api/pantry/analyze', imageJson, rateLimit('scan', 20, 10 * 60_000), async (req, res) => {
  try {
    const { type, imageBase64, mimeType = 'image/jpeg', textPrompt, demo } = req.body || {};

    if (!type || !['snap-fridge', 'scan-receipt', 'recipe-photo', 'recipe-text'].includes(type)) {
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

    if (type === 'snap-fridge') {
      const prompt = `You are the pantry inventory scanner for a UK kitchen. Look at this photo of a fridge or store cupboard. Identify all distinct food items, ingredients, vegetables, meats, dairy, and condiments visible.
For each item:
- name: clear UK English ingredient name (e.g., "Mature Cheddar", "Courgettes", "Semi-Skimmed Milk", "Greek Style Yoghurt", "Free-Range Eggs", "Chestnut Mushrooms").
- category: one of ["Produce", "Dairy & Eggs", "Meat & Fish", "Cupboard & Grains", "Sauces & Condiments", "Bakery", "Frozen"].
- freshness: determine likely freshness based on visual cues. Set to "red" for items that look like they need eating immediately ("Use Next"), "amber" for standard fridge items ("Eat Soon"), or "green" for fresh/unopened items ("Fresh").
- estimatedQuantity: rough quantity (e.g., "1/2 block", "3 items", "1 bottle", "Approx 200g").`;

      parts.push({ text: prompt });

      const response = await withTimeout(ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          // Cancel the underlying HTTP request too, so nothing lingers after we fall back.
          abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
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
      }));

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

      const response = await withTimeout(ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          // Cancel the underlying HTTP request too, so nothing lingers after we fall back.
          abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
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
      }));

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

      const response = await withTimeout(ai.models.generateContent({
        model: 'gemini-3.8-flash',
        contents: { parts },
        config: {
          responseMimeType: 'application/json',
          // Cancel the underlying HTTP request too, so nothing lingers after we fall back.
          abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
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
      }));

      const parsed = JSON.parse(response.text || '{}');
      return res.json({ meal: parsed });
    }
  } catch (error: any) {
    console.warn('Gemini API error:', error?.message);
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
