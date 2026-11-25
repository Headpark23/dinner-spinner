import type { ChefRecommendation, ChefStep, EffortLevel, Meal, MealSlot, TimeStake } from '../types';
import { cupboardCandidates } from './cupboard';
import type { DietId } from './diets';
import { resolveMealPhoto } from '../data/photos';

export type ChefStyle = 'any' | 'quick' | 'comfort' | 'chef-special' | 'healthy';

export interface ChefRecommendRequest {
  fridge: { name: string; freshness: 'green' | 'amber' | 'red'; quantity?: string }[];
  cupboard: string[];
  freezer: string[];
  staples: string[];
  focusIngredients?: string[];
  mealSlot?: MealSlot | 'any';
  style?: ChefStyle;
  diets?: DietId[];
  avoid?: string[];
  servings?: number;
  excludeTitles?: string[];
}

export const CHEF_STYLES: { id: ChefStyle; label: string }[] = [
  { id: 'any', label: 'Chef’s choice' },
  { id: 'quick', label: '20 min' },
  { id: 'chef-special', label: 'Restaurant style' },
  { id: 'comfort', label: 'Cosy comfort' },
  { id: 'healthy', label: 'Light & bright' },
];

const VALID_TIME: TimeStake[] = ['20m', '30m', '60m', 'all-day'];
const VALID_EFFORT: EffortLevel[] = ['one-pot', 'standard', 'chef-mode'];

const cleanStr = (v: unknown, max = 240): string =>
  typeof v === 'string' ? v.trim().slice(0, max) : '';

const cleanList = (v: unknown, maxItems = 24, maxLen = 120): string[] =>
  Array.isArray(v)
    ? v
        .map((x) => cleanStr(x, maxLen))
        .filter(Boolean)
        .slice(0, maxItems)
    : [];

export function buildChefPrompt(req: ChefRecommendRequest): string {
  const redItems = req.fridge.filter((f) => f.freshness === 'red').map((f) => f.name);
  const otherFridge = req.fridge.filter((f) => f.freshness !== 'red').map((f) => f.name);
  const servings = Math.max(1, Math.min(10, Number(req.servings) || 4));
  const slot = req.mealSlot && req.mealSlot !== 'any' ? req.mealSlot : 'dinner';
  const styleText: Record<ChefStyle, string> = {
    any: 'a varied trio — one quick weeknight favourite, one elevated chef-style dish, and one comforting crowd-pleaser',
    quick: 'fast, punchy 20-minute dishes with clever flavour shortcuts',
    'chef-special': 'elevated, restaurant-worthy dishes with proper chef techniques (pan sauces, caramelisation, bright finishes)',
    comfort: 'deeply comforting, warming home-cooked dishes',
    healthy: 'vibrant, fresh, lighter dishes with herbs, citrus, and crisp textures',
  };

  return `You are an acclaimed UK executive chef and recipe editor for "Dinner Spinner".
Your job: turn the household's ACTUAL kitchen inventory into 3 genuinely standout ${slot} recipes inspired by real top chefs (such as Yotam Ottolenghi, J. Kenji López-Alt, Nigella Lawson, Jamie Oliver, Rick Stein, Nadiya Hussain, Thomasina Miers, Gordon Ramsay, Samin Nosrat, Mob Kitchen, Dishoom, or classic French/Italian/Japanese bistros).

HOUSEHOLD INVENTORY:
- URGENT USE-NEXT FRIDGE ITEMS (prioritise rescuing these!): ${redItems.length ? redItems.join(', ') : 'None flagged'}
- OTHER FRIDGE ITEMS: ${otherFridge.length ? otherFridge.join(', ') : 'None listed'}
- STORE CUPBOARD (tins, jars, spices, grains): ${req.cupboard.length ? req.cupboard.join(', ') : 'None listed'}
- FREEZER: ${req.freezer.length ? req.freezer.join(', ') : 'None listed'}
- ALWAYS-HAVE STAPLES: ${req.staples.length ? req.staples.join(', ') : 'Salt, pepper, olive oil'}
${req.focusIngredients?.length ? `- MUST SPOTLIGHT THESE INGREDIENTS: ${req.focusIngredients.join(', ')}` : ''}

CONSTRAINTS:
- Servings: ${servings} people (include realistic UK metric quantities in the ingredients list, e.g. "400g chicken thighs", "2 cloves garlic, finely sliced").
- Style: ${styleText[req.style || 'any']}.
- Dietary requirements (STRICT — never violate): ${req.diets?.length ? req.diets.join(', ') : 'None'}.
- Never-eat ingredients (STRICT — never include): ${req.avoid?.length ? req.avoid.join(', ') : 'None'}.
${req.excludeTitles?.length ? `- Do NOT repeat any of these dishes: ${req.excludeTitles.join(', ')}.` : ''}

QUALITY RULES:
1. Build dishes primarily from the ingredients they ALREADY have. At most 1-2 small optional extras if it elevates the dish, clearly listed in optionalExtras.
2. Each dish must cite a genuine culinary inspiration in chefInspiration (e.g. "Yotam Ottolenghi-style charred veg & yoghurt", "Kenji López-Alt's crispy-skin pan technique", "Classic Roman trattoria method").
3. Give 4 to 6 crystal-clear chronological cooking steps in "steps". Each step needs:
   - title: short 2-5 word stage header (e.g. "Sear until deeply golden")
   - instruction: specific, actionable chef guidance with heat level, timing, and technique
   - minutesBefore: integer minutes before serving (descending to 0 for plating)
   - visualCue: what the cook should see/smell so they know it is right (e.g. "Edges crisp and golden, garlic fragrant not brown")
   - photoQuery: a clean 2-4 word food photography search phrase for this stage (e.g. "crispy pan seared chicken", "simmering tomato sauce pan", "plated pasta herbs")
4. Also provide a dish-level "photoQuery" (2-4 clean words of the finished dish, e.g. "shakshuka skillet eggs", "chicken piccata lemon") so we can fetch a real dish photo.
5. Use UK English (courgette, aubergine, coriander, spring onion, tin, hob).`;
}

