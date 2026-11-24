/**
 * Local takeaways shared by a family group. Pure functions, used by both the server and the phones.
 *
 * Merge rules (so two phones never lose each other's votes):
 *  - spots are unioned by id; for the same id the copy with the newer `updatedAt` wins
 *  - ratings are one per person per spot (id = spot + person); the newer `updatedAt` wins
 *  - nothing is ever deleted: a hidden spot or a withdrawn score (0 stars) is a marker that merges like any other edit
 */

export type SharedSpot = {
  id: string;
  name: string;
  cuisine: string;
  address?: string;
  phone?: string;
  website?: string;
  lat?: number;
  lon?: number;
  source: 'osm' | 'google' | 'manual';
  addedBy?: string;
  hidden?: boolean;
  /** A refresh could no longer find it on the map, so it may have closed. */
  gone?: boolean;
  updatedAt: string;
};

export type SpotRating = {
  id: string; // `${spotId}|${person key}`
  spotId: string;
  who: string;
  stars: number; // 1-5, or 0 for "withdrawn"
  likes?: string;
  dislikes?: string;
  updatedAt: string;
};

export type TakeawayPlace = {
  label: string;
  lat: number;
  lon: number;
  updatedAt: string;
  /** When the map was last searched for takeaways here, and how many places it found. The search is a one-off; refresh on request. */
  searchedAt?: string;
  found?: number;
};

export type TakeawayHub = {
  version: number;
  place: TakeawayPlace | null;
  spots: SharedSpot[];
  ratings: SpotRating[];
};

export const MAX_SPOTS = 500;
export const MAX_RATINGS = 2500;

export const emptyHub = (): TakeawayHub => ({ version: 0, place: null, spots: [], ratings: [] });

const clip = (v: unknown, n: number) => (typeof v === 'string' ? v.trim().slice(0, n) : '');
const isoOr = (v: unknown, fallback: string) => {
  const s = clip(v, 40);
  return s && !Number.isNaN(Date.parse(s)) ? s : fallback;
};
const num = (v: unknown, lo: number, hi: number): number | undefined =>
  typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi ? v : undefined;
const safeUrl = (v: unknown) => {
  const s = clip(v, 200);
  if (!s) return undefined;
  const withScheme = /^https?:\/\//i.test(s) ? s : /^[\w.-]+\.[a-z]{2,}/i.test(s) ? 'https://' + s : '';
  return withScheme || undefined;
};

/** The id a person's score for a spot is stored under. */
export const ratingId = (spotId: string, who: string) => `${spotId}|${who.trim().toLowerCase().slice(0, 40)}`;

export function cleanSpot(raw: any, now = new Date().toISOString()): SharedSpot | null {
  const name = clip(raw?.name, 80);
  const id = clip(raw?.id, 60);
  if (!name || !id) return null;
  const lat = num(raw?.lat, -90, 90);
  const lon = num(raw?.lon, -180, 180);
  return {
    id,
    name,
    cuisine: clip(raw?.cuisine, 40) || 'Takeaway',
    address: clip(raw?.address, 120) || undefined,
    phone: clip(raw?.phone, 30) || undefined,
    website: safeUrl(raw?.website),
    lat: lat !== undefined && lon !== undefined ? lat : undefined,
    lon: lat !== undefined && lon !== undefined ? lon : undefined,
    source: raw?.source === 'osm' ? 'osm' : raw?.source === 'google' ? 'google' : 'manual',
    addedBy: clip(raw?.addedBy, 40) || undefined,
    hidden: raw?.hidden === true ? true : undefined,
    gone: raw?.gone === true ? true : undefined,
    updatedAt: isoOr(raw?.updatedAt, now),
  };
}

export function cleanRating(raw: any, now = new Date().toISOString()): SpotRating | null {
  const spotId = clip(raw?.spotId, 60);
  const who = clip(raw?.who, 40);
  const stars = typeof raw?.stars === 'number' ? Math.round(raw.stars) : NaN;
  if (!spotId || !who || !(stars >= 0 && stars <= 5)) return null;
  return {
    id: ratingId(spotId, who),
    spotId,
    who,
    stars,
    likes: clip(raw?.likes, 200) || undefined,
    dislikes: clip(raw?.dislikes, 200) || undefined,
    updatedAt: isoOr(raw?.updatedAt, now),
  };
}

