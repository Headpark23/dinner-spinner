import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';
import webpush from 'web-push';
import { applyShoppingOp } from './src/utils/shopping';
import { applyCupboardOp, applyTastesOp, applyRecipesOp, castVote, majorityFor, HouseholdRecipes } from './src/utils/household';
import type { ShoppingItem, CupboardItem, HouseholdTastes, SharedVote } from './src/types';

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const SYNC_CACHE_PATH = path.resolve(__dirname, '.cloud-sync-cache.json');

app.use(express.json({ limit: '25mb' }));

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

// In-memory + disk cloud sync store
let cloudSyncStore: {
  syncedAt: string;
  syncId: string;
  data: any;
} | null = null;

try {
  if (fs.existsSync(SYNC_CACHE_PATH)) {
    cloudSyncStore = JSON.parse(fs.readFileSync(SYNC_CACHE_PATH, 'utf-8'));
  }
} catch {
  cloudSyncStore = null;
}

// Health check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    appName: 'Dinner Spinner',
    hasGeminiKey: hasRealGeminiKey,
    demoFallbackReady: true,
    hasCloudSnapshot: Boolean(cloudSyncStore),
    timestamp: new Date().toISOString(),
  });
});

// OAuth Profile & Cloud Syncing endpoint
app.post('/api/auth/profile', (req, res) => {
  const { provider = 'google', email = 'user@example.co.uk', name = 'Family Chef' } = req.body || {};
  res.json({
    success: true,
    user: {
      id: 'usr_uk_' + Math.random().toString(36).substring(2, 9),
      name: String(name || 'Family Chef').slice(0, 60),
      email: String(email || 'family.chef@googlemail.com').slice(0, 100),
      avatarUrl: `https://api.dicebear.com/7.x/bottts/svg?seed=${encodeURIComponent(
        name || 'chef'
      )}&backgroundColor=ffb703`,
      provider,
      cloudSyncEnabled: true,
      lastSyncedAt: new Date().toISOString(),
      tokenExpiresIn: 3600,
    },
  });
});

app.post('/api/sync/cloud', (req, res) => {
  const { data } = req.body || {};
  if (!data || typeof data !== 'object') {
    return res.status(400).json({ error: 'Invalid sync payload' });
  }

  const snapshot = {
    syncedAt: new Date().toISOString(),
    syncId: 'sync_' + Date.now(),
    data,
  };
  cloudSyncStore = snapshot;

  try {
    fs.writeFileSync(SYNC_CACHE_PATH, JSON.stringify(snapshot, null, 2), 'utf-8');
  } catch {
    // Non-fatal if read-only filesystem
  }

  res.json({
    success: true,
    syncedAt: snapshot.syncedAt,
    itemCount: Array.isArray(data?.meals) ? data.meals.length : 0,
    syncId: snapshot.syncId,
  });
});

app.get('/api/sync/cloud', (_req, res) => {
  if (!cloudSyncStore) {
    return res.json({
      success: true,
      hasSnapshot: false,
      data: null,
    });
  }
  return res.json({
    success: true,
    hasSnapshot: true,
    syncedAt: cloudSyncStore.syncedAt,
    syncId: cloudSyncStore.syncId,
    data: cloudSyncStore.data,
  });
});

// ---------------------------------------------------------------------------
// Shared household shopping list. Everyone using this server sees one list, so
// whoever is at the shop can tick items off and the rest of the family sees it.
// Clients send small operations; the server applies them in order and bumps a
// version number that clients poll.
// ---------------------------------------------------------------------------
const SHOPPING_PATH = process.env.NODE_ENV === 'test' ? null : path.resolve(__dirname, '.shopping-list.json');

let shopping: { version: number; items: ShoppingItem[] } = { version: 0, items: [] };
try {
  if (SHOPPING_PATH && fs.existsSync(SHOPPING_PATH)) {
    shopping = JSON.parse(fs.readFileSync(SHOPPING_PATH, 'utf-8'));
  }
} catch {
  shopping = { version: 0, items: [] };
}

app.get('/api/shopping', (_req, res) => {
  res.json(shopping);
});

