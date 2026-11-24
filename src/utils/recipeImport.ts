import type { EffortLevel, TimeStake } from '../types';

/**
 * Turning recipes that exist elsewhere into a Dinner Spinner dish, without needing AI:
 *  - a web page that carries structured recipe data (almost every recipe site does)
 *  - pasted or uploaded text, split by its "Ingredients" and "Method" headings
 * Photos and PDFs need reading by a model; those go through the server's scanner.
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
};

const clean = (s: unknown, n = 300) =>
  String(s ?? '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, n);

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
  const out: string[] = [];
  const walk = (node: any) => {
    if (!node) return;
    if (typeof node === 'string') {
      // A single block of text: split into sentences-sized steps on line breaks or numbering.
      for (const part of node.split(/\r?\n|(?<=\.)\s+(?=\d+[.)]\s)/)) {
        const t = clean(part.replace(/^\s*(?:step\s*)?\d+[.):-]?\s*/i, ''), 400);
        if (t) out.push(t);
      }
    } else if (Array.isArray(node)) node.forEach(walk);
    else if (typeof node === 'object') {
      if (node.itemListElement) walk(node.itemListElement);
      else {
        const t = clean(node.text || node.name, 400);
        if (t) out.push(t);
      }
    }
  };
  walk(instructions);
  return out;
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

/** Reads a schema.org Recipe object (already parsed JSON) into a dish. Null if there is nothing usable. */
export function recipeFromJsonLd(json: unknown): ImportedRecipe | null {
  const node = findRecipeNode(json);
  if (!node) return null;
  const title = clean(node.name, 120);
  const ingredients = asArray(node.recipeIngredient).map((i: unknown) => clean(i, 120)).filter(Boolean).slice(0, 40);
  let steps = stepsFrom(node.recipeInstructions).slice(0, 30);
  if (!title || ingredients.length === 0) return null;
  const minutes = isoMinutes(node.totalTime) || isoMinutes(node.cookTime) + isoMinutes(node.prepTime);
  if (steps.length === 0) steps = ['Follow the original recipe (see the source link)'];
  const category = clean(asArray(node.recipeCategory)[0], 40);
  const cuisine = clean(asArray(node.recipeCuisine)[0], 40) || 'Other';
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
  };
}

/** Finds the recipe data in a web page's HTML. */
export function extractRecipeFromHtml(html: string): ImportedRecipe | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const found = recipeFromJsonLd(JSON.parse(m[1].trim()));
      if (found) return found;
    } catch {
      // not valid JSON; try the next block
    }
  }
  return null;
}

/** The readable text of a page, for when there is no structured data and the scanner can read it instead. */
export function htmlToText(html: string, max = 20_000): string {
  return clean(
    html
      .replace(/<(script|style|noscript|svg|nav|footer|header)[\s\S]*?<\/\1>/gi, ' ')
      .replace(/<\/(p|div|li|h\d|br|tr)>/gi, '\n')
      .replace(/<br\s*\/?>/gi, '\n'),
    max
  );
}

const ING_HEAD = /^(?:#+\s*)?(?:the\s+)?ingredients?\b[:\s]*$/i;
const METHOD_HEAD = /^(?:#+\s*)?(?:method|directions?|instructions?|steps?|preparation|how to (?:make|cook)|to make)\b[:\s]*$/i;
const bullet = /^\s*(?:[-*•·▪◦]|\d+[.)])\s*/;

/** Splits pasted text into a dish by its "Ingredients" and "Method" headings. Always returns a title, never throws. */
export function parseRecipeText(raw: string): ImportedRecipe {
  const lines = String(raw || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((l) => l.trim());
  const first = lines.find((l) => l && !ING_HEAD.test(l) && !METHOD_HEAD.test(l)) || 'New recipe';
  const title = clean(first.replace(/^#+\s*/, ''), 120) || 'New recipe';
  const ingredients: string[] = [];
  const steps: string[] = [];
  const intro: string[] = [];
  let mode: 'intro' | 'ing' | 'method' = 'intro';
  let skippedTitle = false;
  for (const line of lines) {
    if (!line) continue;
    if (!skippedTitle && line === first) {
      skippedTitle = true;
      continue;
    }
    if (ING_HEAD.test(line)) mode = 'ing';
    else if (METHOD_HEAD.test(line)) mode = 'method';
    else if (mode === 'ing') ingredients.push(clean(line.replace(bullet, ''), 120));
    else if (mode === 'method') steps.push(clean(line.replace(bullet, ''), 400));
    else intro.push(clean(line, 200));
  }
  // No headings at all: treat short bulleted lines as ingredients and the long sentences as the method.
  if (ingredients.length === 0 && steps.length === 0) {
    for (const line of intro.splice(0)) (bullet.test(line) || line.length < 60 ? ingredients : steps).push(line.replace(bullet, ''));
  }
  const text = lines.join(' ');
  const minutes = Number(/(\d+)\s*(?:min|minutes)\b/i.exec(text)?.[1]) || 0;
  const cleanedSteps = steps.filter(Boolean).slice(0, 30);
  return {
    title,
    description: intro.slice(0, 2).join(' ').slice(0, 300),
    cuisine: 'Other',
    timeStake: timeStakeFor(minutes),
    effort: EFFORT_HINT.test(text) ? 'one-pot' : 'standard',
    ingredients: ingredients.filter(Boolean).slice(0, 40),
    prepSteps: cleanedSteps.length ? spreadOffsets(cleanedSteps, minutes) : [],
    tags: ['Imported'],
  };
}
