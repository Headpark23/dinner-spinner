import type { Meal, PantryItem, FreezerItem, TimeStake, EffortLevel } from '../types';
import { mentionsAny } from './avoid';
import { calculateMealPantryMatch, isMealCoolingOff } from './dinnerEngine';
import { DietId, mealFitsDiets } from './diets';
import { inFreezer, oldestFirst, isEatSoon } from './freezer';

/**
 * "Cook from what we have": dinners that need nothing from the shop.
 *
 * Two sources are mixed:
 *  - saved recipes whose ingredients are all in the fridge or the staples cupboard, and
 *  - cupboard ideas: simple dishes built from whatever the household has (pasta and tinned
 *    tomatoes, eggs and rice, lentils, beans...), with leftovers and fridge items that need
 *    using up thrown in.
 * Matching is by ingredient names, so it is a good guess, not a promise. The recipe says so.
 */

export interface CupboardCandidate {
  kind: 'saved' | 'idea' | 'freezer';
  meal: Meal;
  /** For kind "freezer": the batch, and how many portions are left. */
  freezerId?: string;
  portionsLeft?: number;
  /** True when the batch has been frozen long enough that it should be eaten soon. */
  eatSoon?: boolean;
  /** What from the house this dinner uses. */
  uses: string[];
  /** Fridge items marked "use next" that it rescues. */
  rescues: string[];
}

interface StockItem {
  name: string;
  fridge: boolean;
  red: boolean;
}

const stockOf = (pantry: PantryItem[], staples: string[]): StockItem[] => [
  ...pantry.map((p) => ({ name: p.name, fridge: true, red: p.freshness === 'red' })),
  ...staples.map((s) => ({ name: s, fridge: false, red: false })),
];

/** First stock item whose name matches any of the patterns, preferring the fridge. */
const find = (stock: StockItem[], pattern: string, skip: Set<string>): StockItem | undefined => {
  const re = new RegExp('\\b(?:' + pattern + ')', 'i');
  // Stock cubes and the like flavour a dish; they are never the chicken or the veg.
  const flavouring = /stock|bouillon|gravy|cubes?/i;
  const wantsFlavouring = /stock|bouillon/.test(pattern);
  const hits = stock.filter((s) => re.test(s.name) && !skip.has(s.name) && (wantsFlavouring || !flavouring.test(s.name)));
  return hits.find((s) => s.red) || hits.find((s) => s.fridge) || hits[0];
};

type Step = (n: string[], w: (string | undefined)[]) => string;

interface Template {
  id: string;
  title: string;
  blurb: string;
  cuisine: string;
  time: TimeStake;
  effort: EffortLevel;
  /** Every group must be found. Each is a regex alternation of ingredient words. */
  needs: string[];
  /** Nice extras, used when found. */
  wants?: string[];
  /** Also chuck in up to two fridge items that need using up. */
  addIns?: boolean;
  steps: Step[];
}

const PASTA = 'pasta|spaghetti|linguine|penne|rigatoni|fusilli|macaroni|tagliatelle';
const CHEESE = 'cheese|cheddar|parmesan|mozzarella|feta|halloumi';
const OIL = 'oil';
const MEAT = 'chicken|beef|pork|ham|lamb|turkey|sausage|bacon|salmon';
const VEG = 'potato|carrot|onion|leek|squash|peppers?\\b|courgette|tomato|broccoli|spinach|cabbage|peas?\\b|sweetcorn|mushroom';

