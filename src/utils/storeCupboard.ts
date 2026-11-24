/** The store cupboard: tins, jars, sauces, spices and dry goods. */

export const SHELVES = [
  'Tins & jars',
  'Sauces & condiments',
  'Pasta, rice & grains',
  'Herbs & spices',
  'Baking',
  'Oils & vinegars',
  'Other',
] as const;

export const newCupboardId = () => `cb_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

/** Cupboard items that actually count as in stock (items marked "Running low" still need buying). */
export const stockedCupboardNames = (cupboard: { name: string; low?: boolean }[]): string[] =>
  cupboard.filter((c) => !c.low && c.name?.trim()).map((c) => c.name);

/** A best guess at the shelf from the name, for quick adds, receipts and photos. */
export function guessShelf(name: string): string {
  const n = name.toLowerCase();
  const freshBeans = /\b(green|runner|fine|french|broad|string)\s+beans?\b/.test(n);
  if (
    !freshBeans &&
    /\b(tins?|tinned|cans?|canned|chopped tomatoes|passata|beans|chickpeas|lentils|coconut milk|sweetcorn|tuna|jar)\b/.test(n)
  ) {
    return 'Tins & jars';
  }
  if (/vinegar/.test(n)) return 'Oils & vinegars';
  if (/(sauce|ketchup|mayo|mustard|pesto|paste|stock|gravy|chutney|relish|soy|honey|jam|marmite|sriracha)/.test(n)) return 'Sauces & condiments';
  if (/(pasta|spaghetti|penne|rigatoni|fusilli|noodle|rice|couscous|quinoa|oats|bulgur|lasagne|orzo)/.test(n)) return 'Pasta, rice & grains';
  if (/(spice|cumin|paprika|chilli flakes|oregano|thyme|basil|curry powder|turmeric|cinnamon|peppercorn|garam|bay leaves|herbs)/.test(n)) return 'Herbs & spices';
  if (/(flour|sugar|baking|yeast|cocoa|vanilla|bicarb)/.test(n)) return 'Baking';
  if (/\boil\b/.test(n)) return 'Oils & vinegars';
  return 'Other';
}

/** Splits supermarket receipt lines into store-cupboard items vs fresh/chilled fridge items. */
export function splitReceiptItems<T extends { name?: string; category?: string }>(items: T[]): { cupboard: T[]; fridge: T[] } {
  const cupboard: T[] = [];
  const fridge: T[] = [];
  for (const item of items) {
    const cat = String(item?.category || '');
    const isFresh = /produce|dairy|meat|fish|bakery|frozen/i.test(cat);
    const isCupboardCat = /cupboard|grain|sauce|condiment|tin|spice|baking/i.test(cat);
    if (isCupboardCat || (!isFresh && guessShelf(String(item?.name || '')) !== 'Other')) cupboard.push(item);
    else fridge.push(item);
  }
  return { cupboard, fridge };
}
