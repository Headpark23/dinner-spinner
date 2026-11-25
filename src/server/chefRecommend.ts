import { Type } from '@google/genai';
import type { ChefRecommendation } from '../types';
import {
  buildChefPrompt,
  normalizeChefRecommendations,
  type ChefRecommendRequest,
} from '../utils/chefMaker';
import type { FoundPhoto } from './photoSearch';

export const CHEF_RESPONSE_SCHEMA = {
  type: Type.OBJECT,
  properties: {
    recommendations: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          description: { type: Type.STRING },
          cuisine: { type: Type.STRING },
          chefInspiration: { type: Type.STRING },
          whyItWorks: { type: Type.STRING },
          chefTip: { type: Type.STRING },
          timeStake: { type: Type.STRING, description: 'Must be "20m", "30m", "60m", or "all-day"' },
          effort: { type: Type.STRING, description: 'Must be "one-pot", "standard", or "chef-mode"' },
          servings: { type: Type.INTEGER },
          photoQuery: { type: Type.STRING },
          ingredients: { type: Type.ARRAY, items: { type: Type.STRING } },
          usesFromKitchen: { type: Type.ARRAY, items: { type: Type.STRING } },
          rescues: { type: Type.ARRAY, items: { type: Type.STRING } },
          optionalExtras: { type: Type.ARRAY, items: { type: Type.STRING } },
          tags: { type: Type.ARRAY, items: { type: Type.STRING } },
          steps: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                instruction: { type: Type.STRING },
                minutesBefore: { type: Type.INTEGER },
                visualCue: { type: Type.STRING },
                photoQuery: { type: Type.STRING },
              },
              required: ['title', 'instruction', 'minutesBefore'],
            },
          },
        },
        required: [
          'title',
          'description',
          'cuisine',
          'chefInspiration',
          'whyItWorks',
          'chefTip',
          'timeStake',
          'effort',
          'ingredients',
          'usesFromKitchen',
          'steps',
        ],
      },
    },
  },
  required: ['recommendations'],
};

const withTimeout = async <T>(p: Promise<T>, ms: number, fallback: T): Promise<T> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      p,
      new Promise<T>((resolve) => {
        timer = setTimeout(() => resolve(fallback), ms);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
};

export function createChefRecommender(deps: {
  generate: (request: any) => Promise<{ text?: string }>;
  findPhoto: (query: string) => Promise<FoundPhoto | null>;
}) {
  return async function recommend(req: ChefRecommendRequest): Promise<{
    recommendations: ChefRecommendation[];
  }> {
    const prompt = buildChefPrompt(req);
    const response = await deps.generate({
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: 'application/json',
        responseSchema: CHEF_RESPONSE_SCHEMA,
      },
    });

    const parsed = JSON.parse(response.text || '{"recommendations":[]}');
    const rawRecs: any[] = Array.isArray(parsed?.recommendations) ? parsed.recommendations : [];
    const redNames = (req.fridge || []).filter((f) => f.freshness === 'red').map((f) => f.name);
    const normalized = normalizeChefRecommendations(rawRecs, redNames, req.servings || 4);

    // Enrich hero dish photos and step stage photos in parallel with a tight time budget.
    const cache = new Map<string, Promise<FoundPhoto | null>>();
    const lookup = (query: string): Promise<FoundPhoto | null> => {
      const clean = query.trim();
      if (!clean) return Promise.resolve(null);
      const key = clean.toLowerCase();
      if (!cache.has(key)) {
        cache.set(
          key,
          withTimeout(
            deps.findPhoto(clean).catch(() => null),
            2400,
            null
          )
        );
      }
      return cache.get(key)!;
    };

    await withTimeout(
      Promise.all(
        normalized.map(async (rec, idx) => {
          const rawDishQuery = typeof rawRecs[idx]?.photoQuery === 'string' ? rawRecs[idx].photoQuery : '';
          const hero = (rawDishQuery ? await lookup(rawDishQuery) : null) || (await lookup(rec.title));
          if (hero) {
            rec.imageUrl = hero.url;
            rec.photoCredit = hero.credit;
          }

          // Enrich up to 2 key step photos per dish so instructions have visual cues without blowing serverless time.
          await Promise.all(
            rec.steps.slice(0, 2).map(async (step) => {
              if (!step.photoQuery) return;
              const found = await lookup(step.photoQuery);
              if (found) {
                step.imageUrl = found.url;
                step.photoCredit = found.credit;
              }
            })
          );
        })
      ),
      3000,
      []
    );

    return { recommendations: normalized };
  };
}