const TEMPLATES: Template[] = [
  {
    id: 'aglio',
    title: 'Garlic and oil spaghetti',
    blurb: 'The classic Roman midnight dinner: pasta, garlic and good oil. Done in 20 minutes.',
    cuisine: 'Italian',
    time: '20m',
    effort: 'one-pot',
    needs: [PASTA, 'garlic', OIL],
    wants: ['chilli|chili', 'parsley', CHEESE],
    steps: [
      (n) => `Boil ${n[0]} in well-salted water until just done (-20m)`,
      (n) => `Slice the ${n[1]} and warm it gently in ${n[2]} until pale gold (-8m)`,
      () => 'Toss the drained pasta in the pan with a splash of the pasta water (-3m)',
      (_n, w) => `Season and serve${w[0] ? ` with ${w[0]}` : ''}${w[2] ? ` and ${w[2]}` : ''} (-1m)`,
    ],
  },
  {
    id: 'tomato-pasta',
    title: 'Tomato pasta from the cupboard',
    blurb: 'Tinned tomatoes, pasta and whatever else wants using. Simple and always welcome.',
    cuisine: 'Italian',
    time: '30m',
    effort: 'one-pot',
    needs: [PASTA, 'tomato'],
    wants: ['garlic', 'onion', CHEESE, 'basil|herb'],
    addIns: true,
    steps: [
      (_n, w) => `Soften ${w[1] || 'an onion'} and ${w[0] || 'garlic'} in a little oil (-25m)`,
      (n) => `Add the ${n[1]} and simmer until thick (-20m)`,
      (n) => `Boil the ${n[0]} until just done (-12m)`,
      (_n, w) => `Mix everything together${w[2] ? ` and top with ${w[2]}` : ''} (-2m)`,
    ],
  },
  {
    id: 'egg-fried-rice',
    title: 'Egg fried rice',
    blurb: 'Rice, eggs and any odds and ends. The best use for leftover rice.',
    cuisine: 'Chinese',
    time: '20m',
    effort: 'one-pot',
    needs: ['rice', 'eggs?\\b'],
    wants: ['peas?\\b', 'spring onion', 'carrot', 'sweetcorn', 'soy', MEAT],
    addIns: true,
    steps: [
      (n) => `Cook the ${n[0]} if you need to, then spread it out to dry (-20m)`,
      () => 'Fry the vegetables and anything leftover in hot oil for 3 minutes (-12m)',
      (n) => `Push to one side, scramble the ${n[1]} in the gap (-7m)`,
      (_n, w) => `Toss it all together${w[4] ? ` with ${w[4]}` : ''} until piping hot (-2m)`,
    ],
  },
  {
    id: 'beans-toast',
    title: 'Proper beans on toast',
    blurb: 'Beans, toast, a pile of cheese and an egg on top if you like.',
    cuisine: 'British',
    time: '20m',
    effort: 'one-pot',
    needs: ['baked beans|beans', 'bread|toast'],
    wants: [CHEESE, 'eggs?\\b'],
    steps: [
      (n) => `Warm the ${n[0]} in a pan with a good grind of pepper (-10m)`,
      (n) => `Toast the ${n[1]} (-6m)`,
      (_n, w) => `Pile on${w[0] ? ` and finish with ${w[0]}` : ''}${w[1] ? `, plus a fried ${w[1]}` : ''} (-1m)`,
    ],
  },
  {
    id: 'chickpea-stew',
    title: 'Chickpea and tomato stew',
    blurb: 'A hearty, spicy-ish pot made from tins. Better the next day too.',
    cuisine: 'Mediterranean',
    time: '30m',
    effort: 'one-pot',
    needs: ['chickpea', 'tomato'],
    wants: ['onion', 'garlic', 'spinach', 'cumin|paprika|curry|chilli', 'rice'],
    addIns: true,
    steps: [
      (_n, w) => `Soften ${w[0] || 'an onion'} and ${w[1] || 'garlic'} with ${w[3] || 'a pinch of spice'} (-28m)`,
      (n) => `Tip in the ${n[0]} and ${n[1]} and simmer for 15 minutes (-22m)`,
      (_n, w) => `Stir through ${w[2] || 'any greens'} until wilted${w[4] ? `; serve over ${w[4]}` : ''} (-4m)`,
    ],
  },
  {
    id: 'dal',
    title: 'Red lentil dal',
    blurb: 'Lentils melt into a comforting, spiced dal in 25 minutes. Costs almost nothing.',
    cuisine: 'Indian',
    time: '30m',
    effort: 'one-pot',
    needs: ['lentil', 'onion|garlic'],
    wants: ['tomato', 'coconut', 'spinach', 'curry|cumin|turmeric', 'rice'],
    steps: [
      (n) => `Soften the ${n[1]} with the spices (-30m)`,
      (n, w) => `Add the ${n[0]}, ${w[0] ? w[0] + ', ' : ''}and 3 times as much water. Simmer until soft (-25m)`,
      (_n, w) => `Stir in ${w[1] || 'a little oil'}${w[2] ? ` and ${w[2]}` : ''}, season well${w[4] ? `, serve with ${w[4]}` : ''} (-3m)`,
    ],
  },
  {
    id: 'frittata',
    title: 'Use-it-up frittata',
    blurb: 'Eggs plus whatever is lurking in the fridge. Hot tonight, cold in tomorrow’s lunchbox.',
    cuisine: 'Italian',
    time: '30m',
    effort: 'one-pot',
    needs: ['eggs?\\b'],
    wants: ['potato', CHEESE, 'onion', 'peppers?\\b', 'spinach', 'ham|bacon'],
    addIns: true,
    steps: [
      () => 'Fry whatever vegetables and leftovers you are using until soft (-22m)',
      (n) => `Beat the ${n[0]} with a pinch of salt and pour over (-15m)`,
      (_n, w) => `Cook gently, then finish${w[1] ? ` with ${w[1]} on top` : ''} under a hot grill (-8m)`,
    ],
  },
  {
    id: 'quesadilla',
    title: 'Cheesy quesadillas',
    blurb: 'Crisp wraps, melted cheese and any filling to hand.',
    cuisine: 'Mexican',
    time: '20m',
    effort: 'standard',
    needs: ['tortilla|wrap', CHEESE],
    wants: ['beans', 'peppers?\\b', 'sweetcorn', 'onion', 'chicken'],
    addIns: true,
    steps: [
      () => 'Chop and warm any fillings in a dry pan (-15m)',
      (n) => `Sprinkle ${n[1]} and filling over half a ${n[0]}, fold over (-10m)`,
      () => 'Fry on both sides until golden and the cheese melts. Cut into wedges (-3m)',
    ],
  },
  {
    id: 'mac-cheese',
    title: 'Mac and cheese',
    blurb: 'Pasta in a rich cheese sauce. Nobody ever complained.',
    cuisine: 'American',
    time: '30m',
    effort: 'standard',
    needs: [PASTA, CHEESE, 'butter|milk'],
    wants: ['flour', 'mustard', 'broccoli', 'ham|bacon'],
    steps: [
      (n) => `Boil the ${n[0]} and drain (-25m)`,
      (n) => `Melt ${n[2]} with a spoon of flour, whisk in liquid to a sauce (-15m)`,
      (n) => `Stir in ${n[1]} and a little mustard if you have it. Mix with the pasta (-8m)`,
    ],
  },
  {
    id: 'tuna-pasta',
    title: 'Tuna pasta',
    blurb: 'A tin of tuna makes a lovely quick sauce with pasta.',
    cuisine: 'Italian',
    time: '20m',
    effort: 'one-pot',
    needs: ['tuna', PASTA],
    wants: ['tomato', 'sweetcorn', 'mayo', CHEESE],
    steps: [
      (n) => `Boil the ${n[1]} until just done (-18m)`,
      (n, w) => `Warm the ${n[0]} with ${w[0] || 'a little oil'} in a pan (-8m)`,
      (_n, w) => `Combine, loosen with pasta water${w[3] ? `, top with ${w[3]}` : ''} (-2m)`,
    ],
  },
  {
    id: 'jacket',
    title: 'Loaded jacket potatoes',
    blurb: 'Crisp skins, fluffy middles and a generous topping.',
    cuisine: 'British',
    time: '60m',
    effort: 'standard',
    needs: ['potato', CHEESE],
    wants: ['beans', 'tuna', 'butter', 'coleslaw|onion'],
    steps: [
      (n) => `Prick the ${n[0]} and bake at 200C until the skins are crisp (-60m)`,
      () => 'Warm the toppings (-10m)',
      (n) => `Split, fluff up with butter and pile on the ${n[1]} (-3m)`,
    ],
  },
  {
    id: 'hash',
    title: 'Potato hash with a fried egg',
    blurb: 'Crispy potato and onion, any meat that is about, and a runny egg on top.',
    cuisine: 'American',
    time: '30m',
    effort: 'one-pot',
    needs: ['potato', 'onion'],
    wants: ['eggs?\\b', 'bacon|sausage|ham', 'peppers?\\b'],
    addIns: true,
    steps: [
      (n) => `Dice the ${n[0]} and parboil for 5 minutes (-28m)`,
      (n) => `Fry with the ${n[1]} and any meat in a wide pan until crisp (-20m)`,
      (_n, w) => `${w[0] ? `Fry ${w[0]} and lay on top` : 'Season well'}, and serve straight from the pan (-3m)`,
    ],
  },
  {
    id: 'cupboard-soup',
    title: 'Cupboard soup',
    blurb: 'Stock, any soft veg and a pulse make a proper soup. Bread and cheese alongside.',
    cuisine: 'British',
    time: '30m',
    effort: 'one-pot',
    needs: ['stock|bouillon', VEG],
    wants: ['bread', CHEESE, 'lentil|beans?\\b'],
    addIns: true,
    steps: [
      (n) => `Chop the ${n[1]} and any other veg small (-30m)`,
      (n) => `Simmer in ${n[0]} and water until soft, adding lentils or beans if you have them (-22m)`,
      (_n, w) => `Blend or mash roughly and season${w[0] ? `; serve with ${w[0]}` : ''} (-4m)`,
    ],
  },
  {
    id: 'omelette',
    title: 'Fridge omelette',
    blurb: 'Eggs are the fastest dinner there is. Fill it with the best of the fridge.',
    cuisine: 'French',
    time: '20m',
    effort: 'one-pot',
    needs: ['eggs?\\b', CHEESE + '|ham|tomato|mushroom|spinach|peppers?\\b|onion'],
    wants: ['bread|potato'],
    addIns: true,
    steps: [
      (n) => `Beat the ${n[0]} with salt and pepper (-10m)`,
      (n) => `Cook the ${n[1]} briefly in butter or oil (-8m)`,
      () => 'Pour in the eggs, fill, fold and serve at once (-3m)',
    ],
  },
  {
    id: 'chilli',
    title: 'Bean chilli',
    blurb: 'Beans, tomatoes and spice make a big warming pot that feeds a crowd.',
    cuisine: 'Mexican',
    time: '30m',
    effort: 'one-pot',
    needs: ['kidney|black bean|beans?\\b', 'tomato', 'onion'],
    wants: ['rice', 'peppers?\\b', 'sweetcorn', 'chilli|cumin|paprika'],
    steps: [
      (n, w) => `Soften the ${n[2]} with ${w[3] || 'a little chilli powder'} (-30m)`,
      (n) => `Add the ${n[0]} and ${n[1]}, plus any peppers or corn, and simmer for 20 minutes (-25m)`,
      (_n, w) => `Season and serve${w[0] ? ` with ${w[0]}` : ' with bread or baked potatoes'} (-3m)`,
    ],
  },
  {
    id: 'rice-bowl',
    title: 'Leftover rice bowl',
    blurb: 'Rice plus last night’s meat or veg, quickly crisped and topped with an egg.',
    cuisine: 'Pan-Asian',
    time: '20m',
    effort: 'one-pot',
    needs: ['rice', MEAT],
    wants: ['eggs?\\b', 'soy', 'spring onion|carrot|peppers?\\b|peas?\\b'],
    steps: [
      (n) => `Slice the ${n[1]} thinly (-15m)`,
      (n) => `Stir-fry with the ${n[0]} until hot and crisp at the edges (-10m)`,
      (_n, w) => `${w[0] ? `Fry ${w[0]} and put on top` : 'Season'}${w[1] ? `; splash with ${w[1]}` : ''} (-2m)`,
    ],
  },
  {
    id: 'pancakes',
    title: 'Pancakes for dinner',
    blurb: 'Flour, eggs and milk. Sweet or savoury, it is always a hit.',
    cuisine: 'British',
    time: '20m',
    effort: 'standard',
    needs: ['flour', 'eggs?\\b', 'milk'],
    wants: ['cheese|ham|jam|banana|lemon'],
    steps: [
      (n) => `Whisk ${n[0]}, ${n[1]} and ${n[2]} into a smooth batter (-18m)`,
      () => 'Fry thin pancakes in a hot buttered pan, a ladle at a time (-12m)',
      (_n, w) => `Fill with ${w[0] || 'sugar and lemon, or whatever is in the fridge'} and roll (-2m)`,
    ],
  },
  {
    id: 'toastie',
    title: 'Toasted cheese sandwiches',
    blurb: 'Golden, crunchy and melty. Add a pickle or tomato if you have one.',
    cuisine: 'British',
    time: '20m',
    effort: 'standard',
    needs: ['bread', CHEESE],
    wants: ['tomato', 'ham', 'onion|pickle'],
    addIns: true,
    steps: [
      (n) => `Build the sandwiches with plenty of ${n[1]} (-8m)`,
      () => 'Toast in a pan or sandwich maker until golden outside and melted inside (-4m)',
    ],
  },
  {
    id: 'sausage-beans',
    title: 'Sausage and bean casserole',
    blurb: 'Sausages simmered in a smoky tomato and bean sauce.',
    cuisine: 'British',
    time: '60m',
    effort: 'one-pot',
    needs: ['sausage', 'beans?\\b|tomato'],
    wants: ['onion', 'garlic', 'peppers?\\b', 'potato'],
    steps: [
      (n) => `Brown the ${n[0]} in a wide pan (-50m)`,
      (n, w) => `Add ${w[0] || 'an onion'}, ${w[1] || 'garlic'} and the ${n[1]} (-40m)`,
      () => 'Simmer gently until thick and the sausages are cooked through (-10m)',
    ],
  },
];

