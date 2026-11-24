/** A small emoji for a grocery item, found by keyword. Falls back to a basket. */
const ICONS: Array<[RegExp, string]> = [
  [/\b(milk|cream)\b/, '🥛'],
  [/\b(cheese|cheddar|parmesan|mozzarella|feta|halloumi|paneer)\b/, '🧀'],
  [/\b(yoghurt|yogurt)\b/, '🥣'],
  [/\b(butter)\b/, '🧈'],
  [/\b(egg|eggs)\b/, '🥚'],
  [/\b(chicken|turkey|poultry)\b/, '🍗'],
  [/\b(beef|steak|mince|lamb|pork|gammon|ham|sausage|sausages|bacon|chorizo)\b/, '🥩'],
  [/\b(salmon|fish|cod|haddock|tuna|prawn|prawns|seabass|trout)\b/, '🐟'],
  [/\b(tomato|tomatoes|passata)\b/, '🍅'],
  [/\b(potato|potatoes)\b/, '🥔'],
  [/\b(carrot|carrots|parsnip|swede)\b/, '🥕'],
  [/\b(onion|onions|shallot|leek|leeks|garlic)\b/, '🧅'],
  [/\b(broccoli|cabbage|kale|spinach|lettuce|salad|greens|beans|peas|courgette|courgettes|cucumber|celery)\b/, '🥦'],
  [/\b(pepper|peppers|chilli|chilli)\b/, '🌶️'],
  [/\b(mushroom|mushrooms)\b/, '🍄'],
  [/\b(apple|apples|pear|pears)\b/, '🍎'],
  [/\b(banana|bananas)\b/, '🍌'],
  [/\b(lemon|lime|orange|oranges)\b/, '🍋'],
  [/\b(berries|strawberries|blueberries|raspberries)\b/, '🍓'],
  [/\b(bread|bagel|baguette|roll|rolls|naan|wrap|wraps|tortilla|pitta)\b/, '🍞'],
  [/\b(rice|pasta|spaghetti|noodles|couscous|flour|oats|cereal)\b/, '🌾'],
  [/\b(oil|vinegar|sauce|ketchup|mayo|mustard|stock|curry paste|paste)\b/, '🫙'],
  [/\b(coffee|tea)\b/, '☕'],
  [/\b(juice|water|squash|cola|beer|wine)\b/, '🥤'],
  [/\b(chocolate|biscuits|cake|crisps|sweets|ice cream)\b/, '🍫'],
  [/\b(salt|pepper|spice|spices|cumin|paprika|herbs|coriander|basil|parsley|mint|thyme|rosemary)\b/, '🌿'],
  [/\b(soap|washing|bin bags|toilet|tissue|kitchen roll|foil|cling)\b/, '🧻'],
];

export const itemIcon = (name: string): string => {
  const n = name.toLowerCase();
  for (const [re, icon] of ICONS) if (re.test(n)) return icon;
  return '🛒';
};
