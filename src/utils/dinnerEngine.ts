import {
  Meal,
  TimeStake,
  EffortLevel,
  MachineMode,
  PantryItem,
  PantryMatchInfo,
  ReverseTimerStep,
} from '../types';
import { mentionsAny } from './avoid';
import { DietId, mealFitsDiets } from './diets';

/**
 * Returns the meal as the household actually cooks it: the original recipe plus
 * any tweaks (extra ingredients and steps). The stored recipe is never modified.
 */
export function withTweaks(meal: Meal): Meal {
  const t = meal.tweaks;
  if (!t || (t.extraIngredients.length === 0 && t.extraSteps.length === 0)) return meal;
  return {
    ...meal,
    ingredients: [...meal.ingredients, ...t.extraIngredients],
    prepSteps: [
      ...meal.prepSteps,
      ...t.extraSteps.map((s) => `${s.text} (-${Math.max(0, Math.round(s.minutesBefore))}m)`),
    ],
  };
}

/**
 * Checks if a meal was cooked within the last 4 days (Cooling-off rule).
 */
export function isMealCoolingOff(meal: Meal, nowMs: number = Date.now()): boolean {
  if (!meal.lastCookedDate) return false;
  const cookedMs = new Date(meal.lastCookedDate).getTime();
  if (Number.isNaN(cookedMs)) return false;
  const diffDays = (nowMs - cookedMs) / (1000 * 60 * 60 * 24);
  return diffDays >= 0 && diffDays < 4;
}

/**
 * Returns whole days since last cooked if cooling off (< 4 days), otherwise null.
 */
export function getMealCoolingOffDays(meal: Meal, nowMs: number = Date.now()): number | null {
  if (!meal.lastCookedDate) return null;
  const cookedMs = new Date(meal.lastCookedDate).getTime();
  if (Number.isNaN(cookedMs)) return null;
  const diffDays = Math.floor((nowMs - cookedMs) / (1000 * 60 * 60 * 24));
  return diffDays >= 0 && diffDays < 4 ? diffDays : null;
}

/**
 * Calculates how well a meal's ingredients match current Pantry + Staples stock,
 * and identifies any Red ("Use Next") items it helps rescue.
 */
export function calculateMealPantryMatch(
  rawMeal: Meal,
  pantry: PantryItem[],
  staples: string[]
): PantryMatchInfo {
  const meal = withTweaks(rawMeal);
  const totalCount = meal.ingredients.length;
  if (totalCount === 0) {
    return {
      matchedCount: 0,
      totalCount: 0,
      matchPercentage: 100,
      redMatchedItems: [],
      missingItems: [],
    };
  }

  const pantryLower = pantry.map((p) => ({
    original: p.name,
    lower: p.name.toLowerCase(),
    freshness: p.freshness,
  }));
  const staplesLower = staples.map((s) => s.toLowerCase());

  let matchedCount = 0;
  const redMatchedSet = new Set<string>();
  const missingItems: string[] = [];

  for (const ing of meal.ingredients) {
    const ingLower = ing.toLowerCase();
    const matchedPantry = pantryLower.filter(
      (p) => p.lower.includes(ingLower) || ingLower.includes(p.lower)
    );
    const matchedStaple = staplesLower.some(
      (s) => s.includes(ingLower) || ingLower.includes(s)
    );

    if (matchedPantry.length > 0 || matchedStaple) {
      matchedCount += 1;
      for (const mp of matchedPantry) {
        if (mp.freshness === 'red') {
          redMatchedSet.add(mp.original);
        }
      }
    } else {
      missingItems.push(ing);
    }
  }

  return {
    matchedCount,
    totalCount,
    matchPercentage: Math.round((matchedCount / totalCount) * 100),
    redMatchedItems: Array.from(redMatchedSet),
    missingItems,
  };
}

const TIME_RANK: Record<TimeStake, number> = { '20m': 0, '30m': 1, '60m': 2, 'all-day': 3 };
const EFFORT_RANK: Record<EffortLevel, number> = { 'one-pot': 0, standard: 1, 'chef-mode': 2 };

export interface EligiblePoolResult {
  pool: Meal[];
  exactMatchCount: number;
  timeStakeMatchCount: number;
  isExactEffortMatch: boolean;
}

/**
 * Filters meals that fit within the chosen time and effort ("up to"), excluding Banned Ingredients.
 * Gracefully falls back if exact (timeStake + effort) pool is empty while preserving banned exclusions.
 */