/** Things that would not belong in a fry-up of leftovers. */
const NOT_ADD_IN =
  /milk|butter|cream|yog|juice|wine|beer|jam|sauce|mayo|ketchup|bread|water|ice\b|chocolate|cake|biscuit|crisps|cereal|marmalade|hummus|oil|vinegar|egg/i;

const clean = (s: string) => s.replace(/\s+/g, ' ').trim();

function buildIdea(t: Template, stock: StockItem[], banned: string[]): CupboardCandidate | null {
  const used = new Set<string>();
  const needed: StockItem[] = [];
  for (const pattern of t.needs) {
    const hit = find(stock, pattern, used);
    if (!hit) return null;
    used.add(hit.name);
    needed.push(hit);
  }
  const wanted: (StockItem | undefined)[] = (t.wants || []).map((pattern) => {
    const hit = find(stock, pattern, used);
    if (hit) used.add(hit.name);
    return hit;
  });

  const extras: StockItem[] = [];
  if (t.addIns) {
    for (const s of stock) {
      if (extras.length >= 2) break;
      if (!s.fridge || used.has(s.name) || NOT_ADD_IN.test(s.name)) continue;
      if (!s.red) continue; // only the things that need using up
      extras.push(s);
      used.add(s.name);
    }
  }

  const ingredientItems = [...needed, ...wanted.filter((w): w is StockItem => Boolean(w)), ...extras];
  const names = ingredientItems.map((i) => clean(i.name));
  if (mentionsAny(names, banned)) return null;

  const n = needed.map((i) => clean(i.name).toLowerCase());
  const w = wanted.map((i) => (i ? clean(i.name).toLowerCase() : undefined));
  const steps = t.steps.map((s) => s(n, w));
  if (extras.length > 0) {
    steps.splice(Math.max(1, steps.length - 1), 0, `Add the ${extras.map((e) => clean(e.name).toLowerCase()).join(' and ')}, which need using up (-10m)`);
  }

  const meal: Meal = {
    id: `idea_${t.id}`,
    title: t.title,
    description: t.blurb,
    cuisine: t.cuisine,
    timeStake: t.time,
    effort: t.effort,
    ingredients: names,
    prepSteps: steps,
    rating: 0,
    isFavorite: false,
    lastCookedDate: null,
    cookCount: 0,
    tags: ['Cupboard idea'],
    servings: 2,
    source: 'idea',
  };
  return {
    kind: 'idea',
    meal,
    uses: names,
    rescues: ingredientItems.filter((i) => i.red).map((i) => clean(i.name)),
  };
}

