import type { ChefRecommendation } from '../types';
import {
  buildChefPrompt,
  normalizeChefRecommendations,
  type ChefRecommendRequest,
} from '../utils/chefMaker';

function parseJsonLenient(raw: string): any {
  const trimmed = raw
    .trim()
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();
  if (!trimmed) return {};
  return JSON.parse(trimmed);
}

export function createChefRecommender(deps: {
  generate: (request: any) => Promise<{ text?: string }>;
}) {
  return async function recommend(req: ChefRecommendRequest): Promise<{
    recommendations: ChefRecommendation[];
  }> {
    const prompt = buildChefPrompt(req);
    // Plain application/json without nested responseSchema grammar compilation saves ~3-5s on Gemini 3.x,
    // keeping serverless latency around ~5-6s (well inside Vercel Hobby's 10s limit).
    const response = await deps.generate({
      contents: { parts: [{ text: prompt }] },
      config: {
        responseMimeType: 'application/json',
      },
    });

    const parsed = parseJsonLenient(response.text || '{}');
    const rawRecs: any[] = Array.isArray(parsed)
      ? parsed
      : Array.isArray(parsed?.recommendations)
        ? parsed.recommendations
        : Array.isArray(parsed?.dishes)
          ? parsed.dishes
          : Array.isArray(parsed?.recipes)
            ? parsed.recipes
            : [];
    const redNames = (req.fridge || []).filter((f) => f.freshness === 'red').map((f) => f.name);
    const normalized = normalizeChefRecommendations(rawRecs, redNames, req.servings || 4);

    return { recommendations: normalized };
  };
}