app.post('/api/shopping/ops', (req, res) => {
  const ops = Array.isArray(req.body?.ops) ? req.body.ops.slice(0, 200) : [];
  if (ops.length === 0) return res.status(400).json({ error: 'No operations' });
  shopping.items = ops.reduce(applyShoppingOp, shopping.items);
  shopping.version += 1;
  if (SHOPPING_PATH) {
    try {
      fs.writeFileSync(SHOPPING_PATH, JSON.stringify(shopping, null, 2), 'utf-8');
    } catch {
      // Read-only filesystem: the list still lives in memory.
    }
  }
  res.json(shopping);
});

// ---------------------------------------------------------------------------
// Other shared household data: the store cupboard and likes & dislikes. Same
// model as the shopping list: phones send operations, the server applies them in
// order, bumps a version, and every phone polls.
// ---------------------------------------------------------------------------
function mountSharedStore<T>(name: string, file: string, initial: T, apply: (state: T, op: any) => T) {
  const filePath = process.env.NODE_ENV === 'test' ? null : path.resolve(__dirname, file);
  let store: { version: number; data: T } = { version: 0, data: initial };
  try {
    if (filePath && fs.existsSync(filePath)) store = JSON.parse(fs.readFileSync(filePath, 'utf-8'));
  } catch {
    store = { version: 0, data: initial };
  }

  app.get(`/api/${name}`, (_req, res) => {
    res.json(store);
  });

  app.post(`/api/${name}/ops`, (req, res) => {
    const ops = Array.isArray(req.body?.ops) ? req.body.ops.slice(0, 200) : [];
    if (ops.length === 0) return res.status(400).json({ error: 'No operations' });
    store = { version: store.version + 1, data: ops.reduce(apply, store.data) };
    if (filePath) {
      try {
        fs.writeFileSync(filePath, JSON.stringify(store, null, 2), 'utf-8');
      } catch {
        // Read-only filesystem: still shared in memory.
      }
    }
    res.json(store);
  });
}

mountSharedStore<CupboardItem[]>('cupboard', '.cupboard.json', [], applyCupboardOp);
mountSharedStore<HouseholdTastes>('tastes', '.tastes.json', { likes: [], avoid: [] }, applyTastesOp);
mountSharedStore<HouseholdRecipes>('recipes', '.recipes.json', { meals: [], hidden: [] }, applyRecipesOp);

// ---------------------------------------------------------------------------
// Push notifications (Web Push). Keys are generated once and kept on disk, or
// can be supplied as VAPID_PUBLIC_KEY / VAPID_PRIVATE_KEY.
// ---------------------------------------------------------------------------
const PUSH_KEYS_PATH = path.resolve(__dirname, '.push-keys.json');
const PUSH_SUBS_PATH = process.env.NODE_ENV === 'test' ? null : path.resolve(__dirname, '.push-subscriptions.json');

function loadVapidKeys(): { publicKey: string; privateKey: string } {
  if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
    return { publicKey: process.env.VAPID_PUBLIC_KEY.trim(), privateKey: process.env.VAPID_PRIVATE_KEY.trim() };
  }
  try {
    if (fs.existsSync(PUSH_KEYS_PATH)) return JSON.parse(fs.readFileSync(PUSH_KEYS_PATH, 'utf-8'));
  } catch {
    // regenerate below
  }
  const keys = webpush.generateVAPIDKeys();
  if (process.env.NODE_ENV !== 'test') {
    try {
      fs.writeFileSync(PUSH_KEYS_PATH, JSON.stringify(keys, null, 2), 'utf-8');
    } catch {
      // Keys only last until restart; phones re-subscribe automatically.
    }
  }
  return keys;
}

const vapidKeys = loadVapidKeys();
// Apple's push service insists on a real mailto: or https: contact here.
webpush.setVapidDetails(
  process.env.VAPID_SUBJECT?.trim() || 'https://github.com/Headpark23/dinner-spinner',
  vapidKeys.publicKey,
  vapidKeys.privateKey
);