export function cleanPlace(raw: any, now = new Date().toISOString()): TakeawayPlace | null {
  const label = clip(raw?.label, 100);
  const lat = num(raw?.lat, -90, 90);
  const lon = num(raw?.lon, -180, 180);
  if (!label || lat === undefined || lon === undefined) return null;
  const searchedAt = clip(raw?.searchedAt, 40);
  const found = typeof raw?.found === 'number' && raw.found >= 0 && raw.found < 10000 ? Math.round(raw.found) : undefined;
  return {
    label,
    lat,
    lon,
    updatedAt: isoOr(raw?.updatedAt, now),
    searchedAt: searchedAt && !Number.isNaN(Date.parse(searchedAt)) ? searchedAt : undefined,
    found,
  };
}

const newer = (a: { updatedAt: string }, b: { updatedAt: string }) => Date.parse(b.updatedAt) >= Date.parse(a.updatedAt);

/** Union by id; on a clash the newer edit wins. Never drops anything. */
function unionById<T extends { id: string; updatedAt: string }>(existing: T[], incoming: T[], cap: number): T[] {
  const byId = new Map<string, T>();
  for (const e of existing) byId.set(e.id, e);
  for (const i of incoming) {
    const cur = byId.get(i.id);
    if (!cur || newer(cur, i)) byId.set(i.id, i);
  }
  return [...byId.values()]
    .sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : a.updatedAt > b.updatedAt ? -1 : a.id < b.id ? -1 : 1))
    .slice(0, cap);
}

/** Merge anything (a phone's copy, a discovery result) into the hub. Bad entries are dropped. */
export function mergeHub(
  hub: TakeawayHub,
  incoming: { place?: unknown; spots?: unknown; ratings?: unknown }
): TakeawayHub {
  const spots = (Array.isArray(incoming.spots) ? incoming.spots : []).slice(0, MAX_SPOTS).map((s) => cleanSpot(s)).filter((s): s is SharedSpot => !!s);
  const ratings = (Array.isArray(incoming.ratings) ? incoming.ratings : []).slice(0, MAX_RATINGS).map((r) => cleanRating(r)).filter((r): r is SpotRating => !!r);
  const place = incoming.place ? cleanPlace(incoming.place) : null;
  const keepPlace = place && (!hub.place || newer(hub.place, place)) ? place : hub.place;
  return {
    version: hub.version,
    place: keepPlace,
    spots: unionById(hub.spots, spots, MAX_SPOTS),
    ratings: unionById(hub.ratings, ratings, MAX_RATINGS),
  };
}

/** A stored or received hub, cleaned. */
export const cleanHub = (raw: any): TakeawayHub => ({
  ...mergeHub(emptyHub(), { place: raw?.place, spots: raw?.spots, ratings: raw?.ratings }),
  version: typeof raw?.version === 'number' ? raw.version : 0,
});

// ---------------------------------------------------------------------------
// League table
// ---------------------------------------------------------------------------
export type LeagueRow = {
  spot: SharedSpot;
  average: number; // 0 when nobody has scored it
  votes: number;
  scores: SpotRating[]; // current scores, newest first
  notes: SpotRating[]; // scores that carry a like or a dislike
};

/**
 * Favourites first. Ranked by average stars, then by how many people have scored it, then by name.
 * Unscored spots follow, nearest first when we know where they are.
 */
