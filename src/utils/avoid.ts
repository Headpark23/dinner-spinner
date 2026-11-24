/**
 * Matching for the "avoid" list. People type "mushrooms" or "prawns" (plural) while recipes say "mushroom" or
 * "king prawn", so a term is also tried without its plural ending. Matching is by text within the ingredient, as it
 * always was ("pork" catches "pork belly").
 */
const clean = (s: string) => s.trim().toLowerCase();

/** The forms of a term to look for: as typed, plus the singular. */
export function termForms(term: string): string[] {
  const t = clean(term);
  if (t.length < 3) return [];
  const forms = new Set([t]);
  if (t.endsWith('ies') && t.length > 4) forms.add(t.slice(0, -3) + 'y');
  if (t.endsWith('oes') && t.length > 4) forms.add(t.slice(0, -2)); // tomatoes, potatoes
  if (t.endsWith('es') && t.length > 4) forms.add(t.slice(0, -2));
  if (t.endsWith('s') && !t.endsWith('ss') && t.length > 3) forms.add(t.slice(0, -1));
  return [...forms];
}

/** Does this one piece of text mention the term? */
export function mentions(text: string, term: string): boolean {
  const lower = text.toLowerCase();
  return termForms(term).some((f) => lower.includes(f));
}

/** Does any of the texts (a title, its ingredients) mention any of the terms? */
export function mentionsAny(texts: string[], terms: string[]): boolean {
  const all = terms.flatMap(termForms);
  if (all.length === 0) return false;
  return texts.some((t) => {
    const lower = t.toLowerCase();
    return all.some((f) => lower.includes(f));
  });
}