interface PushSub {
  endpoint: string;
  keys: { p256dh: string; auth: string };
  memberId: string;
  memberName?: string;
  updatedAt: string;
}

let pushSubs: PushSub[] = [];
try {
  if (PUSH_SUBS_PATH && fs.existsSync(PUSH_SUBS_PATH)) pushSubs = JSON.parse(fs.readFileSync(PUSH_SUBS_PATH, 'utf-8'));
} catch {
  pushSubs = [];
}
const savePushSubs = () => {
  if (!PUSH_SUBS_PATH) return;
  try {
    fs.writeFileSync(PUSH_SUBS_PATH, JSON.stringify(pushSubs, null, 2), 'utf-8');
  } catch {
    // in memory only
  }
};

interface PushPayload {
  title: string;
  body: string;
  url?: string;
  tag?: string;
}

async function sendPush(sub: PushSub, payload: PushPayload): Promise<boolean> {
  try {
    await webpush.sendNotification(
      { endpoint: sub.endpoint, keys: sub.keys },
      JSON.stringify({ url: '/?view=vote', ...payload }),
      { TTL: 60 * 60 * 6, urgency: 'high' }
    );
    return true;
  } catch (err: any) {
    // The phone unsubscribed or the app was removed: forget it.
    if (err?.statusCode === 404 || err?.statusCode === 410) {
      pushSubs = pushSubs.filter((s) => s.endpoint !== sub.endpoint);
      savePushSubs();
    } else {
      console.warn('Push failed:', err?.statusCode, err?.body || err?.message);
    }
    return false;
  }
}

/** Tell every subscribed phone except the person who just acted. */
async function notifyHousehold(exceptMemberId: string | undefined, payload: PushPayload) {
  const targets = pushSubs.filter((s) => !exceptMemberId || s.memberId !== exceptMemberId);
  await Promise.all(targets.map((s) => sendPush(s, payload)));
  return targets.length;
}

app.get('/api/push/key', (_req, res) => {
  res.json({ publicKey: vapidKeys.publicKey });
});

app.post('/api/push/subscribe', (req, res) => {
  const sub = req.body?.subscription;
  const memberId = String(req.body?.memberId || '').slice(0, 60);
  if (!sub?.endpoint || !sub?.keys?.p256dh || !sub?.keys?.auth || !memberId) {
    return res.status(400).json({ error: 'Missing subscription or member' });
  }
  const entry: PushSub = {
    endpoint: String(sub.endpoint).slice(0, 1000),
    keys: { p256dh: String(sub.keys.p256dh).slice(0, 200), auth: String(sub.keys.auth).slice(0, 100) },
    memberId,
    memberName: String(req.body?.memberName || '').slice(0, 40) || undefined,
    updatedAt: new Date().toISOString(),
  };
  pushSubs = [...pushSubs.filter((s) => s.endpoint !== entry.endpoint), entry].slice(-50);
  savePushSubs();
  res.json({ success: true, devices: pushSubs.length });
});

app.post('/api/push/unsubscribe', (req, res) => {
  const endpoint = String(req.body?.endpoint || '');
  pushSubs = pushSubs.filter((s) => s.endpoint !== endpoint);
  savePushSubs();
  res.json({ success: true });
});

app.post('/api/push/test', async (req, res) => {
  const sub = pushSubs.find((s) => s.endpoint === String(req.body?.endpoint || ''));
  if (!sub) return res.status(404).json({ error: 'This phone isn’t subscribed yet' });
  const ok = await sendPush(sub, {
    title: 'Dinner Spinner',
    body: `Notifications are working for ${sub.memberName || 'this phone'}.`,
    tag: 'test',
  });
  res.status(ok ? 200 : 502).json({ success: ok });
});