export function normalizeChefRecommendations(
  rawList: unknown,
  redFridgeNames: string[],
  defaultServings = 4
): ChefRecommendation[] {
  if (!Array.isArray(rawList)) return [];
  const redLower = redFridgeNames.map((r) => r.toLowerCase());
  const out: ChefRecommendation[] = [];

  for (let i = 0; i < rawList.length && out.length < 3; i++) {
    const raw: any = rawList[i];
    if (!raw || typeof raw !== 'object') continue;
    const title = cleanStr(raw.title, 120);
    if (!title) continue;

    const timeStake: TimeStake = VALID_TIME.includes(raw.timeStake) ? raw.timeStake : '30m';
    const effort: EffortLevel = VALID_EFFORT.includes(raw.effort) ? raw.effort : 'standard';
    const ingredients = cleanList(raw.ingredients, 24, 120);
    const usesFromKitchen = cleanList(raw.usesFromKitchen, 20, 80);
    const optionalExtras = cleanList(raw.optionalExtras, 8, 80);
    const explicitRescues = cleanList(raw.rescues, 10, 80);
    const inferredRescues = usesFromKitchen.filter((u) =>
      redLower.some((r) => u.toLowerCase().includes(r) || r.includes(u.toLowerCase()))
    );
    const rescues = Array.from(new Set([...explicitRescues, ...inferredRescues]));

    const rawSteps: any[] = Array.isArray(raw.steps) ? raw.steps : [];
    const mappedSteps: (ChefStep | null)[] = rawSteps.map((s: any, idx: number): ChefStep | null => {
      if (!s || typeof s !== 'object') return null;
      const instruction = cleanStr(s.instruction || s.text, 400);
      if (!instruction) return null;
      const mins = Number.isFinite(Number(s.minutesBefore))
        ? Math.max(0, Math.min(360, Math.round(Number(s.minutesBefore))))
        : Math.max(0, (rawSteps.length - 1 - idx) * 6);
      return {
        title: cleanStr(s.title, 80) || `Step ${idx + 1}`,
        instruction,
        minutesBefore: mins,
        visualCue: cleanStr(s.visualCue, 160) || undefined,
        photoQuery: cleanStr(s.photoQuery, 80) || undefined,
        imageUrl: cleanStr(s.imageUrl, 500) || undefined,
        photoCredit: s.photoCredit && typeof s.photoCredit === 'object' ? s.photoCredit : undefined,
      };
    });
    const steps: ChefStep[] = mappedSteps
      .filter((x): x is ChefStep => Boolean(x))
      .sort((a, b) => b.minutesBefore - a.minutesBefore);

    if (steps.length === 0) continue;

    out.push({
      id: `chef_${Date.now().toString(36)}_${i}`,
      title,
      description: cleanStr(raw.description, 260) || `A chef-inspired dish crafted from your kitchen stock.`,
      cuisine: cleanStr(raw.cuisine, 40) || 'Modern British',
      chefInspiration: cleanStr(raw.chefInspiration, 120) || 'Chef’s kitchen technique',
      whyItWorks: cleanStr(raw.whyItWorks, 220) || 'Balances your fresh ingredients with cupboard depth.',
      chefTip: cleanStr(raw.chefTip, 220) || 'Taste right before serving and brighten with acid or flaky salt.',
      timeStake,
      effort,
      servings: Math.max(1, Math.min(10, Number(raw.servings) || defaultServings)),
      ingredients: ingredients.length ? ingredients : usesFromKitchen,
      usesFromKitchen: usesFromKitchen.length ? usesFromKitchen : ingredients.slice(0, 6),
      rescues,
      optionalExtras,
      steps,
      tags: cleanList(raw.tags, 6, 40),
      imageUrl: cleanStr(raw.imageUrl, 500) || undefined,
      photoCredit: raw.photoCredit && typeof raw.photoCredit === 'object' ? raw.photoCredit : undefined,
    });
  }

  return out;
}