export function filterEligibleMeals(
  meals: Meal[],
  timeStake: TimeStake | 'any',
  effort: EffortLevel | 'any',
  bannedIngredients: string[],
  diets: DietId[] = []
): EligiblePoolResult {
  // Dietary preferences are strict: a vegan household never falls back to a meat dish.
  if (diets.length > 0) {
    meals = meals.filter((m) => mealFitsDiets(m.ingredients, diets));
    if (meals.length === 0) {
      return { pool: [], exactMatchCount: 0, timeStakeMatchCount: 0, isExactEffortMatch: false };
    }
  }
  const nonBannedMeals = meals.filter(
    (meal) => !mentionsAny([meal.title, ...withTweaks(meal).ingredients], bannedIngredients)
  );

  const baseMeals = nonBannedMeals.length > 0 ? nonBannedMeals : meals;

  // "Up to": 30 min also allows 20 min dishes, and Standard also allows one-pot dishes. "Any" is no limit.
  const withinLimits = baseMeals.filter(
    (m) =>
      (timeStake === 'any' || TIME_RANK[m.timeStake] <= TIME_RANK[timeStake]) &&
      (effort === 'any' || EFFORT_RANK[m.effort] <= EFFORT_RANK[effort])
  );
  if (withinLimits.length > 0) {
    return {
      pool: withinLimits,
      exactMatchCount: withinLimits.length,
      timeStakeMatchCount: withinLimits.length,
      isExactEffortMatch: true,
    };
  }

  // Nothing fits (everything is longer or fussier than asked): fall back to the closest matches.
  const timeMatched = timeStake === 'any' ? baseMeals : baseMeals.filter((m) => m.timeStake === timeStake);
  const exactMatched = effort === 'any' ? timeMatched : timeMatched.filter((m) => m.effort === effort);

  if (exactMatched.length > 0) {
    return {
      pool: exactMatched,
      exactMatchCount: exactMatched.length,
      timeStakeMatchCount: timeMatched.length,
      isExactEffortMatch: true,
    };
  }

  if (timeMatched.length > 0) {
    return {
      pool: timeMatched,
      exactMatchCount: 0,
      timeStakeMatchCount: timeMatched.length,
      isExactEffortMatch: false,
    };
  }

  const effortOnlyMatched = baseMeals.filter((m) => m.effort === effort);
  if (effortOnlyMatched.length > 0) {
    return {
      pool: effortOnlyMatched,
      exactMatchCount: 0,
      timeStakeMatchCount: 0,
      isExactEffortMatch: false,
    };
  }

  return {
    pool: baseMeals,
    exactMatchCount: 0,
    timeStakeMatchCount: 0,
    isExactEffortMatch: false,
  };
}

/**
 * Selects a meal using weighted probabilities:
 * - Cooling-off penalty (<4 days): 0.15x
 * - Clearout boost (uses Red pantry items): 4.5x
 * - Effort match boost (when in fallback pool): 2.5x
 * - Favorite boost: 1.3x
 */
export function selectWeightedMeal(
  pool: Meal[],
  pantry: PantryItem[],
  clearoutActive: boolean,
  effort: EffortLevel | 'any',
  nowMs: number = Date.now(),
  randomFn: () => number = Math.random
): Meal {
  const redPantryItems = pantry
    .filter((p) => p.freshness === 'red')
    .map((p) => p.name.toLowerCase());

  const weightedMeals = pool.map((meal) => {
    let weight = 1.0;

    if (isMealCoolingOff(meal, nowMs)) {
      weight *= 0.15;
    }

    if (meal.effort === effort) {
      weight *= 2.0;
    }

    if (clearoutActive && redPantryItems.length > 0) {
      const hasRedIngredient = meal.ingredients.some((ing) =>
        redPantryItems.some(
          (redItem) =>
            ing.toLowerCase().includes(redItem) ||
            redItem.includes(ing.toLowerCase())
        )
      );
      if (hasRedIngredient) {
        weight *= 4.5;
      }
    }

    if (meal.isFavorite) {
      weight *= 1.3;
    }

    return { meal, weight };
  });

  const totalWeight = weightedMeals.reduce((acc, curr) => acc + curr.weight, 0);
  let randomVal = randomFn() * totalWeight;
  let chosen = pool[0];

  for (const item of weightedMeals) {
    if (randomVal <= item.weight) {
      chosen = item.meal;
      break;
    }
    randomVal -= item.weight;
  }

  return chosen;
}

/**
 * Synthesizes an accurate, cookable Meal Card from 3-reel, 4-reel or Sunday Roast combinations.
 * Used both after a spin and immediately after a reel NUDGE so the card is always in sync.
 */
