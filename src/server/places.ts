import { HttpError } from './store';
import { overpassQuery, parseGeocode, parseOverpass, type SharedSpot } from '../utils/takeaways';

/**
 * Finds a town and the takeaways around it using OpenStreetMap: Nominatim for the town, Overpass for the shops.
 * Both are free and need no key. The calls are made from the server so the app can identify itself properly
 * (their usage policies ask for it) and so phones never talk to them directly. Tests pass in a fake fetch.
 */
export type Places = {
  geocode(query: string): Promise<{ label: string; lat: number; lon: number }>;
  takeawaysNear(lat: number, lon: number, radiusM: number): Promise<SharedSpot[]>;
};

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
  'https://overpass.kumi.systems/api/interpreter',
];
const USER_AGENT = 'DinnerSpinner/1.0 (family dinner app; takeaway finder)';

export function createPlaces(doFetch: typeof fetch = fetch): Places {
  const withTimeout = async (url: string, init: RequestInit = {}) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 8_000);
    try {
      return await doFetch(url, { ...init, signal: ctrl.signal, headers: { 'User-Agent': USER_AGENT, ...(init.headers || {}) } });
    } finally {
      clearTimeout(timer);
    }
  };

  return {
    async geocode(query) {
      let json: unknown;
      try {
        const res = await withTimeout(
          'https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&addressdetails=1&q=' + encodeURIComponent(query)
        );
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
      // The public Overpass servers are often at capacity, so try each in turn.
      let json: unknown;
      const body = 'data=' + encodeURIComponent(overpassQuery(lat, lon, radiusM));
      for (const endpoint of OVERPASS_ENDPOINTS) {
        try {
          const res = await withTimeout(endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body,
          });
          if (!res.ok) continue;
          json = await res.json();
          break;
        } catch {
          // try the next one
        }
      }
      if (json === undefined) throw new HttpError(502, { error: 'The map service is busy. Try again in a minute.' });
      return parseOverpass(json, { lat, lon });
    },
  };
}
