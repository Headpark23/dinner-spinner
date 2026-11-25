import type { Meal, ReelComboItem } from '../types';
import { COMBO_REELS } from '../data/initialData';

type Kind = 'carb' | 'protein' | 'sauce' | 'veg';

const WORDS: Record<Kind, RegExp> = {
  sauce: /\b(sauce|paste|curry|pesto|passata|gravy|salsa|marinade|dressing|ketchup|mayo|mayonnaise|chutney|korma|tikka|teriyaki|glaze|harissa)\b/i,
  carb: /\b(pasta|spaghetti|penne|rigatoni|fusilli|tagliatelle|linguine|macaroni|orzo|rice|noodles?|potatoes?|mash|chips|bread|flatbreads?|tortillas?|wraps?|couscous|gnocchi|naan|bun|buns|quinoa|bulgur|pitta|baguette)\b/i,
  protein: /\b(chicken|beef|mince|pork|lamb|salmon|cod|haddock|tuna|fish|prawns?|shrimp|sausages?|bacon|ham|chorizo|halloumi|tofu|tempeh|turkey|steak|duck|paneer|chickpeas|lentils|eggs?|meatballs?)\b/i,
  veg: /\b(broccoli|carrots?|peas|beans|peppers?|courgettes?|spinach|cabbage|sweetcorn|corn|aubergine|mushrooms?|leeks?|kale|cauliflower|asparagus|onions?|tomatoes|squash|pak choi|sprouts|celery)\b/i,
};

/** Order matters: "pasta sauce" is a sauce, "chicken stock" is not the main. */
const ORDER: Kind[] = ['sauce', 'carb', 'protein', 'veg'];

/** Turns "2 x 400g tins chopped tomatoes" or "500g chicken thighs, diced" into "Chopped tomatoes" / "Chicken thighs". */
export function cleanIngredient(raw: string): string {
  let s = raw
    .replace(/^\s*[▢☐☑✓✔•·▪▫◦‣\-*–—]+\s*/u, '')
    .replace(/\(.*?\)/g, ' ')
    .split(',')[0];

  // Strip repeated leading quantities like "2 x 400g tins of " or "1½ tablespoons "
  for (let pass = 0; pass < 3; pass++) {
    const next = s
      .replace(
        /^\s*[\d½¼¾⅓⅔.\/\-–\s]+(g|kg|mg|ml|cl|l|litres?|liters?|tsp|tbsp|tablespoons?|teaspoons?|cups?|tins?|cans?|jars?|packets?|packs?|cloves?|pinche?s?|handfuls?|slices?|sprigs?|bunche?s?|oz|lbs?|x)?\b\.?\s*(of\s+)?/i,
        ''
      )
      .replace(/^(an?\s+)?(handful|pinch|splash|knob|bunch|dash|drizzle|glug|tin|can|jar|pack|packet)\s+of\s+/i, '')
      .replace(/^(?:tins?|cans?|jars?|packets?|packs?|cloves?|sprigs?|bunche?s?)\s+(?:of\s+)?/i, '')
      .replace(/^((of|a|an|the|some|fresh|large|small|medium|good|big|boneless|skinless|free-range|british)\s+)+/i, '');
    if (next === s) break;
    s = next;
  }

  s = s.replace(/\s+/g, ' ').trim();
  if (!s) return '';
  s = s.charAt(0).toUpperCase() + s.slice(1);
  return s.length > 28 ? s.slice(0, 27).trimEnd() + '…' : s;
}

export function kindOf(label: string): Kind | null {
  if (/\bstock\b/i.test(label)) return null;
  for (const k of ORDER) if (WORDS[k].test(label)) return k;
  return null;
}

/** Recipes the household saved themselves (not the starter set or the World Kitchen). */
export const isSavedRecipe = (m: Meal) => m.source === 'own' || m.source === 'scanned' || m.source === 'idea';

export interface ReelExtras {
  /** Ingredient parts pulled out of saved recipes, per reel position (Base, Main, Sauce, Veg). */
  parts: ReelComboItem[][];
}

const PER_KIND_CAP = 12;

/**
 * Extracts real Base, Main, Sauce and Veg parts from saved recipes so the 3-reel and 4-reel
 * plate-builders include the household's own ingredients without ever blanking reels out.
 */
export function reelExtras(meals: Meal[], allowed: (label: string, meal: Meal) => boolean = () => true): ReelExtras {
  const slot: Record<Kind, number> = { carb: 0, protein: 1, sauce: 2, veg: 3 };
  const parts: ReelComboItem[][] = [[], [], [], []];
  const seen = new Set<string>();
  for (const meal of meals.filter(isSavedRecipe)) {
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
  return { parts };
}

export type ComboMode = '3-reel' | '4-reel' | 'sunday';

/** The reels for a mode, with saved-recipe ingredient parts added to their matching reel. Sunday stays untouched. */
export function buildReels(mode: ComboMode, extras: ReelExtras): ReelComboItem[][] {
  const base = COMBO_REELS[mode];
  if (mode === 'sunday') return base;
  const have = new Set(base.flat().map((i) => i.label.toLowerCase()));
  return base.map((list, i) => {
    const mine = extras.parts[i].filter((p) => !have.has(p.label.toLowerCase()));
    return [...list, ...mine];
  });
}