export function buildLeague(hub: TakeawayHub, here?: { lat: number; lon: number } | null): LeagueRow[] {
  const bySpot = new Map<string, SpotRating[]>();
  for (const r of hub.ratings) {
    const list = bySpot.get(r.spotId);
    if (list) list.push(r);
    else bySpot.set(r.spotId, [r]);
  }
  const rows: LeagueRow[] = hub.spots
    .filter((s) => !s.hidden)
    .map((spot) => {
      const all = (bySpot.get(spot.id) || []).sort((a, b) => (a.updatedAt < b.updatedAt ? 1 : -1));
      const scores = all.filter((r) => r.stars > 0);
      const votes = scores.length;
      const average = votes ? scores.reduce((t, r) => t + r.stars, 0) / votes : 0;
      return { spot, average, votes, scores, notes: all.filter((r) => r.likes || r.dislikes) };
    })
    // A place that has gone from the map disappears unless the family has scored it (their history stays).
    .filter((r) => !r.spot.gone || r.votes > 0);
  // One row per big chain, however many branches were found: the most-scored branch, else the nearest to the town.
  const distTo = (s: SharedSpot) => (here && s.lat !== undefined && s.lon !== undefined ? distanceM(here, { lat: s.lat, lon: s.lon }) : Infinity);
  const best = new Map<string, LeagueRow>();
  for (const r of rows) {
    const c = chainOf(r.spot.name);
    if (!c) continue;
    const cur = best.get(c);
    if (!cur || r.votes > cur.votes || (r.votes === cur.votes && distTo(r.spot) < distTo(cur.spot))) best.set(c, r);
  }
  const kept = rows.filter((r) => {
    const c = chainOf(r.spot.name);
    return !c || best.get(c) === r;
  });
  rows.length = 0;
  rows.push(...kept);
  const dist = (s: SharedSpot) => (here && s.lat !== undefined && s.lon !== undefined ? distanceM(here, { lat: s.lat, lon: s.lon }) : Infinity);
  return rows.sort((a, b) => {
    if ((a.votes > 0) !== (b.votes > 0)) return a.votes > 0 ? -1 : 1;
    if (a.votes > 0) {
      if (b.average !== a.average) return b.average - a.average;
      if (b.votes !== a.votes) return b.votes - a.votes;
    } else {
      const d = dist(a.spot) - dist(b.spot);
      if (d && Number.isFinite(d)) return d;
    }
    return a.spot.name.localeCompare(b.spot.name);
  });
}

/** How likely the spinner is to land on a spot. Loved places come up more, dreaded ones rarely, new ones get a fair go. */
export function spinWeight(row: Pick<LeagueRow, 'average' | 'votes'>): number {
  if (row.votes === 0) return 3;
  if (row.average >= 4.5) return 6;
  if (row.average >= 3.5) return 4;
  if (row.average >= 2.5) return 2;
  return 0.5;
}

/** `rand` is a number in [0, 1), passed in so tests are deterministic. */
export function pickWeighted<T>(items: T[], weight: (t: T) => number, rand: number): T | undefined {
  if (!items.length) return undefined;
  const total = items.reduce((t, i) => t + Math.max(0, weight(i)), 0);
  if (total <= 0) return items[Math.min(items.length - 1, Math.floor(rand * items.length))];
  let at = rand * total;
  for (const i of items) {
    at -= Math.max(0, weight(i));
    if (at < 0) return i;
  }
  return items[items.length - 1];
}