/** Converts an AI Chef recommendation into a full Meal that can be saved to the household's Recipe Vault or voted on. */
export function chefRecipeToMeal(rec: ChefRecommendation): Omit<Meal, 'id' | 'rating' | 'cookCount' | 'lastCookedDate' | 'isFavorite'> {
  return {
    title: rec.title,
    description: `${rec.description}${rec.chefInspiration ? ` (${rec.chefInspiration})` : ''}`,
    cuisine: rec.cuisine,
    timeStake: rec.timeStake,
    effort: rec.effort,
    servings: rec.servings,
    ingredients: rec.ingredients,
    prepSteps: rec.steps.map((s) => `${s.title}: ${s.instruction} (-${s.minutesBefore}m)`),
    tags: Array.from(new Set(['AI Chef', ...rec.tags])).slice(0, 6),
    source: 'own',
    ...(rec.imageUrl ? { imageUrl: rec.imageUrl } : {}),
    ...(rec.photoCredit ? { photoCredit: rec.photoCredit } : {}),
  };
}

/**
 * Local fallback when Gemini AI is offline or not configured: turns top cupboard candidates
 * into rich ChefRecommendation objects with structured step cards and bundled photography.
 */
export function buildOfflineChefFallback(params: {
  meals: Meal[];
  pantry: { id: string; name: string; category: string; freshness: 'green' | 'amber' | 'red'; addedDate: string }[];
  inStock: string[];
  avoid: string[];
  diets: DietId[];
  servings: number;
  focusIngredients?: string[];
}): ChefRecommendation[] {
  const candidates = cupboardCandidates({
    meals: params.meals,
    pantry: params.pantry,
    staples: params.inStock,
    banned: params.avoid,
    diets: params.diets,
  });

  const focus = (params.focusIngredients || []).map((f) => f.toLowerCase());
  const ranked = [...candidates].sort((a, b) => {
    const aFocus = focus.filter((f) => a.uses.some((u) => u.toLowerCase().includes(f))).length;
    const bFocus = focus.filter((f) => b.uses.some((u) => u.toLowerCase().includes(f))).length;
    return bFocus - aFocus || b.rescues.length - a.rescues.length || b.uses.length - a.uses.length;
  });

  return ranked.slice(0, 3).map((c, idx) => {
    const photo = resolveMealPhoto(c.meal);
    const steps: ChefStep[] = c.meal.prepSteps.map((raw, sIdx) => {
      const m = raw.match(/\(-(\d+)m\)/);
      const mins = m ? Number(m[1]) : Math.max(0, (c.meal.prepSteps.length - 1 - sIdx) * 6);
      const text = raw.replace(/\s*\(-\d+m\)/, '').trim();
      return {
        title: sIdx === 0 ? 'Prep & mise en place' : sIdx === c.meal.prepSteps.length - 1 ? 'Finish & plate' : `Stage ${sIdx + 1}`,
        instruction: text,
        minutesBefore: mins,
        imageUrl: photo.url,
      };
    });

    return {
      id: `offline_chef_${c.meal.id}_${idx}`,
      title: c.meal.title,
      description: c.meal.description,
      cuisine: c.meal.cuisine,
      chefInspiration: c.kind === 'saved' ? 'From your kitchen rotation' : 'Classic pantry technique',
      whyItWorks:
        c.rescues.length > 0
          ? `Rescues ${c.rescues.join(', ')} right now without a trip to the shops.`
          : `Uses ${c.uses.length} ingredients you already have in stock.`,
      chefTip: 'Season in layers as you cook, and finish with a splash of acid or fresh herbs.',
      timeStake: c.meal.timeStake,
      effort: c.meal.effort,
      servings: params.servings,
      ingredients: c.meal.ingredients,
      usesFromKitchen: c.uses,
      rescues: c.rescues,
      optionalExtras: [],
      steps,
      tags: c.meal.tags || [c.meal.cuisine],
      imageUrl: photo.url,
      photoCredit: photo.credit,
    };
  });
}