// ---------------------------------------------------------------------------
// Tonight's vote, shared between phones. Proposing a dish notifies everyone
// else; every vote notifies everyone except the voter.
// ---------------------------------------------------------------------------
const VOTE_PATH = process.env.NODE_ENV === 'test' ? null : path.resolve(__dirname, '.vote.json');
let voteStore: { version: number; vote: SharedVote | null } = { version: 0, vote: null };
try {
  if (VOTE_PATH && fs.existsSync(VOTE_PATH)) voteStore = JSON.parse(fs.readFileSync(VOTE_PATH, 'utf-8'));
} catch {
  voteStore = { version: 0, vote: null };
}
const saveVote = (vote: SharedVote | null) => {
  voteStore = { version: voteStore.version + 1, vote };
  if (VOTE_PATH) {
    try {
      fs.writeFileSync(VOTE_PATH, JSON.stringify(voteStore), 'utf-8');
    } catch {
      // in memory only
    }
  }
};

const cleanPerson = (p: any) => ({
  id: String(p?.id || '').slice(0, 60),
  name: String(p?.name || 'Someone').trim().slice(0, 40) || 'Someone',
});

app.get('/api/vote', (_req, res) => {
  res.json(voteStore);
});

app.post('/api/vote/propose', async (req, res) => {
  const { meal, proposedBy, members } = req.body || {};
  if (!meal || typeof meal !== 'object' || typeof meal.title !== 'string' || !meal.title.trim()) {
    return res.status(400).json({ error: 'Missing dish' });
  }
  if (JSON.stringify(meal).length > 200_000) return res.status(413).json({ error: 'Dish too large' });
  const people = (Array.isArray(members) ? members : []).slice(0, 20).map(cleanPerson).filter((m) => m.id);
  const proposer = cleanPerson(proposedBy);
  const vote: SharedVote = {
    id: 'v_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
    meal,
    proposedBy: proposer,
    members: people.length ? people : [proposer],
    ballot: {},
    status: 'open',
    createdAt: new Date().toISOString(),
  };
  saveVote(vote);
  const notified = await notifyHousehold(proposer.id || undefined, {
    title: `${proposer.name} suggests dinner`,
    body: `${String(meal.title).slice(0, 80)}. Yes, or use a veto?`,
    tag: vote.id,
  });
  res.json({ ...voteStore, notified });
});

app.post('/api/vote/cast', async (req, res) => {
  const { voteId, memberId, memberName, decision, instant } = req.body || {};
  const current = voteStore.vote;
  if (!current || current.id !== voteId) return res.status(409).json({ error: 'That vote has closed', ...voteStore });
  if (decision !== 'yes' && decision !== 'no') return res.status(400).json({ error: 'Vote yes or no' });
  const id = String(memberId || '').slice(0, 60);
  if (!id) return res.status(400).json({ error: 'Who is voting?' });
  if (current.status !== 'open') return res.status(409).json({ error: 'Already decided', ...voteStore });

  const next = castVote(current, id, decision, { instant: Boolean(instant), memberName });
  saveVote(next);

  const voter = next.members.find((m) => m.id === id)?.name || 'Someone';
  const title = next.meal.title;
  const yes = Object.values(next.ballot).filter((v) => v === 'yes').length;
  const payload: PushPayload =
    next.status === 'agreed'
      ? { title: `Dinner's agreed: ${title}`, body: `${voter} said yes. Open the timeline to start cooking.`, tag: next.id }
      : next.status === 'vetoed'
      ? { title: `${voter} vetoed ${title}`, body: 'Spin again for something else.', tag: next.id }
      : {
          title: `${voter} said yes to ${title}`,
          body: `${yes} of ${majorityFor(next.members.length)} yes votes so far.`,
          tag: next.id,
        };
  const notified = await notifyHousehold(id, payload);
  res.json({ ...voteStore, notified });
});

app.post('/api/vote/clear', (_req, res) => {
  saveVote(null);
  res.json(voteStore);
});

// Live model calls must never leave the UI hanging: give up after GEMINI_TIMEOUT_MS
// per model and try the next one.
const GEMINI_TIMEOUT_MS = Number(process.env.GEMINI_TIMEOUT_MS) || 25000;
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

// The newest model is often overloaded (503) or slow, so try a reliable one
// first and fall back to a light, fast one. GEMINI_MODEL overrides the first.
const GEMINI_MODELS = Array.from(
  new Set([process.env.GEMINI_MODEL?.trim(), 'gemini-3.5-flash', 'gemini-3.1-flash-lite'].filter(Boolean) as string[])
);