/**
 * Batches in the freezer are dinners that need nothing from the shop, so they are offered first: oldest first,
 * which also puts the "eat soon" ones at the front. A batch from one of our recipes uses that recipe; any other
 * is a plain "defrost and reheat" card named after the batch.
 */
export function freezerCandidates(
  freezer: FreezerItem[],
  meals: Meal[],
  banned: string[],
  diets: DietId[],
  now: Date = new Date()
): CupboardCandidate[] {
  const lowerBanned = banned.map((b) => b.toLowerCase()).filter(Boolean);
  return oldestFirst(inFreezer(freezer)).flatMap((item) => {
    const linked = item.mealId ? meals.find((m) => m.id === item.mealId) : undefined;
    const texts = linked ? [linked.title, ...linked.ingredients] : [item.name];
    if (!mealFitsDiets(linked ? linked.ingredients : [item.name], diets)) return [];
    if (mentionsAny(texts, lowerBanned)) return [];
    const meal: Meal = linked ?? {
      id: `freezer:${item.id}`,
      title: item.name,
      description: 'A batch from the freezer. Nothing to buy.',
      cuisine: 'Freezer',
      timeStake: '30m',
      effort: 'one-pot',
      ingredients: [item.name],
      prepSteps: ['Defrost overnight in the fridge, or in the microwave', 'Reheat until piping hot all the way through'],
      rating: 0,
      isFavorite: false,
      lastCookedDate: null,
      cookCount: 0,
      tags: ['Freezer'],
    };
    return [
      {
        kind: 'freezer' as const,
        meal,
        uses: [item.name],
        rescues: [],
        freezerId: item.id,
        portionsLeft: item.portions,
        eatSoon: isEatSoon(item, now),
      },
    ];
  });
}

