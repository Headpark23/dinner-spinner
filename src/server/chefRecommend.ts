import { Type } from '@google/genai';
import type { ChefRecommendation } from '../types';
import {
  buildChefPrompt,
  normalizeChefRecommendations,
  type ChefRecommendRequest,
} from '../utils/chefMaker';

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

export function createChefRecommender(deps: {
  generate: (request: any) => Promise<{ text?: string }>;
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

    return { recommendations: normalized };
  };
}