// ---------------------------------------------------------------------------
// Finding takeaways: OpenStreetMap (free, no key). Query building and parsing are pure so they can be tested.
// ---------------------------------------------------------------------------
export function distanceM(a: { lat: number; lon: number }, b: { lat: number; lon: number }): number {
  const R = 6371000;
  const rad = (d: number) => (d * Math.PI) / 180;
  const dLat = rad(b.lat - a.lat);
  const dLon = rad(b.lon - a.lon);
  const h = Math.sin(dLat / 2) ** 2 + Math.cos(rad(a.lat)) * Math.cos(rad(b.lat)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

export const DEFAULT_RADIUS_M = 3000;
export const MAX_RADIUS_M = 8000;

/** Kinds of food that are normally sold to take away, even when nobody has tagged the shop as a takeaway on the map. */
const TAKEAWAY_CUISINES = 'indian|chinese|pizza|thai|kebab|turkish|burger|chicken|fish_and_chips|bangladeshi|pakistani|curry|noodle|sushi|japanese|vietnamese|korean|asian|sandwich|american|mexican|lebanese|middle_eastern|caribbean|jamaican';
/** Names that give a takeaway away. */
export const TAKEAWAY_NAME = /take-?away|chippy|fish\s*(?:&|and)\s*chips|chip shop|kebab|pizz|tandoori|curry|balti|wok|noodle|burger|fried chicken|\bgrill\b|shawarma|sushi|bhuna|spice/i;

/**
 * Places with a name that sell food to take away: all fast food unless it says no; restaurants that say they do takeaway
 * or delivery, or that serve food usually taken away (curry houses and the like) and don't say no. Many shops on the map
 * were never tagged, so the wider net catches them.
 */
export function overpassQuery(lat: number, lon: number, radiusM = DEFAULT_RADIUS_M): string {
  const r = Math.round(Math.min(MAX_RADIUS_M, Math.max(300, radiusM)));
  const at = `(around:${r},${lat.toFixed(5)},${lon.toFixed(5)})`;
  return (
    '[out:json][timeout:25];(' +
    `nwr["amenity"="fast_food"]["name"]["takeaway"!="no"]${at};` +
    `nwr["amenity"="restaurant"]["name"]["takeaway"~"^(yes|only)$"]${at};` +
    `nwr["amenity"="restaurant"]["name"]["delivery"="yes"]["takeaway"!="no"]${at};` +
    `nwr["amenity"="restaurant"]["name"]["cuisine"~"${TAKEAWAY_CUISINES}"]["takeaway"!="no"]${at};` +
    `nwr["shop"~"^(deli|convenience)$"]["name"]["cuisine"]["takeaway"="yes"]${at};` +
    ');out center tags 500;'
  );
}

/**
 * The big national chains. Every branch of one of these would otherwise appear in the list (and the league), so a
 * chain with six branches nearby would count six times. We keep one branch of each: the nearest to the chosen town.
 */
const CHAINS: [string, RegExp][] = [
  ['mcdonalds', /^mc\s?donald/],
  ['burgerking', /^burger king/],
  ['kfc', /^(kfc|kentucky fried)/],
  ['greggs', /^greggs/],
  ['dominos', /^domino/],
  ['subway', /^subway/],
  ['pizzahut', /^pizza hut/],
  ['papajohns', /^papa john/],
  ['nandos', /^nando/],
  ['fiveguys', /^five guys/],
  ['tacobell', /^taco bell/],
  ['wimpy', /^wimpy/],
  ['popeyes', /^popeyes/],
  ['wingstop', /^wingstop/],
  ['dixy', /^dixy/],
  ['wagamama', /^wagamama/],
  ['pret', /^pret( a manger)?\b/],
  ['starbucks', /^starbucks/],
  ['costa', /^costa( coffee)?\b/],
  ['krispykreme', /^krispy kreme/],
  ['itsu', /^itsu\b/],
  ['leon', /^leon\b/],
  ['ginsters', /^ginsters/],
  ['cooplan', /^(chicken cottage|morley'?s|sam'?s chicken|perfect fried chicken|dixie chicken)/],
];

/** Which big chain a shop belongs to, or null for an independent. Matches on the name only. */
export function chainOf(name: string): string | null {
  const n = name
    .toLowerCase()
    .replace(/[’'`]/g, '')
    .replace(/^the\s+/, '')
    .replace(/[^a-z0-9 ]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
  for (const [key, re] of CHAINS) if (re.test(n)) return key;
  return null;
}

/** Keeps the first spot of each chain (callers pass them nearest first) and every independent. */
export function oneOfEachChain<T extends { name: string }>(spots: T[]): T[] {
  const seen = new Set<string>();
  return spots.filter((s) => {
    const c = chainOf(s.name);
    if (!c) return true;
    if (seen.has(c)) return false;
    seen.add(c);
    return true;
  });
}

const CUISINES: Record<string, string> = {
  fish_and_chips: 'Fish & Chips',
  chinese: 'Chinese',
  indian: 'Indian',
  pizza: 'Pizza',
  italian: 'Italian',
  burger: 'Burgers',
  chicken: 'Fried Chicken',
  kebab: 'Kebab',
  thai: 'Thai',
  turkish: 'Turkish',
  sandwich: 'Sandwiches',
  fish: 'Fish & Chips',
  japanese: 'Japanese',
  sushi: 'Japanese',
  mexican: 'Mexican',
  vietnamese: 'Vietnamese',
  korean: 'Korean',
  greek: 'Greek',
  american: 'American',
  curry: 'Indian',
  bangladeshi: 'Indian',
  pakistani: 'Indian',
  asian: 'Asian',
  noodle: 'Noodles',
  coffee_shop: 'Cafe',
  ice_cream: 'Dessert',
  regional: 'Local',
};

export function cuisineLabel(tag: unknown): string {
  const first = String(tag || '').split(/[;,]/)[0].trim().toLowerCase().replace(/\s+/g, '_');
  if (!first) return 'Takeaway';
  return CUISINES[first] || first.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase()).slice(0, 40);
}

/** Turns an Overpass reply into spots, nearest first. Unnamed or unusable elements are skipped. */
export function parseOverpass(json: any, here?: { lat: number; lon: number }): SharedSpot[] {
  const now = new Date().toISOString();
  const spots: { spot: SharedSpot; d: number }[] = [];
  const seen = new Set<string>();
  for (const el of Array.isArray(json?.elements) ? json.elements : []) {
    const t = el?.tags || {};
    const name = clip(t.name, 80);
    if (!name || !['node', 'way', 'relation'].includes(el?.type) || typeof el?.id !== 'number') continue;
    const lat = num(el.lat ?? el.center?.lat, -90, 90);
    const lon = num(el.lon ?? el.center?.lon, -180, 180);
    const street = [t['addr:housenumber'], t['addr:street']].filter(Boolean).join(' ');
    const address = [street, t['addr:city'] || t['addr:suburb'], t['addr:postcode']].filter(Boolean).join(', ');
    const spot = cleanSpot(
      {
        id: `osm_${el.type[0]}${el.id}`,
        name,
        cuisine: cuisineLabel(t.cuisine) !== 'Takeaway' ? cuisineLabel(t.cuisine) : t.amenity === 'restaurant' ? 'Restaurant' : 'Takeaway',
        address,
        phone: t.phone || t['contact:phone'],
        website: t.website || t['contact:website'],
        lat,
        lon,
        source: 'osm',
      },
      now
    );
    if (!spot || seen.has(spot.id)) continue;
    seen.add(spot.id);
    spots.push({ spot, d: here && spot.lat !== undefined && spot.lon !== undefined ? distanceM(here, { lat: spot.lat, lon: spot.lon }) : Infinity });
  }
  return oneOfEachChain(spots.sort((a, b) => (a.d === b.d ? 0 : a.d < b.d ? -1 : 1)).map((s) => s.spot));
}

/** Search terms used when the Overpass servers are busy and we fall back to Nominatim. */
export const FALLBACK_TERMS = ['takeaway', 'fast food', 'pizza', 'chinese', 'indian', 'curry', 'fish and chips', 'kebab', 'burger', 'chicken', 'thai', 'sushi'];

/** The map box (west,north,east,south) around a point, for Nominatim's bounded search. */
export function viewbox(lat: number, lon: number, radiusM: number): string {
  const dLat = radiusM / 111_320;
  const dLon = radiusM / (111_320 * Math.max(0.2, Math.cos((lat * Math.PI) / 180)));
  return [lon - dLon, lat + dLat, lon + dLon, lat - dLat].map((n) => n.toFixed(5)).join(',');
}

/**
 * Turns Nominatim search results (with extratags and addressdetails) into spots, nearest first. Only food places that
 * sell to take away are kept: fast food, restaurants that say so, and anything with takeaway in the name.
 */
export function parseNominatimSpots(lists: any[], here?: { lat: number; lon: number }): SharedSpot[] {
  const now = new Date().toISOString();
  const spots: { spot: SharedSpot; d: number }[] = [];
  const seen = new Set<string>();
  for (const list of lists) {
    for (const hit of Array.isArray(list) ? list : []) {
      const t = hit?.extratags || {};
      const name = clip(hit?.name, 80);
      const kind = String(hit?.type || '');
      const cls = String(hit?.category || hit?.class || '');
      const type = ['node', 'way', 'relation'].includes(hit?.osm_type) ? hit.osm_type : '';
      if (!name || !type || typeof hit?.osm_id !== 'number') continue;
      const cuisines = String(t.cuisine || '').toLowerCase();
      const sellsTakeaway =
        t.takeaway === 'yes' ||
        t.takeaway === 'only' ||
        t.delivery === 'yes' ||
        TAKEAWAY_NAME.test(name) ||
        new RegExp(TAKEAWAY_CUISINES).test(cuisines);
      const food = (cls === 'amenity' && (kind === 'fast_food' || (kind === 'restaurant' && sellsTakeaway))) || (/caterer|takeaway/.test(kind) && sellsTakeaway);
      if (!food || t.takeaway === 'no') continue;
      const a = hit.address || {};
      const street = [a.house_number, a.road].filter(Boolean).join(' ');
      const address = [street, a.suburb || a.city || a.town || a.village, a.postcode].filter(Boolean).join(', ');
      const lat = num(Number(hit.lat), -90, 90);
      const lon = num(Number(hit.lon), -180, 180);
      const spot = cleanSpot(
        {
          id: `osm_${type[0]}${hit.osm_id}`,
          name,
          cuisine: cuisineLabel(t.cuisine) !== 'Takeaway' ? cuisineLabel(t.cuisine) : kind === 'restaurant' ? 'Restaurant' : 'Takeaway',
          address,
          phone: t.phone || t['contact:phone'],
          website: t.website || t['contact:website'],
          lat,
          lon,
          source: 'osm',
        },
        now
      );
      if (!spot || seen.has(spot.id)) continue;
      seen.add(spot.id);
      spots.push({ spot, d: here && spot.lat !== undefined && spot.lon !== undefined ? distanceM(here, { lat: spot.lat, lon: spot.lon }) : Infinity });
    }
  }
  return oneOfEachChain(spots.sort((a, b) => (a.d === b.d ? 0 : a.d < b.d ? -1 : 1)).map((x) => x.spot));
}

/**
 * Links for ordering or finding a place. Delivery sites don't offer a stable address for each shop, so the three
 * big ones are opened through a search that lands on the shop's own page there. The shop's own site is used when known.
 */
export function orderLinks(spot: Pick<SharedSpot, 'name' | 'address' | 'lat' | 'lon' | 'website'>, town?: string) {
  const where = town || '';
  const q = (extra: string) => 'https://www.google.com/search?q=' + encodeURIComponent(`${spot.name} ${where} ${extra}`.replace(/\s+/g, ' ').trim());
  const mapQuery = spot.lat !== undefined && spot.lon !== undefined ? `${spot.name} @${spot.lat},${spot.lon}` : `${spot.name} ${spot.address || where}`;
  return {
    website: spot.website,
    directions: 'https://www.google.com/maps/search/?api=1&query=' + encodeURIComponent(mapQuery),
    justEat: q('site:just-eat.co.uk'),
    uberEats: q('site:ubereats.com'),
    deliveroo: q('site:deliveroo.co.uk'),
  };
}

/** Reads the first Nominatim hit as a place. */
export function parseGeocode(json: any, query: string): { label: string; lat: number; lon: number } | null {
  const hit = Array.isArray(json) ? json[0] : null;
  const lat = Number(hit?.lat);
  const lon = Number(hit?.lon);
  if (!hit || !Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  const a = hit.address || {};
  const town = a.city || a.town || a.village || a.suburb || a.hamlet || a.county;
  const label = [town, a.postcode && /^\d|^[A-Z]{1,2}\d/i.test(String(query).trim()) ? a.postcode : ''].filter(Boolean).join(' ');
  return { label: clip(label || hit.name || hit.display_name || query, 100), lat, lon };
}

/**
 * What we can learn about a business from its own web page: structured data first (name, cuisine, address, phone,
 * position), then the page's title. Returns null when there is nothing to go on.
 */
export type PlaceDetails = { name: string; cuisine?: string; address?: string; phone?: string; lat?: number; lon?: number };

const BUSINESS_TYPES = /restaurant|foodestablishment|localbusiness|cafe|bakery|store|barorpub/i;
const decode = (t: string) =>
  t
    .replace(/<[^>]+>/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&rsquo;/g, "'")
    .replace(/&nbsp;/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();

function findBusiness(json: any): any | null {
  if (!json || typeof json !== 'object') return null;
  if (Array.isArray(json)) {
    for (const j of json) {
      const r = findBusiness(j);
      if (r) return r;
    }
    return null;
  }
  const types = ([] as unknown[]).concat(json['@type'] ?? []).map(String);
  if (types.some((t) => BUSINESS_TYPES.test(t)) && json.name) return json;
  return findBusiness(json['@graph']);
}

export function placeFromHtml(html: string): PlaceDetails | null {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html))) {
    try {
      const b = findBusiness(JSON.parse(m[1].trim()));
      if (!b) continue;
      const a = b.address && typeof b.address === 'object' ? b.address : {};
      const address = typeof b.address === 'string' ? b.address : [a.streetAddress, a.addressLocality, a.postalCode].filter(Boolean).join(', ');
      const cuisine = ([] as unknown[]).concat(b.servesCuisine ?? [])[0];
      const lat = Number(b.geo?.latitude);
      const lon = Number(b.geo?.longitude);
      return {
        name: clip(decode(String(b.name)), 80),
        cuisine: cuisine ? cuisineLabel(String(cuisine)) : undefined,
        address: clip(decode(address), 120) || undefined,
        phone: clip(b.telephone, 30) || undefined,
        lat: Number.isFinite(lat) && Number.isFinite(lon) ? lat : undefined,
        lon: Number.isFinite(lat) && Number.isFinite(lon) ? lon : undefined,
      };
    } catch {
      // not valid JSON; try the next block
    }
  }
  const og = /<meta[^>]+property=["']og:site_name["'][^>]+content=["']([^"']+)["']/i.exec(html) || /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:site_name["']/i.exec(html);
  const title = /<title[^>]*>([\s\S]*?)<\/title>/i.exec(html);
  const raw = og?.[1] || (title ? title[1].split(/\s[|\u2013\u2014-]\s/)[0] : '');
  const name = clip(decode(raw), 80);
  return name ? { name } : null;
}

// ---------------------------------------------------------------------------
// Google Places (optional, needs an API key on the server). Fuller coverage than the map data alone.
// ---------------------------------------------------------------------------

/** Searches sent to Google for one area. Each is one request, so this list is also the cost of a search. */
export const GOOGLE_QUERIES = ['takeaway', 'pizza takeaway', 'chinese takeaway', 'indian takeaway', 'fish and chips', 'kebab', 'burger', 'fried chicken'];

const GOOGLE_TYPES = new Set(['meal_takeaway', 'meal_delivery', 'fast_food_restaurant', 'pizza_restaurant', 'hamburger_restaurant', 'sandwich_shop', 'chicken_restaurant']);

/** A name with the noise taken out, for telling whether two listings are the same shop. */
const plainName = (n: string) => n.toLowerCase().replace(/&/g, 'and').replace(/^the\s+/, '').replace(/[^a-z0-9]+/g, '');

/** True when two listings are the same place: same name, close together. Lets a Google result reuse a place found earlier on the map. */
export function sameSpot(a: { name: string; lat?: number; lon?: number }, b: { name: string; lat?: number; lon?: number }): boolean {
  if (!plainName(a.name) || plainName(a.name) !== plainName(b.name)) return false;
  if (a.lat === undefined || a.lon === undefined || b.lat === undefined || b.lon === undefined) return true;
  return distanceM({ lat: a.lat, lon: a.lon }, { lat: b.lat, lon: b.lon }) < 250;
}

const googleCuisine = (p: any): string => {
  const label = String(p?.primaryTypeDisplayName?.text || '').replace(/\s*(restaurant|shop|store)$/i, '').trim();
  if (!label || /^(meal takeaway|meal delivery|takeaway|food)$/i.test(label)) return 'Takeaway';
  return label.slice(0, 40);
};

/**
 * Turns Google Places (New) replies (one per search) into spots, nearest first. Closed places and anything that
 * isn't a takeaway-style business are dropped; places outside the search circle are dropped too.
 */
export function parseGooglePlaces(replies: any[], here?: { lat: number; lon: number }, radiusM?: number): SharedSpot[] {
  const now = new Date().toISOString();
  const spots: { spot: SharedSpot; d: number }[] = [];
  const seen = new Set<string>();
  for (const reply of replies) {
    for (const p of Array.isArray(reply?.places) ? reply.places : []) {
      const name = clip(p?.displayName?.text, 80);
      const pid = clip(p?.id, 50);
      if (!name || !pid) continue;
      if (p.businessStatus && p.businessStatus !== 'OPERATIONAL') continue;
      const types: string[] = Array.isArray(p.types) ? p.types : [];
      if (!(types.some((t) => GOOGLE_TYPES.has(t)) || TAKEAWAY_NAME.test(name))) continue;
      const lat = num(p.location?.latitude, -90, 90);
      const lon = num(p.location?.longitude, -180, 180);
      const d = here && lat !== undefined && lon !== undefined ? distanceM(here, { lat, lon }) : Infinity;
      if (radiusM !== undefined && d !== Infinity && d > radiusM * 1.05) continue;
      const spot = cleanSpot(
        {
          id: 'g_' + pid,
          name,
          cuisine: googleCuisine(p),
          address: String(p.formattedAddress || '').replace(/,\s*(UK|United Kingdom)$/i, ''),
          phone: p.nationalPhoneNumber,
          website: p.websiteUri,
          lat,
          lon,
          source: 'google',
        },
        now
      );
      if (!spot || seen.has(spot.id)) continue;
      seen.add(spot.id);
      spots.push({ spot, d });
    }
  }
  return oneOfEachChain(spots.sort((a, b) => (a.d === b.d ? 0 : a.d < b.d ? -1 : 1)).map((s) => s.spot));
}
