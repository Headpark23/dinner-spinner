/**
 * Finds a freely licensed photo of a dish on Wikimedia Commons (the same place the built-in dishes' photos came from),
 * with the credit the licence asks for. Only the dish's name is sent. No key is needed.
 */
export interface FoundPhoto {
  url: string;
  credit: { author: string; license: string; licenseUrl: string; source: string };
}

const API = 'https://commons.wikimedia.org/w/api.php';
const UA = 'DinnerSpinner/1.0 (family dinner app; recipe photos from Wikimedia Commons)';

/** Licences that allow reuse with credit. */
const OK_LICENCE = /^(cc[ -]?by(-sa)?|cc0|public domain|pd)/i;

const stripTags = (s: string) =>
  s
    .replace(/<[^>]+>/g, '')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;/g, "'")
    .trim();

/** The searches to try, most specific first: the full name, then the last words ("Nan's Jerk Chicken" becomes "Jerk Chicken"). */
export function photoQueries(title: string): string[] {
  const words = title
    .replace(/[’']s\b/g, '')
    .replace(/[^\p{L}\p{N}\s&-]/gu, ' ')
    .replace(/\s+&\s+|\s+(with|and|in|on)\s+/gi, ' ')
    .split(/\s+/)
    .filter(Boolean);
  const out: string[] = [];
  const add = (w: string[]) => {
    const q = w.join(' ').trim();
    if (q.length >= 4 && !out.includes(q)) out.push(q);
  };
  add(words.slice(0, 5));
  if (words.length > 2) add(words.slice(-2));
  return out.slice(0, 2);
}

export function createPhotoSearch(doFetch: typeof fetch = fetch) {
  async function search(query: string): Promise<FoundPhoto | null> {
    const url =
      `${API}?action=query&format=json&generator=search&gsrnamespace=6&gsrlimit=8&gsrsearch=${encodeURIComponent(query + ' filetype:bitmap')}` +
      `&prop=imageinfo&iiprop=url|size|mime|extmetadata&iiurlwidth=640`;
    const res = await doFetch(url, { headers: { 'User-Agent': UA }, signal: AbortSignal.timeout(6000) });
    if (!res.ok) return null;
    const json: any = await res.json().catch(() => null);
    const pages: any[] = Object.values(json?.query?.pages || {});
    pages.sort((a, b) => (a.index || 0) - (b.index || 0));
    const words = query.toLowerCase().split(/\s+/);
    for (const page of pages) {
      const info = page.imageinfo?.[0];
      if (!info || !/^image\/(jpeg|png)$/.test(info.mime || '') || (info.width || 0) < 500) continue;
      const meta = info.extmetadata || {};
      const license = stripTags(String(meta.LicenseShortName?.value || ''));
      if (!OK_LICENCE.test(license)) continue;
      // The file's own name must mention the dish, so a stray match doesn't slip through.
      const name = String(page.title || '').toLowerCase();
      if (!words.some((w) => w.length > 3 && name.includes(w))) continue;
      const thumb: string = info.thumburl || info.url;
      if (!/^https:\/\/upload\.wikimedia\.org\//.test(thumb)) continue;
      return {
        url: thumb,
        credit: {
          author: stripTags(String(meta.Artist?.value || 'Wikimedia Commons contributor')).slice(0, 80) || 'Wikimedia Commons contributor',
          license,
          licenseUrl: stripTags(String(meta.LicenseUrl?.value || '')) || 'https://commons.wikimedia.org/',
          source: String(info.descriptionurl || `https://commons.wikimedia.org/wiki/${encodeURIComponent(page.title)}`),
        },
      };
    }
    return null;
  }

  return {
    async findPhoto(title: string): Promise<FoundPhoto | null> {
      for (const q of photoQueries(title)) {
        try {
          const found = await search(q);
          if (found) return found;
        } catch {
          // try the next search
        }
      }
      return null;
    },
  };
}
