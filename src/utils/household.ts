import { CupboardItem, HouseholdTastes, Meal, SharedVote } from '../types';

/**
 * Pure state changes for the household data that is shared between phones
 * (store cupboard, likes & dislikes, tonight's vote). The server and every phone
 * apply exactly the same operations, so they always agree.
 */

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : undefined);
const same = (a: string, b: string) => a.trim().toLowerCase() === b.trim().toLowerCase();

export const newHouseholdId = (prefix: string) =>
  `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

// ---------------------------------------------------------------------------
// Store cupboard
// ---------------------------------------------------------------------------

export const CUPBOARD_CATEGORIES = [
  'Tins & jars',
  'Sauces & condiments',
  'Pasta, rice & grains',
  'Herbs & spices',
  'Baking',
  'Oils & vinegars',
  'Other',
] as const;

export type CupboardOp =
  | { type: 'add'; item: { id?: string; name: string; category?: string; quantity?: string; addedBy?: string } }
  | { type: 'setLow'; id: string; low: boolean; by?: string }
  | { type: 'remove'; id: string };

export function applyCupboardOp(items: CupboardItem[], op: CupboardOp | any): CupboardItem[] {
  const now = new Date().toISOString();
  if (!op || typeof op !== 'object') return items;
  switch (op.type) {
    case 'add': {
      const name = clip(op.item?.name, 80);
      if (!name) return items;
      const category = clip(op.item?.category, 40) || 'Other';
      // Adding something already in the cupboard just means it's been restocked.
      const existing = items.find((i) => same(i.name, name));
      if (existing) {
        return items.map((i) =>
          i.id === existing.id
            ? { ...i, low: false, quantity: clip(op.item?.quantity, 40) || i.quantity, updatedAt: now }
            : i
        );
      }
      return [
        ...items,
        {
          id: clip(op.item?.id, 60) || newHouseholdId('c'),
          name,
          category,
          quantity: clip(op.item?.quantity, 40) || undefined,
          low: false,
          addedBy: clip(op.item?.addedBy, 40),
          updatedAt: now,
        },
      ].slice(-400);
    }
    case 'setLow':
      return items.map((i) =>
        i.id === op.id ? { ...i, low: Boolean(op.low), lowBy: op.low ? clip(op.by, 40) : undefined, updatedAt: now } : i
      );
    case 'remove':
      return items.filter((i) => i.id !== op.id);
    default:
      return items;
  }
}

/** Guess a cupboard shelf from an item's name, for receipts and quick adds. */
export function guessCupboardCategory(name: string): string {
  const n = name.toLowerCase();
  if (/\b(tin|tins|tinned|can|canned|chopped tomatoes|beans|chickpeas|lentils|coconut milk|passata|jar|sweetcorn|tuna)\b/.test(n))
    return 'Tins & jars';
  if (/(sauce|ketchup|mayo|mustard|pesto|paste|stock|gravy|chutney|relish|soy|vinegar|honey|jam|marmite)/.test(n))
    return /vinegar/.test(n) ? 'Oils & vinegars' : 'Sauces & condiments';
  if (/(pasta|spaghetti|penne|rigatoni|noodle|rice|couscous|quinoa|oats|bulgur|lasagne|orzo)/.test(n))
    return 'Pasta, rice & grains';
  if (/(spice|cumin|paprika|chilli flakes|oregano|thyme|basil|curry powder|turmeric|cinnamon|pepper|salt|garam|bay)/.test(n))
    return 'Herbs & spices';
  if (/(flour|sugar|baking|yeast|cocoa|vanilla|bicarb)/.test(n)) return 'Baking';
  if (/\boil\b|olive oil|sesame oil/.test(n)) return 'Oils & vinegars';
  return 'Other';
}

// ---------------------------------------------------------------------------
// Likes & dislikes
// ---------------------------------------------------------------------------

export type TastesOp =
  | { type: 'like'; name: string }
  | { type: 'avoid'; name: string }
  | { type: 'clear'; name: string }
  | { type: 'seed'; likes: string[]; avoid: string[] };

const withoutName = (list: string[], name: string) => list.filter((x) => !same(x, name));

export function applyTastesOp(tastes: HouseholdTastes, op: TastesOp | any): HouseholdTastes {
  if (!op || typeof op !== 'object') return tastes;
  switch (op.type) {
    case 'like':
    case 'avoid': {
      const name = clip(op.name, 60);
      if (!name) return tastes;
      // Something can't be both liked and avoided.
      const likes = withoutName(tastes.likes, name);
      const avoid = withoutName(tastes.avoid, name);
      return op.type === 'like'
        ? { ...tastes, likes: [...likes, name].slice(-100), avoid }
        : { ...tastes, likes, avoid: [...avoid, name].slice(-100) };
    }
    case 'clear': {
      const name = String(op.name || '');
      return { ...tastes, likes: withoutName(tastes.likes, name), avoid: withoutName(tastes.avoid, name) };
    }
    case 'seed':
      // Only fills an empty household list (the first phone to connect brings its own).
      if (tastes.seeded) return tastes;
      return {
        likes: (Array.isArray(op.likes) ? op.likes : []).map((s: unknown) => clip(s, 60)).filter(Boolean).slice(0, 100),
        avoid: (Array.isArray(op.avoid) ? op.avoid : []).map((s: unknown) => clip(s, 60)).filter(Boolean).slice(0, 100),
        seeded: true,
      };
    default:
      return tastes;
  }
}

// ---------------------------------------------------------------------------
// Tonight's vote
// ---------------------------------------------------------------------------

export const majorityFor = (memberCount: number) => Math.max(1, Math.ceil(memberCount / 2));

/** Record one person's vote. Returns the vote unchanged if it's already decided. */
export function castVote(
  vote: SharedVote,
  memberId: string,
  decision: 'yes' | 'no',
  opts: { instant?: boolean; memberName?: string } = {}
): SharedVote {
  if (vote.status !== 'open') return vote;
  const member = vote.members.find((m) => m.id === memberId);
  const name = member?.name || clip(opts.memberName, 40) || 'Someone';
  const members = member ? vote.members : [...vote.members, { id: memberId, name }];
  const ballot = { ...vote.ballot, [memberId]: decision };
  const now = new Date().toISOString();

  if (decision === 'no') {
    return { ...vote, members, ballot, status: 'vetoed', decidedBy: { id: memberId, name }, decidedAt: now };
  }
  const yes = Object.values(ballot).filter((v) => v === 'yes').length;
  if (opts.instant || yes >= majorityFor(members.length)) {
    return { ...vote, members, ballot, status: 'agreed', decidedBy: { id: memberId, name }, decidedAt: now };
  }
  return { ...vote, members, ballot };
}

// ---------------------------------------------------------------------------
// Recipes ("our recipes" plus the dishes hidden with "not for us")
// ---------------------------------------------------------------------------

export interface HouseholdRecipes {
  meals: Meal[];
  hidden: string[];
  seeded?: boolean;
}

export type RecipesOp =
  | { type: 'upsert'; meal: Meal; index?: number }
  | { type: 'remove'; id: string }
  | { type: 'hide'; id: string }
  | { type: 'unhide'; id: string }
  | { type: 'replace'; meals: Meal[]; hidden?: string[] }
  | { type: 'seed'; meals: Meal[]; hidden: string[] };

const MAX_MEALS = 600;
const validMeal = (m: any): m is Meal =>
  !!m && typeof m === 'object' && typeof m.id === 'string' && m.id.length <= 80 && typeof m.title === 'string';
const cleanMeals = (list: unknown) =>
  (Array.isArray(list) ? list : []).filter(validMeal).slice(0, MAX_MEALS) as Meal[];
const cleanIds = (list: unknown) =>
  Array.from(new Set((Array.isArray(list) ? list : []).filter((x) => typeof x === 'string').map((x) => x.slice(0, 80)))).slice(0, 1000);

export function applyRecipesOp(state: HouseholdRecipes, op: RecipesOp | any): HouseholdRecipes {
  if (!op || typeof op !== 'object') return state;
  switch (op.type) {
    case 'upsert': {
      if (!validMeal(op.meal)) return state;
      const at = state.meals.findIndex((m) => m.id === op.meal.id);
      if (at >= 0) {
        const meals = [...state.meals];
        meals[at] = op.meal;
        return { ...state, meals };
      }
      const meals = [...state.meals];
      const index = typeof op.index === 'number' ? Math.max(0, Math.min(meals.length, op.index)) : meals.length;
      meals.splice(index, 0, op.meal);
      return { ...state, meals: meals.slice(0, MAX_MEALS) };
    }
    case 'remove':
      return { ...state, meals: state.meals.filter((m) => m.id !== op.id) };
    case 'hide':
      return typeof op.id === 'string' && !state.hidden.includes(op.id)
        ? { ...state, hidden: [...state.hidden, op.id.slice(0, 80)] }
        : state;
    case 'unhide':
      return { ...state, hidden: state.hidden.filter((h) => h !== op.id) };
    case 'replace':
      return {
        ...state,
        meals: cleanMeals(op.meals),
        hidden: op.hidden === undefined ? state.hidden : cleanIds(op.hidden),
        seeded: true,
      };
    case 'seed':
      // Only the first phone to reach a fresh server sets the household's recipes.
      if (state.seeded) return state;
      return { meals: cleanMeals(op.meals), hidden: cleanIds(op.hidden), seeded: true };
    default:
      return state;
  }
}

/** The ops that turn one recipe list into another (used so every local edit syncs). */
export function diffRecipes(prev: Meal[], next: Meal[]): RecipesOp[] {
  const nextIds = new Set(next.map((m) => m.id));
  const prevById = new Map(prev.map((m) => [m.id, m]));
  const ops: RecipesOp[] = prev.filter((m) => !nextIds.has(m.id)).map((m) => ({ type: 'remove', id: m.id }));
  next.forEach((m, index) => {
    const before = prevById.get(m.id);
    if (before === m) return;
    ops.push(before ? { type: 'upsert', meal: m } : { type: 'upsert', meal: m, index });
  });
  // A big change (restore from backup, reset) goes as one replacement.
  return ops.length > 40 ? [{ type: 'replace', meals: next }] : ops;
}