export interface CupboardOptions {
  meals: Meal[];
  pantry: PantryItem[];
  staples: string[];
  banned: string[];
  diets: DietId[];
  nowMs?: number;
}

/** Everything the household could cook tonight without a trip to the shop. */
export function cupboardCandidates({ meals, pantry, staples, banned, diets, nowMs }: CupboardOptions): CupboardCandidate[] {
  const stock = stockOf(pantry, staples);
  const lowerBanned = banned.map((b) => b.toLowerCase()).filter(Boolean);
  const out: CupboardCandidate[] = [];

  for (const meal of meals) {
    if (meal.ingredients.length < 2) continue;
    if (isMealCoolingOff(meal, nowMs)) continue;
    if (!mealFitsDiets(meal.ingredients, diets)) continue;
    if (mentionsAny([meal.title, ...meal.ingredients], lowerBanned)) continue;
    const match = calculateMealPantryMatch(meal, pantry, staples);
    if (match.missingItems.length > 0) continue;
    out.push({
      kind: 'saved',
      meal,
      uses: meal.ingredients,
      rescues: match.redMatchedItems,
    });
  }

  for (const t of TEMPLATES) {
    const idea = buildIdea(t, stock, lowerBanned);
    if (!idea) continue;
    if (!mealFitsDiets(idea.meal.ingredients, diets)) continue;
    out.push(idea);
  }
  return out;
}

/** Picks one at random. Dinners that rescue "use next" items are likelier; avoids repeating the last few. */
export function pickSurprise(
  candidates: CupboardCandidate[],
  avoidIds: string[] = [],
  rng: () => number = Math.random
): CupboardCandidate | null {
  let pool = candidates.filter((c) => !avoidIds.includes(c.meal.id));
  if (pool.length === 0) pool = candidates;
  if (pool.length === 0) return null;
  // Freezer batches come first, in the order given (oldest first), before anything that needs the fridge.
  const frozen = pool.find((c) => c.kind === 'freezer');
  if (frozen) return frozen;
  const weights = pool.map((c) => (c.kind === 'idea' ? 1.5 : 1) + c.rescues.length * 2);
  const total = weights.reduce((a, b) => a + b, 0);
  let roll = rng() * total;
  for (let i = 0; i < pool.length; i++) {
    roll -= weights[i];
    if (roll < 0) return pool[i];
  }
  return pool[pool.length - 1];
}
