import express from 'express';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { GoogleGenAI, Type } from '@google/genai';

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
app.post('/api/pantry/analyze', async (req, res) => {
  try {
    const { type, imageBase64, mimeType = 'image/jpeg', textPrompt, demo } = req.body || {};

    if (!type || !['snap-fridge', 'scan-receipt', 'recipe-photo', 'recipe-text'].includes(type)) {
      return res.status(400).json({ error: `Unsupported analysis type: ${type}` });
    }

    if (!imageBase64 && !textPrompt) {
      return res.status(400).json({ error: 'Missing image or text prompt' });
    }

    // If no live Gemini API key is configured, return the smart simulation fallback seamlessly
    // Explicit demo requests (the "Try a sample" buttons) never call the live model.
    if (!ai || demo === true) {
      return res.json(getSimulatedVisionResponse(type, textPrompt));
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
    console.warn('Gemini API error, using kitchen simulation fallback:', error?.message);
    return res.json({
      ...getSimulatedVisionResponse(req.body?.type || 'recipe-photo', req.body?.textPrompt),
      fallbackReason: 'live-model-unavailable',
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