async function generateJson(parts: any[], responseSchema: any): Promise<any> {
  let lastError: any = null;
  for (const model of GEMINI_MODELS) {
    try {
      const response = await withTimeout(
        ai!.models.generateContent({
          model,
          contents: { parts },
          config: {
            responseMimeType: 'application/json',
            responseSchema,
            // Cancel the underlying HTTP request too, so nothing lingers after we move on.
            abortSignal: AbortSignal.timeout(GEMINI_TIMEOUT_MS),
          },
        })
      );
      return JSON.parse(response.text || '{}');
    } catch (err: any) {
      lastError = err;
      console.warn(`Gemini ${model} failed:`, String(err?.message || err).slice(0, 200));
    }
  }
  throw lastError || new Error('No model available');
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
  if (type === 'snap-fridge' || type === 'snap-cupboard') {
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

// Multimodal Gemini Vision & Text API endpoint for fridge, cupboard, receipt and recipe scans
const ANALYZE_TYPES = ['snap-fridge', 'snap-cupboard', 'scan-receipt', 'recipe-photo', 'recipe-text'];

const inventorySchema = {
  type: Type.OBJECT,
  properties: {
    detectedItems: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          name: { type: Type.STRING },
          category: { type: Type.STRING },
          freshness: { type: Type.STRING, description: 'Must be "green", "amber", or "red"' },
          estimatedQuantity: { type: Type.STRING },
        },
        required: ['name', 'category', 'freshness', 'estimatedQuantity'],
      },
    },
  },
  required: ['detectedItems'],
};

