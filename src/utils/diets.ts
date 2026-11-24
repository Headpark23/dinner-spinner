/**
 * Dietary preferences, set once. This is a best guess from ingredient names, not a
 * guarantee: it can't see hidden ingredients (stock cubes, sauces, a pastry brushed with egg).
 * Anyone with an allergy should still read the recipe and the labels.
 */
export type DietId = 'vegetarian' | 'vegan' | 'pescatarian' | 'gluten-free' | 'dairy-free' | 'nut-free';

const MEAT = [
  'chicken', 'beef', 'pork', 'lamb', 'mutton', 'bacon', 'ham', 'sausage', 'chorizo', 'salami', 'prosciutto',
  'pancetta', 'mince', 'steak', 'turkey', 'duck', 'veal', 'venison', 'goat', 'lardon', 'kebab', 'meatball',
  'pepperoni', 'brisket', 'rib', 'oxtail', 'gelatine', 'gelatin', 'lard', 'suet', 'nduja', 'guanciale', 'mortadella',
  'hot dog', 'frankfurter', 'poultry', 'gammon',
];
const FISH = [
  'fish', 'salmon', 'tuna', 'cod', 'haddock', 'prawn', 'shrimp', 'anchovy', 'anchovies', 'sardine', 'mackerel',
  'squid', 'calamari', 'mussel', 'clam', 'crab', 'lobster', 'scallop', 'trout', 'sea bass', 'bream', 'hake',
  'seafood', 'oyster', 'octopus', 'langoustine', 'halibut', 'monkfish', 'plaice', 'kipper', 'whitebait', 'bonito',
];
const DAIRY = [
  'milk', 'cheese', 'butter', 'cream', 'yogurt', 'yoghurt', 'ghee', 'paneer', 'mozzarella', 'parmesan', 'feta',
  'halloumi', 'ricotta', 'mascarpone', 'cheddar', 'creme fraiche', 'custard', 'buttermilk', 'whey',
  'labneh', 'gruyere', 'brie', 'camembert', 'gorgonzola', 'pecorino', 'burrata', 'kefir', 'skyr', 'quark',
];
const EGG = ['egg', 'mayo', 'mayonnaise', 'aioli', 'meringue'];
const HONEY = ['honey'];
const GLUTEN = [
  'flour', 'bread', 'pasta', 'noodle', 'spaghetti', 'penne', 'fusilli', 'tagliatelle', 'linguine', 'macaroni',
  'lasagne', 'lasagna', 'couscous', 'bulgur', 'bulgar', 'barley', 'rye', 'wheat', 'semolina', 'breadcrumb', 'panko',
  'soy sauce', 'tortilla', 'pitta', 'pita', 'naan', 'chapati', 'roti', 'baguette', 'bun', 'pastry', 'filo', 'phyllo',
  'pizza base', 'udon', 'ramen', 'seitan', 'orzo', 'gnocchi', 'biscuit', 'cracker', 'beer', 'wrap', 'flatbread',
  'crouton', 'rigatoni', 'farfalle', 'cannelloni', 'ravioli', 'dumpling', 'crumpet', 'ciabatta', 'sourdough',
  'brioche', 'poppadom', 'poppadum', 'farro', 'spelt', 'freekeh', 'malt', 'stout', 'hoisin',
];
const NUTS = [
  'almond', 'cashew', 'walnut', 'pecan', 'pistachio', 'hazelnut', 'peanut', 'macadamia', 'pine nut', 'brazil nut',
  'chestnut', 'nut', 'satay', 'praline', 'marzipan', 'nutella', 'frangipane', 'amaretti', 'amaretto',
];

// Phrases that contain a trigger word but are fine for that diet.
const SAFE_PHRASES: Record<'dairy' | 'gluten' | 'nuts', string[]> = {
  dairy: [
    'coconut milk', 'coconut cream', 'almond milk', 'oat milk', 'soy milk', 'soya milk', 'rice milk', 'cashew milk',
    'peanut butter', 'almond butter', 'cashew butter', 'nut butter', 'butter bean', 'cocoa butter',
    'shea butter', 'coconut yogurt', 'coconut yoghurt', 'soy yogurt', 'soya yogurt', 'vegan butter', 'vegan cheese',
    'cream of tartar', 'plant-based', 'dairy-free', 'dairy free',
  ],
  gluten: [
    'rice noodle', 'glass noodle', 'rice flour', 'corn flour', 'cornflour', 'gram flour', 'chickpea flour',
    'almond flour', 'potato flour', 'tapioca flour', 'coconut flour', 'buckwheat', 'corn tortilla', 'gluten-free',
    'gluten free', 'rice paper', 'tamari', 'soba',
  ],
  nuts: ['water chestnut', 'nut-free', 'nut free', 'coconut', 'nutmeg'],
};

export const DIETS: { id: DietId; label: string; hint: string }[] = [
  { id: 'vegetarian', label: 'Vegetarian', hint: 'No meat or fish' },
  { id: 'vegan', label: 'Vegan', hint: 'No meat, fish, dairy, eggs or honey' },
  { id: 'pescatarian', label: 'Pescatarian', hint: 'Fish, but no meat' },
  { id: 'gluten-free', label: 'Gluten-free', hint: 'No wheat, barley or rye' },
  { id: 'dairy-free', label: 'Dairy-free', hint: 'No milk, cheese, butter or cream' },
  { id: 'nut-free', label: 'Nut-free', hint: 'No peanuts or tree nuts' },
];

const esc = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
const matcher = (words: string[]) =>
  new RegExp(`(?<![a-z])(?:${words.map(esc).join('|')})(?:e?s)?(?![a-z])`, 'i');

const RX = {
  meat: matcher(MEAT),
  fish: matcher(FISH),
  dairy: matcher(DAIRY),
  egg: matcher(EGG),
  honey: matcher(HONEY),
  gluten: matcher(GLUTEN),
  nuts: matcher(NUTS),
};

const stripSafe = (ing: string, group: keyof typeof SAFE_PHRASES) => {
  let s = ing.toLowerCase();
  for (const p of SAFE_PHRASES[group]) s = s.split(p).join(' ');
  return s;
};

/** The first diet this ingredient breaks, or null. */
export function ingredientBreaks(ingredient: string, diets: DietId[]): DietId | null {
  const ing = ingredient.toLowerCase();
  for (const d of diets) {
    switch (d) {
      case 'vegetarian':
        if (RX.meat.test(ing) || RX.fish.test(ing)) return d;
        break;
      case 'pescatarian':
        if (RX.meat.test(ing)) return d;
        break;
      case 'vegan':
        if (
          RX.meat.test(ing) ||
          RX.fish.test(ing) ||
          RX.dairy.test(stripSafe(ing, 'dairy')) ||
          RX.egg.test(ing) ||
          RX.honey.test(ing)
        )
          return d;
        break;
      case 'dairy-free':
        if (RX.dairy.test(stripSafe(ing, 'dairy'))) return d;
        break;
      case 'gluten-free':
        if (RX.gluten.test(stripSafe(ing, 'gluten'))) return d;
        break;
      case 'nut-free':
        if (RX.nuts.test(stripSafe(ing, 'nuts'))) return d;
        break;
    }
  }
  return null;
}

export function mealFitsDiets(ingredients: string[], diets: DietId[]): boolean {
  if (diets.length === 0) return true;
  return !ingredients.some((ing) => ingredientBreaks(ing, diets));
}

export const isDietId = (v: unknown): v is DietId => DIETS.some((d) => d.id === v);
