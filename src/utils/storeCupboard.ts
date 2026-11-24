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

/** A best guess at the shelf from the name, for quick adds, receipts and photos. */
export function guessShelf(name: string): string {
  const n = name.toLowerCase();
  if (/\b(tins?|tinned|cans?|canned|chopped tomatoes|passata|beans|chickpeas|lentils|coconut milk|sweetcorn|tuna|jar)\b/.test(n)) return 'Tins & jars';
  if (/vinegar/.test(n)) return 'Oils & vinegars';
  if (/(sauce|ketchup|mayo|mustard|pesto|paste|stock|gravy|chutney|relish|soy|honey|jam|marmite|sriracha)/.test(n)) return 'Sauces & condiments';
  if (/(pasta|spaghetti|penne|rigatoni|fusilli|noodle|rice|couscous|quinoa|oats|bulgur|lasagne|orzo)/.test(n)) return 'Pasta, rice & grains';
  if (/(spice|cumin|paprika|chilli flakes|oregano|thyme|basil|curry powder|turmeric|cinnamon|peppercorn|garam|bay leaves|herbs)/.test(n)) return 'Herbs & spices';
  if (/(flour|sugar|baking|yeast|cocoa|vanilla|bicarb)/.test(n)) return 'Baking';
  if (/\boil\b/.test(n)) return 'Oils & vinegars';
  return 'Other';
}
