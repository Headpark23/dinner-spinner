import type { EffortLevel, Meal, TimeStake } from '../types';

/**
 * Turning recipes that exist elsewhere into a Dinner Spinner dish, without needing AI:
 *  - a web page that carries structured recipe data (almost every recipe site does)
 *  - pasted or uploaded text, split by its "Ingredients" and "Method" headings (or inferred cleanly)
 *  - self-healing cleanup for recipes whose sentences or comma-clauses were split into separate checkboxes
 */
export type ImportedRecipe = {
  title: string;
  description: string;
  cuisine: string;
  timeStake: TimeStake;
  effort: EffortLevel;
  ingredients: string[];
  prepSteps: string[];
  tags: string[];
  imageUrl?: string;
};

const decodeEntities = (raw: string) =>
  raw
    .replace(/&nbsp;|&#160;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#0?39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&frac12;|&#189;/gi, '½')
    .replace(/&frac14;|&#188;/gi, '¼')
    .replace(/&frac34;|&#190;/gi, '¾');

const clean = (s: unknown, n = 300) =>
  decodeEntities(String(s ?? '').replace(/<[^>]+>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n);

const stripIngBullet = (s: string) =>
  s.replace(/^\s*(?:[▢☐☑✓✔✕✖•·▪▫◦‣⁃]|[-*–—](?=\s))\s*/u, '').trim();

const stripStepPrefix = (s: string) =>
  s.replace(/^\s*(?:[▢☐☑✓✔✕✖•·▪▫◦‣⁃]|[-*–—](?=\s)|(?:step\s*)?\d+\s*[.):-]\s*)/iu, '').trim();

const PREP_MODIFIER_WORDS = new Set([
  'finely',
  'roughly',
  'thinly',
  'thickly',
  'freshly',
  'lightly',
  'well',
  'coarsely',
  'very',
  'chopped',
  'diced',
  'sliced',
  'minced',
  'crushed',
  'grated',
  'peeled',
  'drained',
  'rinsed',
  'beaten',
  'melted',
  'softened',
  'thawed',
  'defrosted',
  'halved',
  'quartered',
  'trimmed',
  'cored',
  'deseeded',
  'seeded',
  'pitted',
  'torn',
  'shredded',
  'julienned',
  'cubed',
  'mashed',
  'whisked',
  'sifted',
  'toasted',
  'warmed',
  'chilled',
  'cooled',
  'divided',
  'separated',
  'boneless',
  'skinless',
  'seedless',
  'rindless',
  'unsalted',
  'salted',
  'streaky',
  'optional',
  'and',
  'or',
  'into',
  'in',
  'half',
  'lengthways',
  'crossways',
  'pieces',
  'chunks',
  'strips',
  'wedges',
  'cubes',
  'rings',
  'florets',
  'bite',
  'sized',
  'small',
  'large',
  'medium',
  'thin',
  'thick',
]);

/** True when `s` is a dangling prep/serving note ("finely chopped", "drained", "cut into chunks") rather than an ingredient. */
export function isPrepFragment(raw: string): boolean {
  const s = stripIngBullet(raw).replace(/\.$/, '').trim();
  if (!s || s.length > 48 || /^\d|^[½⅓⅔¼¾⅛]/.test(s)) return false;
  if (
    /^(?:cut|sliced|chopped|diced|torn|broken|divided|halved|quartered)\s+(?:in\s+half|into\b|lengthways\b|crossways\b|thinly\b|finely\b|roughly\b)/i.test(
      s
    )
  ) {
    return true;
  }
  if (
    /^(?:to\s+(?:taste|serve|garnish)|for\s+(?:serving|garnishing|dusting|greasing|frying|drizzling)|plus\s+(?:extra|more)\b|at\s+room\s+temperature|optional|if\s+using|or\s+to\s+taste|with\s+(?:its|their)\s+juices?|in\s+(?:water|oil|brine|natural\s+juice))\b/i.test(
      s
    )
  ) {
    return true;
  }
  const words = s
    .toLowerCase()
    .split(/[\s,/&()-]+/)
    .filter(Boolean);
  return words.length > 0 && words.every((w) => PREP_MODIFIER_WORDS.has(w));
}

const COOK_VERB_START =
  /^(?:preheat|heat|warm|melt|fry|sauté|saute|sear|brown|cook|boil|simmer|poach|steam|bake|roast|grill|toast|stir|whisk|beat|mix|combine|toss|fold|add|pour|tip|transfer|spoon|ladle|drain|strain|season|taste|serve|divide|plate|garnish|scatter|sprinkle|drizzle|arrange|layer|place|put|set|cover|remove|take|leave|rest|let|allow|bring|reduce|turn|flip|crack|blitz|blend|meanwhile|once|when|finally|next|then)\b/i;

/** True when a line is clearly a cooking instruction sentence rather than an ingredient. */
export function looksLikeMethodSentence(raw: string): boolean {
  const core = stripStepPrefix(raw).replace(/\s*\(-\d+m\)\s*$/, '').trim();
  if (!core) return false;
  if (core.length > 95) return true;
  if (/[.!?]\s+[A-Z]/.test(core)) return true;
  if (
    /\b(?:over\s+(?:a\s+)?(?:low|medium|high|gentle)\s+heat|bring\s+to\s+(?:the\s+)?(?:boil|simmer)|preheat\s+(?:the\s+)?oven|until\s+(?:golden|softened|cooked\s+through|tender|bubbling|melted|fragrant|translucent)|(?:cook|simmer|bake|roast|fry|boil)\s+for\s+\d+\s*(?:[-–]\s*\d+\s*)?(?:min|minutes|hr|hours|sec|seconds))\b/i.test(
      core
    )
  ) {
    return true;
  }
  const words = core.split(/\s+/);
  if (words.length >= 5 && COOK_VERB_START.test(core) && !/^\d|^[½⅓⅔¼¾]/.test(core)) {
    return true;
  }
  return false;
}

const META_NOISE =
  /^(?:serves?\s*:?\s*\d+|servings?\s*:?\s*\d+|makes?\s*:?\s*\d+|prep(?:\s*time)?\s*:?\s*\d+|cook(?:\s*time)?\s*:?\s*\d+|total(?:\s*time)?\s*:?\s*\d+|ready\s+in\s+\d+|difficulty\s*:|rating\s*:|\d+\s*ratings?\b)/i;
const SUB_HEAD = /^(?:for\s+the\s+[\w\s&-]{2,32}|to\s+(?:serve|garnish|finish|assemble))[:\s]*$/i;
const STOP_HEAD = /^(?:#+\s*)?(?:nutrition(?:al)?(?:\s+info(?:rmation)?)?|per\s+serving|calories|storage|chef'?s?\s+notes?|recipe\s+notes?|tips?\s+and\s+tricks|leave\s+a\s+(?:comment|reply)|related\s+recipes)\b[:\s]*$/i;

/** Splits long multi-sentence paragraphs into individual sentence steps without breaking decimals or abbreviations. */
function splitLongParagraph(text: string): string[] {
  const trimmed = text.trim();
  if (trimmed.length <= 210) return trimmed ? [trimmed] : [];
  const parts = trimmed
    .split(/(?<=[.!?])\s+(?=[A-Z])/)
    .map((p) => p.trim())
    .filter(Boolean);
  const merged: string[] = [];
  for (const p of parts) {
    const prev = merged[merged.length - 1];
    if (prev && /\b(?:approx|min|mins|hr|hrs|sec|tsp|tbsp|oz|lb|st|no|dr|mr|mrs|e\.g|i\.e)\.$/i.test(prev)) {
      merged[merged.length - 1] = `${prev} ${p}`;
    } else if (prev && prev.length < 45 && prev.length + p.length < 180) {
      merged[merged.length - 1] = `${prev} ${p}`;
    } else {
      merged.push(p);
    }
  }
  return merged;
}

/** Joins mid-sentence soft line-wraps and splits overly long multi-sentence blocks into crisp, individual steps. */
export function normalizeStepLines(rawSteps: string[]): string[] {
  const joined: string[] = [];
  for (const raw of rawSteps) {
    const hadExplicitNumber = /^\s*(?:step\s*)?\d+\s*[.):-]\s*/i.test(raw);
    const timingMatch = raw.match(/\s*(\(-\d+m\))\s*$/);
    const core = clean(stripStepPrefix(raw).replace(/\s*\(-\d+m\)\s*$/, ''), 600);
    if (!core || META_NOISE.test(core) || SUB_HEAD.test(core)) continue;
    const prev = joined[joined.length - 1];
    const prevCore = prev ? prev.replace(/\s*\(-\d+m\)\s*$/, '') : '';
    const prevOpen = prevCore && !/[.!?)]$/.test(prevCore);
    if (
      prev &&
      !hadExplicitNumber &&
      !timingMatch &&
      (prevOpen || /^[a-z]/.test(core)) &&
      prevCore.length + core.length < 360
    ) {
      const prevTiming = prev.match(/\s*(\(-\d+m\))\s*$/)?.[1] || '';
      joined[joined.length - 1] = `${prevCore} ${core}${prevTiming}`;
    } else {
      joined.push(timingMatch ? `${core} ${timingMatch[1]}` : core);
    }
  }

  const out: string[] = [];
  for (const step of joined) {
    const timing = step.match(/\s*(\(-\d+m\))\s*$/)?.[1];
    const core = step.replace(/\s*\(-\d+m\)\s*$/, '').trim();
    if (timing) {
      out.push(`${core} ${timing}`);
    } else {
      out.push(...splitLongParagraph(core));
    }
  }
  return out.filter(Boolean).slice(0, 30);
}

/**
 * Cleans an ingredient list, stitching comma-shredded prep notes back onto their ingredient
 * and rescuing any cooking sentences that accidentally landed in the ingredients box.
 */
export function normalizeIngredientsAndSteps(
  rawIngredients: string[],
  rawSteps: string[]
): { ingredients: string[]; steps: string[] } {
  const ingredients: string[] = [];
  const leakedSteps: string[] = [];
  let inLeakedSentence = false;

  for (const raw of rawIngredients) {
    const s = clean(stripIngBullet(raw), 350);
    if (!s || META_NOISE.test(s) || SUB_HEAD.test(s)) continue;

    if (looksLikeMethodSentence(s)) {
      const prevLeak = leakedSteps[leakedSteps.length - 1];
      if (inLeakedSentence && prevLeak && !/[.!?]$/.test(prevLeak) && /^[a-z]/.test(s)) {
        leakedSteps[leakedSteps.length - 1] = `${prevLeak}, ${s}`;
      } else {
        leakedSteps.push(stripStepPrefix(s));
      }
      inLeakedSentence = !/[.!?]$/.test(s);
      continue;
    }

    // Continuation clause of a comma-split cooking sentence ("add the garlic", "then simmer for 10 mins")
    if (
      inLeakedSentence &&
      leakedSteps.length > 0 &&
      !/^\d|^[½⅓⅔¼¾]/.test(s) &&
      (/^[a-z]/.test(s) || /^(?:and|then|until|before|after|while|stirring|cooking)\b/i.test(s))
    ) {
      leakedSteps[leakedSteps.length - 1] = `${leakedSteps[leakedSteps.length - 1]}, ${s}`;
      inLeakedSentence = !/[.!?]$/.test(s);
      continue;
    }
    inLeakedSentence = false;

    // Stitch prep-only fragments ("finely chopped", "drained", "cut into chunks") onto the previous ingredient
    if (ingredients.length > 0 && (isPrepFragment(s) || /[,(\-–]$|\b(?:and|or|with)$/i.test(ingredients[ingredients.length - 1]))) {
      const prev = ingredients[ingredients.length - 1].replace(/,\s*$/, '');
      const sep = /[(]$|\b(?:and|or|with)$/i.test(prev) ? ' ' : ', ';
      ingredients[ingredients.length - 1] = `${prev}${sep}${s}`.slice(0, 140);
      continue;
    }

    ingredients.push(s.slice(0, 140));
  }

  const isPlaceholderSteps =
    rawSteps.length === 0 ||
    (rawSteps.length === 4 && rawSteps[0]?.startsWith('Prep and chop everything (-20m)'));

  const combinedSteps = isPlaceholderSteps && leakedSteps.length > 0
    ? leakedSteps
    : [...rawSteps, ...leakedSteps];

  return {
    ingredients: ingredients.slice(0, 40),
    steps: normalizeStepLines(combinedSteps),
  };
}

/** Parses the Add/Edit Recipe Ingredients textarea: one per line when multiline, never shredding commas inside lines. */
export function parseIngredientInput(text: string): string[] {
  const trimmed = String(text || '').trim();
  if (!trimmed) return [];
  const rawLines = trimmed.includes('\n')
    ? trimmed.split(/\r?\n/)
    : trimmed.split(/,(?!\s*\d)/);
  return normalizeIngredientsAndSteps(rawLines, []).ingredients;
}

/** Splits an ingredient line into optional leading quantity, main item name, and trailing comma prep note for display. */
export function splitIngredientDisplay(raw: string): { qty: string; item: string; prep: string } {
  const s = stripIngBullet(raw);
  const qtyMatch = s.match(
    /^((?:\d+\s*x\s*)?(?:\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?(?:\s*[-–]\s*\d+(?:\.\d+)?)?[½¼¾⅓⅔]?|[½¼¾⅓⅔])(?:\s*(?:kg|g|mg|ml|cl|l|litres?|liters?|tsp|tbsp|tablespoons?|teaspoons?|cups?|oz|lbs?|tins?|cans?|jars?|packets?|packs?|bunche?s?|cloves?|slices?|pieces?|sprigs?|handfuls?|pinche?s?|knobs?)\b\.?)?(?:\s+of\b)?)\s+(.+)$/i
  );
  const qty = qtyMatch ? qtyMatch[1].trim() : '';
  const rest = qtyMatch ? qtyMatch[2].trim() : s;
  const commaIdx = rest.indexOf(',');
  if (commaIdx > 1 && commaIdx < rest.length - 1) {
    return {
      qty,
      item: rest.slice(0, commaIdx).trim(),
      prep: rest.slice(commaIdx + 1).trim(),
    };
  }
  return { qty, item: rest, prep: '' };
}

/** Self-heals an already-saved user/imported recipe if its ingredients or steps were split into fragments. */
export function repairImportedMeal(meal: Meal): Meal {
  const isCustomOrImported =
    meal.source === 'own' ||
    meal.source === 'scanned' ||
    meal.tags?.some((t) => /imported|website|family recipe|scanned|ai drafted/i.test(t));
  if (!isCustomOrImported) return meal;

  const { ingredients, steps } = normalizeIngredientsAndSteps(meal.ingredients || [], meal.prepSteps || []);
  if (ingredients.length === 0) return meal;

  const minsHint = meal.timeStake === '20m' ? 20 : meal.timeStake === '30m' ? 30 : meal.timeStake === '60m' ? 60 : 90;
  const prepSteps = steps.length > 0 ? spreadOffsets(steps, minsHint) : meal.prepSteps;
  const cuisine =
    !meal.cuisine || meal.cuisine.trim().toLowerCase() === 'other'
      ? inferCuisine(meal.title, ingredients)
      : meal.cuisine;

  if (
    cuisine === meal.cuisine &&
    JSON.stringify(ingredients) === JSON.stringify(meal.ingredients) &&
    JSON.stringify(prepSteps) === JSON.stringify(meal.prepSteps)
  ) {
    return meal;
  }
  return { ...meal, cuisine, ingredients, prepSteps };
}

/** ISO-8601 durations like PT1H15M, as used by structured recipe data. */
export function isoMinutes(v: unknown): number {
  const m = /^P(?:T)?(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i.exec(String(v || '').trim());
  if (!m) return 0;
  return (Number(m[1]) || 0) * 1440 + (Number(m[2]) || 0) * 60 + (Number(m[3]) || 0);
}

export function timeStakeFor(minutes: number): TimeStake {
  if (!minutes) return '30m';
  if (minutes <= 20) return '20m';
  if (minutes <= 30) return '30m';
  if (minutes <= 60) return '60m';
  return 'all-day';
}

const EFFORT_HINT = /one[- ]?pot|one[- ]?pan|traybake|sheet[- ]?pan|slow[- ]?cooker/i;

/** Adds "(-Nm)" timings, spread from the cooking time down to serving, to steps that have none. */
export function spreadOffsets(steps: string[], totalMinutes: number): string[] {
  const total = Math.max(10, Math.min(totalMinutes || 30, 240));
  const n = steps.length;
  return steps.map((step, i) => {
    if (/\(-\d+m\)/.test(step)) return step;
    const offset = n <= 1 ? 0 : Math.round((total * (n - 1 - i)) / (n - 1));
    return `${step.replace(/\s*\(-?\d+m\)\s*$/, '')} (-${offset}m)`;
  });
}

const asArray = <T,>(v: T | T[] | undefined | null): T[] => (v === undefined || v === null ? [] : Array.isArray(v) ? v : [v]);

function stepsFrom(instructions: unknown): string[] {
  const rawOut: string[] = [];
  const walk = (node: any) => {
    if (!node) return;
    if (typeof node === 'string') {
      // Split on blank lines or explicit numbered steps; normalizeStepLines joins soft wraps & splits giant blocks.
      for (const part of node.split(/\r?\n\s*\r?\n|\r?\n(?=\s*(?:step\s*)?\d+[.):-]\s)|(?<=[.!?])\s+(?=(?:step\s*)?\d+[.)]\s)/i)) {
        for (const line of part.split(/\r?\n/)) {
          const t = line.trim();
          if (t) rawOut.push(t);
        }
      }
    } else if (Array.isArray(node)) node.forEach(walk);
    else if (typeof node === 'object') {
      if (node.itemListElement) walk(node.itemListElement);
      else {
        const t = clean(node.text || node.name, 600);
        if (t) rawOut.push(t);
      }
    }
  };
  walk(instructions);
  return normalizeStepLines(rawOut);
}

const hasType = (node: any, type: string) => asArray(node?.['@type']).some((t: unknown) => String(t).toLowerCase() === type.toLowerCase());

function findRecipeNode(json: any): any | null {
  if (!json || typeof json !== 'object') return null;
  if (Array.isArray(json)) {
    for (const j of json) {
      const r = findRecipeNode(j);
      if (r) return r;
    }
    return null;
  }
  if (hasType(json, 'Recipe')) return json;
  if (json['@graph']) return findRecipeNode(json['@graph']);
  return null;
}

function extractImageUrl(raw: unknown): string | undefined {
  if (!raw) return undefined;
  if (typeof raw === 'string') {
    const u = raw.trim();
    return /^https:\/\/\S+/i.test(u) && !/\.svg(\?|$)|logo|avatar|icon/i.test(u) ? u : undefined;
  }
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const found = extractImageUrl(item);
      if (found) return found;
    }
    return undefined;
  }
  if (typeof raw === 'object') {
    const obj = raw as Record<string, unknown>;
    return extractImageUrl(obj.url || obj.contentUrl || obj['@id']);
  }
  return undefined;
}

const CUISINE_HINTS: [RegExp, string][] = [
  [/\b(pasta|spaghetti|rigatoni|penne|lasagn[ea]|risotto|gnocchi|parmigiana|carbonara|pesto|orzo|bolognese|mascarpone|parmesan)\b/i, 'Italian'],
  [/\b(tikka|masala|korma|biryani|paneer|dal|dhal|tandoori|garam\s+masala|turmeric|cumin|naan|curry\s+leaves|dopiaza|rogan)\b/i, 'Indian'],
  [/\b(tacos?|fajitas?|enchiladas?|burritos?|quesadillas?|chipotle|jalape[nñ]o|tortillas?|salsa|guacamole)\b/i, 'Mexican'],
  [/\b(pad\s+thai|lemongrass|galangal|fish\s+sauce|thai\s+basil|massaman|tom\s+yum|green\s+curry|red\s+curry)\b/i, 'Thai'],
  [/\b(soy\s+sauce|hoisin|oyster\s+sauce|five[- ]spice|chow\s+mein|szechuan|sichuan|wonton|bok\s+choy|pak\s+choi|char\s+siu)\b/i, 'Chinese'],
  [/\b(miso|mirin|teriyaki|ramen|udon|katsu|dashi|nori|edamame|gyoza)\b/i, 'Japanese'],
  [/\b(gochujang|kimchi|bulgogi|bibimbap|sesame\s+oil)\b/i, 'Korean'],
  [/\b(halloumi|feta|souvlaki|moussaka|tzatziki|oregano|spanakopita|gyros)\b/i, 'Greek'],
  [/\b(chorizo|paella|paprika|manchego|gambas|saffron)\b/i, 'Spanish'],
  [/\b(harissa|tagine|couscous|ras\s+el\s+hanout|preserved\s+lemon)\b/i, 'Moroccan'],
  [/\b(tahini|sumac|za'?atar|shakshuka|falafel|shawarma|pomegranate)\b/i, 'Middle Eastern'],
  [/\b(bourguignon|coq\s+au\s+vin|shallots?|dijon|creme\s+fraiche|crème\s+fraîche|quiche|ratatouille)\b/i, 'French'],
  [/\b(yorkshire|sausages?|mash|shepherd'?s\s+pie|cottage\s+pie|toad\s+in\s+the\s+hole|hotpot|cheddar|gravy)\b/i, 'British'],
];

export function inferCuisine(title: string, ingredients: string[]): string {
  const hay = `${title} ${ingredients.join(' ')}`;
  for (const [re, name] of CUISINE_HINTS) {
    if (re.test(hay)) return name;
  }
  return 'British';
}

/** Reads a schema.org Recipe object (already parsed JSON) into a dish. Null if there is nothing usable. */
export function recipeFromJsonLd(json: unknown): ImportedRecipe | null {
  const node = findRecipeNode(json);
  if (!node) return null;
  const title = clean(node.name, 120);
  const rawIngs = asArray(node.recipeIngredient).map((i: unknown) => clean(i, 160)).filter(Boolean);
  const rawSteps = stepsFrom(node.recipeInstructions);
  const normalized = normalizeIngredientsAndSteps(rawIngs, rawSteps);
  const ingredients = normalized.ingredients;
  let steps = normalized.steps.slice(0, 30);
  if (!title || ingredients.length === 0) return null;
  const minutes = isoMinutes(node.totalTime) || isoMinutes(node.cookTime) + isoMinutes(node.prepTime);
  if (steps.length === 0) steps = ['Follow the original recipe (see the source link)'];
  const category = clean(asArray(node.recipeCategory)[0], 40);
  const rawCuisine = clean(asArray(node.recipeCuisine)[0], 40);
  const cuisine = rawCuisine && rawCuisine.toLowerCase() !== 'other' ? rawCuisine : inferCuisine(title, ingredients);
  const imageUrl = extractImageUrl(node.image || node.thumbnailUrl);
  const keywords = clean(asArray(node.keywords).join(','), 200)
    .split(',')
    .map((k) => k.trim())
    .filter(Boolean)
    .slice(0, 3);
  return {
    title,
    description: clean(node.description, 300),
    cuisine: cuisine.replace(/\b\w/g, (c) => c.toUpperCase()),
    timeStake: timeStakeFor(minutes),
    effort: EFFORT_HINT.test(`${title} ${keywords.join(' ')} ${clean(node.description)}`) ? 'one-pot' : steps.length > 10 ? 'chef-mode' : 'standard',
    ingredients,
    prepSteps: spreadOffsets(steps, minutes),
    tags: ['Imported', ...(category ? [category] : []), ...keywords].slice(0, 5),
    ...(imageUrl ? { imageUrl } : {}),
  };
}

/** Finds the recipe data in a web page's HTML (including og:image fallback if JSON-LD omitted image). */
export function extractRecipeFromHtml(html: string): ImportedRecipe | null {
  const ogMatch =
    /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i.exec(html) ||
    /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i.exec(html);
  const ogImage = extractImageUrl(ogMatch?.[1]);

  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const found = recipeFromJsonLd(JSON.parse(m[1].trim()));
      if (found) return !found.imageUrl && ogImage ? { ...found, imageUrl: ogImage } : found;
    } catch {
      // not valid JSON; try the next block
    }
  }
  return null;
}

/** Readable multi-line text of a page (preserving paragraph & list line breaks!) when structured data is missing. */
export function htmlToText(html: string, max = 20_000): string {
  const stripped = decodeEntities(
    String(html || '')
      .replace(/<(script|style|noscript|svg|nav|footer|header|aside|form)[\s\S]*?<\/\1>/gi, '\n')
      .replace(/<(li)\b[^>]*>/gi, '\n- ')
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n')
      .replace(/<[^>]+>/g, ' ')
  );
  return stripped
    .split(/\r?\n/)
    .map((line) => line.replace(/[ \t]+/g, ' ').trim())
    .filter(Boolean)
    .join('\n')
    .slice(0, max);
}

const ING_HEAD = /^(?:#+\s*)?(?:the\s+)?(?:ingredients?|what\s+you(?:'ll)?\s+need|shopping\s+list)\b(?:\s*\([^)]*\))?[:\s—–-]*$/i;
const ING_INLINE = /^(?:#+\s*)?(?:the\s+)?ingredients?\s*:\s*(.+)$/i;
const METHOD_HEAD =
  /^(?:#+\s*)?(?:the\s+)?(?:method|directions?|instructions?|cooking\s+instructions?|steps?|preparation|how\s+to\s+(?:make|cook)(?:\s+it)?|to\s+(?:make|cook))\b(?:\s*\([^)]*\))?[:\s—–-]*$/i;
const METHOD_INLINE = /^(?:#+\s*)?(?:method|directions?|instructions?|steps?)\s*:\s*(.+)$/i;
const bullet = /^\s*(?:[-*•·▪▫◦‣▢☐☑✓✔]|\d+[.)])\s*/u;
const numberedStep = /^\s*(?:step\s*)?\d+\s*[.):-]\s+/i;

/** Splits pasted or extracted text into a tidy dish. Separates ingredients from method sentences cleanly. */
export function parseRecipeText(raw: string): ImportedRecipe {
  const lines = String(raw || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim());
  const first = lines.find((l) => l && !ING_HEAD.test(l) && !METHOD_HEAD.test(l) && !META_NOISE.test(l)) || 'New recipe';
  const title = clean(first.replace(/^#+\s*/, ''), 120) || 'New recipe';
  const rawIngredients: string[] = [];
  const rawSteps: string[] = [];
  const intro: string[] = [];
  let mode: 'intro' | 'ing' | 'method' = 'intro';
  let skippedTitle = false;

  for (const line of lines) {
    if (!line) continue;
    if (!skippedTitle && line === first) {
      skippedTitle = true;
      continue;
    }
    if (STOP_HEAD.test(line)) break;
    if (META_NOISE.test(line)) continue;

    if (ING_HEAD.test(line)) {
      mode = 'ing';
      continue;
    }
    const ingInline = ING_INLINE.exec(line);
    if (ingInline) {
      mode = 'ing';
      rawIngredients.push(ingInline[1]);
      continue;
    }
    if (METHOD_HEAD.test(line)) {
      mode = 'method';
      continue;
    }
    const methodInline = METHOD_INLINE.exec(line);
    if (methodInline) {
      mode = 'method';
      rawSteps.push(methodInline[1]);
      continue;
    }
    if (SUB_HEAD.test(line)) {
      if (mode === 'intro') mode = 'ing';
      continue;
    }

    // Automatic transition from ingredients to method when numbered steps or clear instruction sentences begin
    if (mode === 'ing' && rawIngredients.length >= 2 && (numberedStep.test(line) || looksLikeMethodSentence(line))) {
      mode = 'method';
    }

    if (mode === 'ing') rawIngredients.push(line);
    else if (mode === 'method') rawSteps.push(line);
    else intro.push(clean(line, 240));
  }

  // No explicit headings: classify numbered/cooking sentences as method and short/quantified lines as ingredients.
  if (rawIngredients.length === 0 && rawSteps.length === 0) {
    for (const line of intro.splice(0)) {
      if (numberedStep.test(line) || looksLikeMethodSentence(line) || line.length >= 65) {
        rawSteps.push(line);
      } else if (bullet.test(line) || line.length < 65) {
        rawIngredients.push(line.replace(bullet, ''));
      } else {
        rawSteps.push(line);
      }
    }
  }

  const normalized = normalizeIngredientsAndSteps(rawIngredients, rawSteps);
  const text = lines.join(' ');
  const minutes = Number(/(\d+)\s*(?:min|mins|minutes)\b/i.exec(text)?.[1]) || 0;
  return {
    title,
    description: intro.filter((l) => !META_NOISE.test(l)).slice(0, 2).join(' ').slice(0, 300),
    cuisine: inferCuisine(title, normalized.ingredients),
    timeStake: timeStakeFor(minutes),
    effort: EFFORT_HINT.test(text) ? 'one-pot' : normalized.steps.length > 10 ? 'chef-mode' : 'standard',
    ingredients: normalized.ingredients,
    prepSteps: normalized.steps.length ? spreadOffsets(normalized.steps, minutes) : [],
    tags: ['Imported'],
  };
}
