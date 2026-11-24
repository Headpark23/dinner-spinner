import { HttpError } from './store';
import {
  FALLBACK_TERMS,
  overpassQuery,
  parseGeocode,
  parseNominatimSpots,
  parseOverpass,
  viewbox,
  type SharedSpot,
} from '../utils/takeaways';

/**
 * Finds a town and the takeaways around it using OpenStreetMap: Nominatim for the town, Overpass for the shops.
 * Both are free and need no key. The calls are made from the server so the app can identify itself properly
 * (their usage policies ask for it) and so phones never talk to them directly. Tests pass in a fake fetch.
 *
 * The public Overpass servers are often full. When they are, we fall back to a handful of Nominatim searches
 * inside the same box. That finds most places but can miss some, so the result says whether it is `complete`;
 * only a complete search is trusted to say a place has closed.
 */
export type Nearby = { spots: SharedSpot[]; complete: boolean };

export type Places = {
  geocode(query: string): Promise<{ label: string; lat: number; lon: number }>;
  takeawaysNear(lat: number, lon: number, radiusM: number): Promise<Nearby>;
};

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const USER_AGENT = 'DinnerSpinner/1.0 (family dinner app; takeaway finder)';
const NOMINATIM = 'https://nominatim.openstreetmap.org/search';
/** The whole search must finish inside the serverless limit (30s). */
const OVERPASS_BUDGET_MS = 11_000;
const FALLBACK_BUDGET_MS = 12_000;
const sleepFor = (ms: number) => new Promise<void>((r) => setTimeout(r, ms));

export function createPlaces(doFetch: typeof fetch = fetch, sleep: (ms: number) => Promise<void> = sleepFor): Places {
  const withTimeout = async (url: string, init: RequestInit = {}, ms = 8_000) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), ms);
    try {
      return await doFetch(url, { ...init, signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT, ...(init.headers || {}) } });
    } finally {
      clearTimeout(timer);
    }
  };

  /** One Overpass attempt per server, within a shared time budget. Returns undefined when they are all busy. */
  const overpass = async (lat: number, lon: number, radiusM: number): Promise<unknown> => {
    const body = 'data=' + encodeURIComponent(overpassQuery(lat, lon, radiusM));
    const deadline = Date.now() + OVERPASS_BUDGET_MS;
    for (const endpoint of OVERPASS_ENDPOINTS) {
      const left = deadline - Date.now();
      if (left < 1_500) break;
      try {
        const res = await withTimeout(
          endpoint,
          { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, body },
          Math.min(left, 6_000)
        );
        if (!res.ok) continue;
        const json = await res.json();
        if (json && Array.isArray((json as any).elements)) return json;
      } catch {
        // try the next one
      }
    }
    return undefined;
  };

  /** Several small Nominatim searches in the same box. One request a second, as their policy asks. */
  const nominatimFallback = async (lat: number, lon: number, radiusM: number): Promise<SharedSpot[]> => {
    const box = viewbox(lat, lon, radiusM);
    const lists: unknown[] = [];
    let worked = 0;
    const deadline = Date.now() + FALLBACK_BUDGET_MS;
    for (const [i, term] of FALLBACK_TERMS.entries()) {
      if (i > 0) {
        if (Date.now() > deadline) break; // keep inside the serverless time limit; what we have is still useful
        await sleep(1_100);
      }
      try {
        const res = await withTimeout(
          `${NOMINATIM}?format=jsonv2&limit=40&bounded=1&addressdetails=1&extratags=1&viewbox=${box}&q=${encodeURIComponent(term)}`,
          {},
          4_500
        );
        if (!res.ok) continue;
        lists.push(await res.json());
        worked++;
      } catch {
        // skip this term
      }
    }
    if (worked === 0) throw new HttpError(502, { error: 'The map service is busy. Try again in a minute.' });
    return parseNominatimSpots(lists as any[], { lat, lon });
  };

  return {
    async geocode(query) {
      let json: unknown;
      try {
        const res = await withTimeout(`${NOMINATIM}?format=jsonv2&limit=1&addressdetails=1&q=${encodeURIComponent(query)}`);
        if (!res.ok) throw new Error('geocode ' + res.status);
        json = await res.json();
      } catch {
        throw new HttpError(502, { error: 'Couldn’t look up that place just now. Try again in a minute.' });
      }
      const place = parseGeocode(json, query);
      if (!place) throw new HttpError(404, { error: 'Couldn’t find that town or postcode. Try the town name, or a postcode.' });
      return place;
    },

    async takeawaysNear(lat, lon, radiusM) {
      const json = await overpass(lat, lon, radiusM);
      if (json !== undefined) return { spots: parseOverpass(json, { lat, lon }), complete: true };
      return { spots: await nominatimFallback(lat, lon, radiusM), complete: false };
    },
  };
}