export function buildComboMeal(
  mode: MachineMode,
  reels: string[],
  timeStake: TimeStake,
  effort: EffortLevel
): Meal {
  if (mode === 'sunday') {
    const meat = reels[0] || 'Dry-Aged Roast Beef';
    const potatoes = reels[1] || 'Goose Fat Crispy Roasties';
    const starSide = reels[2] || 'Giant Yorkshire Puddings';
    const vegGravy = reels[3] || 'Charred Cabbage & Rich Beef Gravy';

    return {
      id: `sunday_${meat}_${potatoes}_${starSide}`.replace(/\s+/g, '_').toLowerCase(),
      title: `${meat} with ${potatoes} & ${starSide}`,
      description: `The ultimate Sunday Roast jackpot: ${meat}, golden ${potatoes}, ${starSide}, and ${vegGravy}.`,
      cuisine: 'British',
      timeStake: 'all-day',
      effort: 'chef-mode',
      ingredients: [
        meat,
        potatoes,
        starSide,
        vegGravy,
        'Maris Piper Potatoes',
        'Fresh Rosemary & Thyme',
        'Maldon Sea Salt',
        'Rich Stock & Wine',
      ],
      prepSteps: [
        `Bring ${meat} to room temperature and season generously (-120m)`,
        `Preheat oven to 200°C and parboil potatoes for ${potatoes} (-85m)`,
        `Roast ${meat} and baste with herb butter (-70m)`,
        `Toss ${potatoes} in hot fat and roast until glass-crisp (-50m)`,
        `Rest ${meat} under foil while baking ${starSide} (-25m)`,
        `Finish ${vegGravy}, carve at the table, and serve (-0m)`,
      ],
      rating: 0,
      isFavorite: false,
      lastCookedDate: null,
      cookCount: 0,
      tags: ['Sunday Jackpot', '4-Reel Custom Roast', 'British Heritage'],
      servings: 4,
    };
  }

  // 3-Reel and 4-Reel Builder Modes
  const carb = reels[0] || 'Rigatoni Pasta';
  const protein = reels[1] || 'Free-Range Chicken';
  const sauce = reels[2] || 'Spicy Arrabbiata';
  const veg = mode === '4-reel' ? reels[3] || 'Garlic Green Beans' : null;

  const inferredCuisine = sauce.toLowerCase().includes('tikka')
    ? 'Indian'
    : sauce.toLowerCase().includes('teriyaki')
    ? 'Chinese'
    : sauce.toLowerCase().includes('thai')
    ? 'Thai'
    : sauce.toLowerCase().includes('chipotle')
    ? 'Mexican'
    : sauce.toLowerCase().includes('arrabbiata') || carb.toLowerCase().includes('pasta')
    ? 'Italian'
    : 'British';

  return {
    id: `${veg ? 'combo4' : 'combo'}_${carb}_${protein}_${sauce}${veg ? `_${veg}` : ''}`.replace(/\s+/g, '_').toLowerCase(),
    title: veg ? `${protein} with ${sauce}` : `${protein} with ${sauce} & ${carb}`,
    description: veg
      ? `Served with ${carb} and ${veg}. Tender ${protein} glazed in ${sauce}.`
      : `Custom 3-reel creation: tender ${protein} glazed in ${sauce}, served piping hot with ${carb}.`,
    cuisine: inferredCuisine,
    timeStake,
    effort,
    ingredients: [protein, carb, sauce, ...(veg ? [veg] : []), 'Garlic Bulbs', 'Olive Oil', 'Maldon Sea Salt'],
    prepSteps: [
      `Prep ingredients and start cooking ${carb} (-22m)`,
      ...(veg ? [`Get ${veg} cooking alongside (-16m)`] : []),
      `Sear ${protein} in a hot pan until golden brown (-15m)`,
      `Pour in ${sauce} and simmer gently to infuse flavours (-8m)`,
      `Combine with ${carb}, garnish, and plate up (-0m)`,
    ],
    rating: 0,
    isFavorite: false,
    lastCookedDate: null,
    cookCount: 0,
    tags: [veg ? '4-Reel Custom Combo' : '3-Reel Custom Combo', inferredCuisine],
    servings: 4,
  };
}

/**
 * Generates reverse countdown prep steps from a target HH:MM eating time.
 */
export function buildReverseTimerSteps(targetTime: string, rawMeal: Meal): ReverseTimerStep[] {
  const meal = withTweaks(rawMeal);
  if (!targetTime || !targetTime.includes(':')) return [];
  const [targetHour, targetMin] = targetTime.split(':').map(Number);
  if (Number.isNaN(targetHour) || Number.isNaN(targetMin)) return [];

  const targetDate = new Date();
  targetDate.setHours(targetHour, targetMin, 0, 0);

  const steps = meal.prepSteps.map((step, idx) => {
    const match = step.match(/-(\d+)m/);
    const offset = match ? Number(match[1]) : (meal.prepSteps.length - idx) * 7;
    const stepTime = new Date(targetDate.getTime() - offset * 60000);
    const hours = String(stepTime.getHours()).padStart(2, '0');
    const minutes = String(stepTime.getMinutes()).padStart(2, '0');
    const timeString = `${hours}:${minutes}`;

    return {
      id: `step_${idx}`,
      timeString,
      minuteOffset: offset,
      label: step.replace(/\s*\(-\d+m\)/, ''),
      done: false,
    };
  });
  // Tweaked steps can land anywhere in the evening, so keep the timeline in time order.
  return steps
    .map((s, i) => ({ s, i }))
    .sort((a, b) => b.s.minuteOffset - a.s.minuteOffset || a.i - b.i)
    .map(({ s }) => s);
}