app.post('/api/pantry/analyze', async (req, res) => {
  const { type, imageBase64, mimeType = 'image/jpeg', textPrompt, demo } = req.body || {};

  if (!type || !ANALYZE_TYPES.includes(type)) {
    return res.status(400).json({ error: `Unsupported analysis type: ${type}` });
  }
  if (!imageBase64 && !textPrompt) {
    return res.status(400).json({ error: 'Missing image or text prompt' });
  }

  // The "Try a sample" buttons never call the live model.
  if (demo === true) return res.json(getSimulatedVisionResponse(type, textPrompt));

  if (!ai) {
    // Never pretend to have read a real photo: say plainly that scanning isn't set up.
    if (imageBase64) {
      return res.status(503).json({
        error: 'Photo scanning isn’t switched on for this server yet (it needs a Gemini API key).',
      });
    }
    return res.json(getSimulatedVisionResponse(type, textPrompt));
  }

  const cleanBase64 = imageBase64 ? String(imageBase64).replace(/^data:[^;]+;base64,/, '') : '';
  const parts: any[] = cleanBase64 ? [{ inlineData: { mimeType, data: cleanBase64 } }] : [];

  try {
    if (type === 'snap-fridge' || type === 'snap-cupboard') {
      const prompt =
        type === 'snap-fridge'
          ? `You are the inventory scanner for a UK kitchen. Look at this photo of the inside of a fridge. Identify every distinct food item, ingredient, vegetable, meat, dairy product and condiment you can see. Ignore packaging you can't identify.
For each item:
- name: clear UK English ingredient name (e.g. "Mature Cheddar", "Courgettes", "Semi-Skimmed Milk", "Greek Style Yoghurt", "Free-Range Eggs", "Chestnut Mushrooms").
- category: one of ["Produce", "Dairy & Eggs", "Meat & Fish", "Sauces & Condiments", "Bakery", "Drinks", "Other"].
- freshness: "red" if it looks like it needs eating today or tomorrow, "amber" for normal opened fridge items, "green" for fresh or unopened.
- estimatedQuantity: rough quantity (e.g. "1/2 block", "3", "1 bottle", "about 200g").`
          : `You are the inventory scanner for a UK kitchen. Look at this photo of a store cupboard, larder or shelf. Identify every distinct tin, jar, packet, bottle, sauce, spice and dry good you can read or recognise.
For each item:
- name: clear UK English product name without brand where possible (e.g. "Chopped Tomatoes", "Coconut Milk", "Basmati Rice", "Soy Sauce", "Smoked Paprika", "Chickpeas").
- category: one of ["Tins & jars", "Sauces & condiments", "Pasta, rice & grains", "Herbs & spices", "Baking", "Oils & vinegars", "Other"].
- freshness: always "green".
- estimatedQuantity: rough quantity (e.g. "2 tins", "1 jar", "half a bag").`;
      parts.push({ text: prompt });
      const parsed = await generateJson(parts, inventorySchema);
      return res.json({ detectedItems: Array.isArray(parsed.detectedItems) ? parsed.detectedItems : [] });
    }

    if (type === 'scan-receipt') {
      parts.push({
        text: `You are a UK supermarket receipt scanner (e.g. Tesco, Sainsbury's, Marks & Spencer, Waitrose, Aldi, Lidl). Scan this receipt image and extract all grocery and food line items purchased. Ignore non-food items (like carrier bags, cleaning products, toilet roll) or total line rows.
Extract:
- name: cleaned-up ingredient/food item name (e.g., "Free-Range Chicken Thighs 600g", "British Maris Piper Potatoes", "Tinned Chopped Tomatoes").
- category: one of ["Produce", "Dairy & Eggs", "Meat & Fish", "Cupboard & Grains", "Sauces & Condiments", "Bakery", "Snacks"].
- quantity: quantity or weight string.
- price: approximate price with £ symbol if visible, or "N/A".`,
      });
      const parsed = await generateJson(parts, {
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
      });
      return res.json({ ...parsed, items: Array.isArray(parsed.items) ? parsed.items : [] });
    }

    // recipe-photo / recipe-text
    parts.push({
      text: `You are creating a structured Meal Card for "Dinner Spinner", a British dinner decider game.
Analyze the uploaded photo (which may be a photo of a plated dish, a recipe book page, or hand-written recipe card) or the user's description: "${String(textPrompt || '').slice(0, 500)}".
Extract a complete, appetizing UK dinner recipe.
Fields:
- title: clear, punchy UK dinner title.
- description: 1-2 sentence appetizing summary.
- cuisine: e.g. "British", "Italian", "Indian", "Mexican", "Chinese", "Thai", "Mediterranean", "American".
- timeStake: must be exactly one of ["20m", "30m", "60m", "all-day"].
- effort: must be exactly one of ["one-pot", "standard", "chef-mode"].
- ingredients: list of key ingredients (strings).
- prepSteps: 4 to 6 chronological cooking milestones with estimated offset in minutes before eating time (e.g., ["Preheat oven to 200°C (-35m)", "Chop potatoes and parboil (-30m)", "Rest and serve (-0m)"]).
- tags: array of tags e.g. ["Comfort Food", "Kid Friendly", "Vegetarian", "Quick Midweek"].`,
    });
    const meal = await generateJson(parts, {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        description: { type: Type.STRING },
        cuisine: { type: Type.STRING },
        timeStake: { type: Type.STRING, description: 'Must be "20m", "30m", "60m", or "all-day"' },
        effort: { type: Type.STRING, description: 'Must be "one-pot", "standard", or "chef-mode"' },
        ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
        prepSteps: { type: Type.ARRAY, items: { type: Type.STRING } },
        tags: { type: Type.ARRAY, items: { type: Type.STRING } },
      },
      required: ['title', 'description', 'cuisine', 'timeStake', 'effort', 'ingredients', 'prepSteps'],
    });
    return res.json({ meal });
  } catch (error: any) {
    console.warn('Gemini scan failed on every model:', String(error?.message || error).slice(0, 200));
    return res.status(502).json({
      error: 'The scanner is busy right now and couldn’t read that. Give it a minute and try again.',
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
    app.use(express.static(distPath));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Dinner Spinner server listening on http://0.0.0.0:${PORT}`);
  });
}

if (process.env.NODE_ENV !== 'test') {
  startServer().catch((err) => {
    console.error('Server startup error:', err);
  });
}

export { app };
