import type { Meal, PantryItem } from '../types';
import { calculateMealPantryMatch } from './dinnerEngine';

/**
 * A rough "what would tonight cost to buy" for a dish. We don't track prices, so this uses typical UK supermarket
 * prices (£) for the amount a dinner for four uses, matched by the words in each ingredient. Only what is missing from
 * the fridge, the cupboard and the staples counts, so "Free" means "everything is already in the house".
 * It is a guide, not a till receipt.
 */

export type CostLimit = 'any' | 'free' | '5' | '10';

/** [words that identify the ingredient, typical cost in £]. The first match wins, so the specific ones come first. */
const PRICES: [RegExp, number][] = [
  // meat and fish
  [/\b(beef fillet|fillet steak|wagyu|rack of lamb|lobster|scallops?|king prawns?)\b/i, 9],
  [/\b(steak|sirloin|ribeye|rump|lamb shoulder|lamb leg|leg of lamb|lamb shank|lamb rump|beef shin|brisket|short ribs?|oxtail|duck|venison)\b/i, 7],
  [/\b(lamb mince|minced lamb|beef mince|minced beef|pork mince|minced pork|turkey mince|mince)\b/i, 3.5],
  [/\b(lamb|beef)\b/i, 5.5],
  [/\b(pork belly|pork shoulder|pork loin|pork chops?|pork)\b/i, 4.5],
  [/\b(chicken|turkey)\b/i, 4],
  [/\b(salmon|sea bass|seabass|cod|haddock|monkfish|halibut|trout|mackerel|sea bream|snapper|white fish|fish fillets?)\b/i, 4.5],
  [/\b(prawns?|shrimp|crab|mussels?|clams?|squid|calamari|octopus)\b/i, 4.5],
  [/\b(tuna|sardines?|anchov(y|ies)|smoked fish|kippers?)\b/i, 1.5],
  [/\b(sausages?|chorizo|nduja|salami)\b/i, 3],
  [/\b(bacon|pancetta|lardons|ham|prosciutto|gammon|black pudding)\b/i, 2.5],
  [/\b(fish)\b/i, 4],
  // dairy, eggs, plant protein
  [/\b(eggs?)\b/i, 2],
  [/\b(halloumi|paneer|feta|goat'?s? cheese|brie|camembert|blue cheese|gorgonzola|stilton|parmesan|pecorino|gruyere|manchego)\b/i, 2.5],
  [/\b(mozzarella|ricotta|mascarpone|cream cheese|cheddar|cheese|gouda|emmental)\b/i, 2],
  [/\b(double cream|single cream|cream|creme fraiche|crème fraîche|sour cream)\b/i, 1.3],
  [/\b(yog(h)?urt|milk|buttermilk)\b/i, 1],
  [/\b(butter|ghee)\b/i, 1.8],
  [/\b(tofu|tempeh|seitan|quorn)\b/i, 2],
  [/\b(coconut milk|coconut cream)\b/i, 1.1],
  // carbs and cupboard
  [/\b(pasta|spaghetti|penne|rigatoni|fusilli|tagliatelle|linguine|macaroni|lasagne|orzo|noodles?|vermicelli|udon|ramen)\b/i, 1.2],
  [/\b(rice|risotto|arborio|basmati|jasmine)\b/i, 1.3],
  [/\b(couscous|quinoa|bulgur|freekeh|polenta|pearl barley|semolina)\b/i, 1.5],
  [/\b(bread|baguette|ciabatta|sourdough|pitta|naan|flatbreads?|tortillas?|wraps?|buns?|rolls?|brioche|crumpets?)\b/i, 1.4],
  [/\b(puff pastry|shortcrust|filo|pastry)\b/i, 1.8],
  [/\b(gnocchi|dumplings?|gyoza|pizza dough|dough)\b/i, 1.8],
  [/\b(lentils?|chickpeas?|beans?|kidney|cannellini|butter beans?|black beans?|borlotti|split peas)\b/i, 0.9],
  [/\b(flour|breadcrumbs|panko|cornflour|cornstarch)\b/i, 0.8],
  // veg and fruit
  [/\b(potatoes?|maris piper|new potatoes|baking potatoes?)\b/i, 1.2],
  [/\b(sweet potatoes?|squash|pumpkin|butternut)\b/i, 1.6],
  [/\b(tinned tomatoes|chopped tomatoes|plum tomatoes|passata|tomato puree|tomato purée|tomato paste|sun-?dried tomatoes)\b/i, 0.8],
  [/\b(tomatoes?)\b/i, 1.5],
  [/\b(mushrooms?)\b/i, 1.6],
  [/\b(spinach|kale|chard|cavolo|pak choi|bok choy|rocket|watercress|salad|lettuce|gem)\b/i, 1.2],
  [/\b(broccoli|cauliflower|courgettes?|zucchini|aubergines?|eggplant|cabbage|leeks?|fennel|asparagus|green beans|runner beans|mange ?tout|sugar snaps|sprouts)\b/i, 1.2],
  [/\b(peppers?|capsicum|chillies|chilli|chili|jalape[nñ]os?)\b/i, 0.9],
  [/\b(carrots?|parsnips?|beetroot|swede|turnips?|celery|celeriac|radish)\b/i, 0.7],
  [/\b(peas|sweetcorn|corn)\b/i, 0.9],
  [/\b(avocados?)\b/i, 1.5],
  [/\b(onions?|shallots?|spring onions?|scallions?|red onions?)\b/i, 0.5],
  [/\b(garlic|ginger|lemongrass)\b/i, 0.4],
  [/\b(lemons?|limes?|oranges?)\b/i, 0.5],
  [/\b(apples?|pears?|pineapple|mango|banana|berries|raisins|sultanas|apricots?|dates|figs?|olives?|capers|pickles?|gherkins?|kimchi)\b/i, 1.3],
  [/\b(basil|coriander|cilantro|parsley|mint|thyme|rosemary|sage|dill|chives|oregano|tarragon|bay leaves?|herbs?)\b/i, 0.9],
  // sauces, spices, drinks, other
  [/\b(wine|sherry|mirin|sake|beer|lager|ale|cider|stout|brandy|rum)\b/i, 2.5],
  [/\b(curry paste|miso|gochujang|harissa|tahini|pesto|chipotle|sriracha|hoisin|oyster sauce|fish sauce|teriyaki|tikka|korma|jerk|sauce|paste|salsa|marinade|dressing|mayo|mayonnaise|ketchup|mustard|chutney|relish)\b/i, 1.3],
  [/\b(stock|bouillon|broth|gravy)\b/i, 0.6],
  [/\b(peanuts?|cashews?|almonds?|walnuts?|pine nuts?|pistachios?|nuts?|sesame|seeds?|peanut butter)\b/i, 1.3],
  [/\b(chocolate|cocoa|honey|maple|sugar|syrup|jam)\b/i, 0.8],
  [/\b(oil|vinegar|soy sauce|soy|worcestershire)\b/i, 0.6],
  [/\b(cumin|paprika|turmeric|garam masala|curry powder|coriander seeds?|cinnamon|nutmeg|cloves?|cardamom|saffron|chilli flakes|cayenne|za'?atar|sumac|five spice|spices?|seasoning|salt|pepper|mixed spice|fennel seeds?)\b/i, 0.4],
];

const UNKNOWN = 1;

/** Typical £ for one ingredient (a dinner's worth). */
export function ingredientCost(name: string): number {
  for (const [re, price] of PRICES) if (re.test(name)) return price;
  return UNKNOWN;
}

/** Roughly what you would have to buy for this dish, given what is already in the house. */
export function missingCost(meal: Meal, pantry: PantryItem[], staples: string[]): number {
  const { missingItems } = calculateMealPantryMatch(meal, pantry, staples);
  const sum = missingItems.reduce((total, item) => total + ingredientCost(item), 0);
  return Math.round(sum * 10) / 10;
}

/** "Free" allows a couple of pounds of top-ups (an onion, a lemon): almost nothing is made from the fridge alone. */
export const FREE_TOP_UP = 2;

export const costLimitValue = (limit: CostLimit): number => (limit === 'free' ? FREE_TOP_UP : limit === '5' ? 5 : limit === '10' ? 10 : Infinity);

export const costLabel = (limit: CostLimit): string =>
  limit === 'free' ? 'Free, using what we have' : limit === '5' ? 'Up to £5 to buy' : limit === '10' ? 'Up to £10 to buy' : 'Any cost';

/** "Free" / "about £4" for showing next to a dish. */
export const costText = (cost: number): string => (cost <= 0 ? 'Nothing to buy' : `about £${Math.round(cost)} to buy`);

/** The price table is for a dinner for four, so a head is a quarter of it. */
export const PRICE_TABLE_SERVINGS = 4;

/**
 * What the dish costs per person, whatever is in the house: every ingredient except the always-have staples,
 * priced from the same table, divided by the four portions the table assumes. It does not change with the
 * serving size, because more people means more of everything. Rounded to the nearest 10p.
 */
export function costPerHead(meal: Meal, staples: string[]): number {
  const have = new Set(staples.map((s) => s.trim().toLowerCase()));
  const total = meal.ingredients
    .filter((i) => !have.has(i.trim().toLowerCase()))
    .reduce((sum, i) => sum + ingredientCost(i), 0);
  return Math.round((total / PRICE_TABLE_SERVINGS) * 10) / 10;
}

/** "about £2.40 a head" / "about 80p a head". */
export function costPerHeadText(perHead: number): string {
  if (perHead <= 0) return "nothing a head";
  if (perHead < 1) return `about ${Math.round(perHead * 100)}p a head`;
  return `about £${perHead.toFixed(2)} a head`;
}

/** What a dish would cost to buy when that is over the limit, otherwise null. No limit means never over. */
export function overCostLimit(meal: Meal, rule: { limit: number; of: (m: Meal) => number }): number | null {
  if (!Number.isFinite(rule.limit)) return null;
  const cost = rule.of(meal);
  return cost > rule.limit ? cost : null;
}
