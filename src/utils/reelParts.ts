import type { Meal, ReelComboItem } from '../types';
import { COMBO_REELS } from '../data/initialData';

/** What the Base and Sauce reels show when the Main reel has landed on one of our own whole recipes. */
export const JACKPOT_FILL = 'Part of the recipe';
const STAR = '★ ';

type Kind = 'carb' | 'protein' | 'sauce' | 'veg';

const WORDS: Record<Kind, RegExp> = {
  sauce: /\b(sauce|paste|curry|pesto|passata|gravy|salsa|marinade|dressing|ketchup|mayo|mayonnaise|chutney|korma|tikka|teriyaki)\b/i,
  carb: /\b(pasta|spaghetti|penne|rigatoni|fusilli|tagliatelle|linguine|macaroni|rice|noodles?|potatoes?|mash|chips|bread|tortillas?|wraps?|couscous|gnocchi|naan|bun|buns|quinoa|bulgur|pitta|baguette)\b/i,
  protein: /\b(chicken|beef|mince|pork|lamb|salmon|cod|haddock|tuna|fish|prawns?|shrimp|sausages?|bacon|ham|chorizo|halloumi|tofu|tempeh|turkey|steak|duck|paneer|chickpeas|lentils|eggs?)\b/i,
  veg: /\b(broccoli|carrots?|peas|beans|peppers?|courgettes?|spinach|cabbage|sweetcorn|corn|aubergine|mushrooms?|leeks?|kale|cauliflower|asparagus|onions?|tomatoes|squash|pak choi|sprouts|celery)\b/i,
};

/** Order matters: "pasta sauce" is a sauce, "chicken stock" is not the main. */
const ORDER: Kind[] = ['sauce', 'carb', 'protein', 'veg'];

/** "500g chicken thighs, diced" becomes "Chicken thighs". */
export function cleanIngredient(raw: string): string {
  let s = raw
    .replace(/\(.*?\)/g, ' ')
    .split(',')[0]
    .replace(/^\s*[\d½¼¾⅓⅔.\/\-–\s]+(g|kg|ml|l|litres?|tsp|tbsp|tins?|cans?|cloves?|pinch|handful|slices?|oz|lb|x)?\b\.?\s*/i, '')
    .replace(/^(an?\s+)?(handful|pinch|splash|knob|bunch|dash|drizzle|glug)\s+of\s+/i, '')
    .replace(/^((of|a|an|the|some|fresh|large|small|medium|good|big)\s+)+/i, '')
    .replace(/\s+/g, ' ')
    .trim();
  if (!s) return '';
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s.length > 28 ? s.slice(0, 27).trimEnd() + '…' : s;
}

export function kindOf(label: string): Kind | null {
  for (const k of ORDER) if (WORDS[k].test(label)) return k;
  return null;
}

/** Recipes the household saved themselves (not the starter set or the World Kitchen). */
export const isSavedRecipe = (m: Meal) => m.source === 'own' || m.source === 'scanned' || m.source === 'idea';

export interface ReelExtras {
  /** Parts pulled out of saved recipes, per reel position (Base, Main, Sauce, Veg). */
  parts: ReelComboItem[][];
  /** Whole saved recipes that can land on the Main reel. */
  dishes: (ReelComboItem & { recipeId: string })[];
}

const PER_KIND_CAP = 12;

/** Works out what saved recipes add to the 3 and 4 reel spinner. `allowed` lets the caller drop clashing ingredients. */
export function reelExtras(meals: Meal[], allowed: (label: string, meal: Meal) => boolean = () => true): ReelExtras {
  const slot: Record<Kind, number> = { carb: 0, protein: 1, sauce: 2, veg: 3 };
  const parts: ReelComboItem[][] = [[], [], [], []];
  const seen = new Set<string>();
  const dishes: ReelExtras['dishes'] = [];
  for (const meal of meals.filter(isSavedRecipe)) {
    if (allowed(meal.title, meal) && meal.ingredients.every((i) => allowed(i, meal))) {
      dishes.push({ id: `own_dish_${meal.id}`, label: STAR + meal.title, category: 'Our recipe', icon: '⭐', recipeId: meal.id });
    }
    const taken = new Set<Kind>();
    for (const ing of meal.ingredients) {
      const label = cleanIngredient(ing);
      const kind = label ? kindOf(label) : null;
      if (!kind || taken.has(kind) || !allowed(label, meal)) continue;
      const key = kind + ':' + label.toLowerCase();
      if (seen.has(key) || parts[slot[kind]].length >= PER_KIND_CAP) continue;
      seen.add(key);
      taken.add(kind);
      parts[slot[kind]].push({ id: `own_${meal.id}_${kind}`, label, category: 'Ours' });
    }
  }
  return { parts, dishes };
}

export type ComboMode = '3-reel' | '4-reel' | 'sunday';

/** The reels for a mode, with saved-recipe parts added and our whole dishes on the Main reel. Sunday stays as it is. */
export function buildReels(mode: ComboMode, extras: ReelExtras): ReelComboItem[][] {
  const base = COMBO_REELS[mode];
  if (mode === 'sunday') return base;
  const have = new Set(base.flat().map((i) => i.label.toLowerCase()));
  return base.map((list, i) => {
    const mine = extras.parts[i].filter((p) => !have.has(p.label.toLowerCase()));
    return [...list, ...mine, ...(i === 1 ? extras.dishes : [])];
  });
}

/** The saved recipe a Main-reel label stands for, if it is one of our whole dishes. */
export function jackpotRecipeId(label: string | undefined, extras: ReelExtras): string | null {
  if (!label) return null;
  return extras.dishes.find((d) => d.label === label)?.recipeId ?? null;
}
