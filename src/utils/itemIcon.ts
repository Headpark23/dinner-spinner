/**
 * A specific food or household emoji for a grocery item, matched by keyword.
 * Ordered from most specific to broader categories so compound names ("garlic bread",
 * "chilli oil", "peanut butter", "coconut milk") get the most helpful icon.
 * Falls back to a shopping trolley only for completely unrecognised items.
 */
const ICONS: Array<[RegExp, string]> = [
  // Specific prepared / compound items first so they aren't hijacked by generic words
  [/\b(peanut\s*butter|peanuts?|cashews?|almonds?|walnuts?|hazelnuts?|pistachios?|pecans?|pine\s*nuts?|chestnuts?|macadamia|nuts?)\b/, '🥜'],
  [/\b(ice\s*cream|gelato|sorbet)\b/, '🍨'],
  [/\b(oven\s*chips|chips|fries|wedges|hash\s*browns?)\b/, '🍟'],
  [/\b(pizza|calzone)\b/, '🍕'],
  [/\b(burger\s*buns?|brioche\s*buns?|hot\s*dog\s*rolls?|rolls?|bagels?|baguettes?|ciabatta|focaccia|sourdough|bread|loaf|breadcrumbs?|panko|croutons?)\b/, '🥖'],
  [/\b(tortillas?|wraps?|flatbreads?|naans?|pittas?|pitas?|roti|chapati|paratha|dumpling\s*wrappers?|wonton\s*wrappers?|gyoza\s*wrappers?|filo\s*pastry|puff\s*pastry|shortcrust\s*pastry|pastry|tacos?|taco\s*shells?)\b/, '🫓'],
  [/\b(croissants?|pastries)\b/, '🥐'],
  [/\b(pancakes?|waffles?|crumpets?)\b/, '🥞'],
  [/\b(sandwiches?|panini|toastie)\b/, '🥪'],
  [/\b(cakes?|muffins?|brownies?|cupcakes?|flapjacks?|donuts?|doughnuts?)\b/, '🍰'],
  [/\b(biscuits?|cookies?|crackers?|digestives?|shortbread)\b/, '🍪'],
  [/\b(chocolate|cocoa|sweets?|candy|haribo|marshmallows?)\b/, '🍫'],
  [/\b(crisps?|popcorn|pretzels?|nachos?|tortilla\s*chips?)\b/, '🍿'],

  // Chillies & hot spices (plural & varieties included)
  [/\b(chill?i(?:es|s)?|jalape[nñ]os?|habaneros?|serranos?|scotch\s*bonnets?|cayenne|gochugaru|gochujang|pul\s*biber|harissa|sriracha|tabasco|hot\s*sauce|paprika|chilli\s*flakes?)\b/, '🌶️'],

  // Specific fruits
  [/\b(pineapples?)\b/, '🍍'],
  [/\b(avocados?|guacamole)\b/, '🥑'],
  [/\b(mangoe?s?|mango\s*chutney)\b/, '🥭'],
  [/\b(coconuts?|desiccated\s*coconut)\b/, '🥥'],
  [/\b(lemons?|preserved\s*lemons?)\b/, '🍋'],
  [/\b(limes?)\b/, '🍈'],
  [/\b(oranges?|satsumas?|clementines?|tangerines?|mandarins?|grapefruits?)\b/, '🍊'],
  [/\b(apples?|cider\s*vinegar)\b/, '🍎'],
  [/\b(pears?)\b/, '🍐'],
  [/\b(bananas?|plantains?)\b/, '🍌'],
  [/\b(strawberries?|raspberries?|blackberries?|berries|cranberries?|lingonberry)\b/, '🍓'],
  [/\b(blueberries?)\b/, '🫐'],
  [/\b(grapes?|sultanas?|raisins?|currants?)\b/, '🍇'],
  [/\b(watermelons?|melons?)\b/, '🍉'],
  [/\b(peaches?|nectarines?|apricots?|plums?)\b/, '🍑'],
  [/\b(cherries?|cherry)\b/, '🍒'],
  [/\b(kiwis?)\b/, '🥝'],
  [/\b(pomegranates?|figs?|dates?|prunes?|tamarind)\b/, '🍇'],

  // Specific vegetables
  [/\b(tomato(?:es)?|passata|marinara)\b/, '🍅'],
  [/\b(aubergines?|eggplants?)\b/, '🍆'],
  [/\b(potato(?:es)?|mash|gnocchi)\b/, '🥔'],
  [/\b(sweet\s*potato(?:es)?|yams?|kumara)\b/, '🍠'],
  [/\b(carrots?|parsnips?|swedes?|turnips?|celeriac|radishes?|daikon|beetroots?)\b/, '🥕'],
  [/\b(sweetcorn|corn\s*on\s*the\s*cob|baby\s*corn|hominy|cornmeal|polenta|cornflour|cornstarch)\b/, '🌽'],
  [/\b(garlic)\b/, '🧄'],
  [/\b(onions?|shallots?|leeks?|spring\s*onions?|scallions?|chives?)\b/, '🧅'],
  [/\b(ginger|galangal)\b/, '🫚'],
  [/\b(olives?)\b/, '🫒'],
  [/\b(mushrooms?|shiitake|portobello|chestnut\s*mushrooms?)\b/, '🍄'],
  [/\b(cucumbers?|courgettes?|zucchinis?|gherkins?|pickles?|capers?)\b/, '🥒'],
  [/\b(peppers?|bell\s*peppers?|capsicum)\b/, '🫑'],
  [/\b(broccoli|cauliflower|romanesco)\b/, '🥦'],
  [/\b(lettuce|spinach|kale|cabbage|pak\s*choi|bok\s*choy|chard|rocket|watercress|salad|greens|celery|asparagus|okra|beansprouts?|kimchi|sauerkraut|nori|seaweed|edamame|peas?|mange\s*tout|sugar\s*snap|green\s*beans?|runner\s*beans?|broad\s*beans?|french\s*beans?)\b/, '🥬'],
  [/\b(pumpkins?|butternut\s*squash|squash)\b/, '🎃'],

  // Legumes, pulses & plant proteins
  [/\b(chickpeas?|lentils?|kidney\s*beans?|black\s*beans?|butter\s*beans?|cannellini|borlotti|haricot|baked\s*beans?|pinto\s*beans?|refried\s*beans?|beans|hummus|falafel|tofu|tempeh|quorn|seitan)\b/, '🫘'],

  // Meat, poultry & seafood
  [/\b(bacon|pancetta|lardons?|prosciutto|guanciale|parma\s*ham|serrano\s*ham)\b/, '🥓'],
  [/\b(chicken|turkey|duck|poultry|goose)\b/, '🍗'],
  [/\b(beef|steak|mince|lamb|pork|gammon|ham|sausages?|bangers|chorizo|morcilla|salami|pepperoni|veal|venison|brisket|ribs?|meatballs?|burgers?|kebabs?)\b/, '🥩'],
  [/\b(prawns?|shrimps?|langoustines?|scampi|crab|lobster)\b/, '🦐'],
  [/\b(clams?|mussels?|oysters?|scallops?|cockles?|squid|calamari|octopus)\b/, '🦪'],
  [/\b(salmon|fish|cod|haddock|tuna|sea\s*bass|seabass|trout|mackerel|sardines?|anchovies?|plaice|halibut|hake|pollock|kippers?|smoked\s*fish|fish\s*fingers?)\b/, '🐟'],

  // Dairy & eggs
  [/\b(yoghurt|yogurt|kefir|skyr)\b/, '🥣'],
  [/\b(cheese|cheddar|parmesan|mozzarella|feta|halloumi|paneer|pecorino|gruy[eè]re|brie|camembert|stilton|ricotta|mascarpone|gouda|emmental|manchego|burrata|cottage\s*cheese|cream\s*cheese|philadelphia)\b/, '🧀'],
  [/\b(butter|ghee|margarine|spread|lard|suet)\b/, '🧈'],
  [/\b(milk|cream|cr[eè]me\s*fra[iî]che|buttermilk|oat\s*milk|almond\s*milk|soy\s*milk|soya\s*milk|evaporated\s*milk|condensed\s*milk)\b/, '🥛'],
  [/\b(eggs?)\b/, '🥚'],

  // Pasta, rice, noodles & grains
  [/\b(pasta|spaghetti|penne|rigatoni|fusilli|tagliatelle|linguine|fettuccine|lasagn[ea]|macaroni|orzo|noodles?|ramen|udon|vermicelli|ravioli|tortellini|cannelloni)\b/, '🍝'],
  [/\b(rice|risotto|basmati|jasmine|arborio|paella\s*rice)\b/, '🍚'],
  [/\b(couscous|bulgur|quinoa|flour|oats?|porridge|cereal|granola|muesli|barley|farro|freekeh|semolina|yeast|baking\s*powder|bicarbonate|bicarb)\b/, '🌾'],

  // Sweeteners, jars, sauces & condiments
  [/\b(honey|maple\s*syrup|golden\s*syrup|treacle|agave|molasses|jam|marmalade|preserve)\b/, '🍯'],
  [/\b(sugar|icing\s*sugar|caster\s*sugar|demerara|muscovado|sweetener)\b/, '🍬'],
  [/\b(oil|vinegar|sauce|ketchup|mayo|mayonnaise|mustard|stock|broth|dashi|gravy|paste|curry\s*paste|miso|tahini|pesto|chutney|relish|salsa|dip|dressing|doubanjiang|kecap\s*manis|hoisin|teriyaki|worcestershire|soy|tamari|fish\s*sauce|oyster\s*sauce|mirin)\b/, '🫙'],

  // Herbs, spices & seasonings
  [/\b(salt|peppercorns?|black\s*pepper|white\s*pepper|sichuan\s*pepper|seasoning)\b/, '🧂'],
  [/\b(spice|spices|cumin|coriander|cilantro|basil|parsley|mint|thyme|rosemary|oregano|sage|dill|tarragon|bay\s*lea(?:f|ves)|curry\s*lea(?:f|ves)|curry\s*powder|garam\s*masala|biryani\s*masala|masala|turmeric|cinnamon|cardamom|nutmeg|allspice|cloves?|star\s*anise|fennel\s*seeds?|caraway|fenugreek|kasoori\s*methi|saffron|sumac|za'?atar|ras\s*el\s*hanout|berbere|five\s*spice|lemongrass|herbs?|mixed\s*herbs?)\b/, '🌿'],

  // Drinks
  [/\b(coffee|espresso|tea|matcha|hot\s*chocolate)\b/, '☕'],
  [/\b(beer|lager|ale|stout|ipa|cider)\b/, '🍺'],
  [/\b(wine|prosecco|champagne|sherry|port|sake|gin|vodka|rum|whisky|whiskey)\b/, '🍷'],
  [/\b(juice|water|squash|cordial|cola|coke|lemonade|soda|tonic|smoothie|kombucha|fizzy)\b/, '🥤'],

  // Household & toiletries
  [/\b(soap|washing|detergent|bleach|cleaner|spray|sponge|scourer|bin\s*bags?|toilet|tissue|kitchen\s*roll|foil|cling\s*film|baking\s*paper|parchment|dishwasher|shampoo|toothpaste|deodorant|nappies|wipes)\b/, '🧻'],
];

export const itemIcon = (name: string): string => {
  const n = name.toLowerCase();
  for (const [re, icon] of ICONS) if (re.test(n)) return icon;
  return '🛒';
};
