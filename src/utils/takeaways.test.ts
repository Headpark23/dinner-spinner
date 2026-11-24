import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { HttpError, createFileStore } from '../server/store';

process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = '';

// ---------------------------------------------------------------------------
// Local takeaways (family group only)
// ---------------------------------------------------------------------------
async function withServer(run: (baseUrl: string) => Promise<void>) {
  const { app } = await import('../../server');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const { port } = server.address() as { port: number };
  try {
    await run(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
}
const json = { 'Content-Type': 'application/json' };
const authed = (h: { householdId: string; key: string }) => ({ ...json, 'x-household-id': h.householdId, 'x-household-key': h.key });
async function newHousehold(baseUrl: string) {
  const res = await fetch(`${baseUrl}/api/households`, { method: 'POST' });
  assert.equal(res.status, 201);
  return (await res.json()) as { householdId: string; key: string; code: string };
}

test('Takeaways: two phones scoring at once never lose each other; newest edit per person wins', async () => {
  const T = await import('./takeaways');
  const spot = (id: string, name: string) => ({ id, name, cuisine: 'Indian', source: 'osm', updatedAt: '2026-01-01T00:00:00Z' });
  const rate = (spotId: string, who: string, stars: number, at: string, likes = '') => ({ spotId, who, stars, likes, updatedAt: at });

  const hub = T.mergeHub(T.emptyHub(), { spots: [spot('a', 'Spice Hut'), spot('b', 'Wok This Way')] });
  // Phone 1 and phone 2 each only know their own score.
  const phone1 = T.mergeHub(hub, { ratings: [rate('a', 'Mum', 5, '2026-02-01T10:00:00Z', 'great naan')] });
  const phone2 = T.mergeHub(hub, { ratings: [rate('a', 'Dad', 3, '2026-02-01T10:00:01Z'), rate('b', 'Dad', 4, '2026-02-01T10:00:02Z')] });
  const bothWays1 = T.mergeHub(phone1, { spots: phone2.spots, ratings: phone2.ratings });
  const bothWays2 = T.mergeHub(phone2, { spots: phone1.spots, ratings: phone1.ratings });
  assert.deepEqual(bothWays1, bothWays2, 'merging is order-independent');
  assert.equal(bothWays1.ratings.length, 3);
  assert.deepEqual(T.mergeHub(bothWays1, bothWays1), bothWays1, 'merging twice changes nothing');

  // Mum changes her mind; the newer score replaces hers only, and an older replay cannot undo it.
  const changed = T.mergeHub(bothWays1, { ratings: [rate('a', 'mum', 2, '2026-02-02T10:00:00Z')] });
  const replay = T.mergeHub(changed, { ratings: [rate('a', 'Mum', 5, '2026-02-01T10:00:00Z')] });
  assert.equal(replay.ratings.filter((r) => r.spotId === 'a').length, 2);
  assert.equal(replay.ratings.find((r) => r.spotId === 'a' && r.who.toLowerCase() === 'mum')!.stars, 2);

  // Junk is refused: 9 stars, no person, no spot, a javascript: link, a spot with no id.
  const junk = T.mergeHub(T.emptyHub(), {
    spots: [{ id: 'x', name: 'Bad', website: 'javascript:alert(1)' }, { name: 'No id' }],
    ratings: [rate('a', 'Mum', 9, '2026-01-01'), { spotId: 'a', stars: 3 }, { who: 'Mum', stars: 3 }],
  });
  assert.equal(junk.spots.length, 1);
  assert.equal(junk.spots[0].website, undefined);
  assert.equal(junk.ratings.length, 0);
});

test('Takeaways: the league ranks by average then votes, leaves out hidden spots and withdrawn scores', async () => {
  const T = await import('./takeaways');
  const base = { cuisine: 'x', source: 'manual', updatedAt: '2026-01-01T00:00:00Z' };
  const hub = T.mergeHub(T.emptyHub(), {
    spots: [
      { id: 'a', name: 'Alpha', ...base },
      { id: 'b', name: 'Bravo', ...base },
      { id: 'c', name: 'Charlie', ...base },
      { id: 'd', name: 'Delta', ...base, hidden: true },
      { id: 'e', name: 'Echo', ...base, lat: 51.5, lon: -0.1 },
      { id: 'f', name: 'Foxtrot', ...base, lat: 51.5, lon: -0.01 },
    ],
    ratings: [
      { spotId: 'a', who: 'Mum', stars: 4, updatedAt: '2026-01-02' },
      { spotId: 'b', who: 'Mum', stars: 5, updatedAt: '2026-01-02' },
      { spotId: 'b', who: 'Dad', stars: 4, updatedAt: '2026-01-02', dislikes: 'slow' },
      { spotId: 'c', who: 'Mum', stars: 4, updatedAt: '2026-01-02' },
      { spotId: 'c', who: 'Dad', stars: 0, updatedAt: '2026-01-03' }, // withdrawn: not a vote
      { spotId: 'd', who: 'Mum', stars: 5, updatedAt: '2026-01-02' },
    ],
  });
  const league = T.buildLeague(hub, { lat: 51.5, lon: 0 });
  assert.deepEqual(
    league.map((r) => r.spot.id),
    ['b', 'a', 'c', 'f', 'e'],
    'Bravo 4.5 first; Alpha and Charlie tie on 4 from one vote, so by name; unscored nearest first; hidden gone'
  );
  assert.equal(league[0].average, 4.5);
  assert.equal(league[0].votes, 2);
  assert.equal(league[2].votes, 1, 'a withdrawn score is not a vote');
  assert.equal(league[0].notes.length, 1);
  assert.ok(T.spinWeight({ average: 5, votes: 3 }) > T.spinWeight({ average: 0, votes: 0 }));
  assert.ok(T.spinWeight({ average: 0, votes: 0 }) > T.spinWeight({ average: 2, votes: 2 }));
  // The weighted pick is deterministic given the dice and honours weights.
  const items = ['x', 'y'];
  assert.equal(T.pickWeighted(items, (i) => (i === 'x' ? 1 : 9), 0.05), 'x');
  assert.equal(T.pickWeighted(items, (i) => (i === 'x' ? 1 : 9), 0.5), 'y');
  assert.equal(T.pickWeighted(items, () => 0, 0.99), 'y', 'all-zero weights fall back to even odds');
  assert.equal(T.pickWeighted([], () => 1, 0.5), undefined);
});

test('Takeaways: OpenStreetMap results become spots, nearest first, and queries stay inside limits', async () => {
  const T = await import('./takeaways');
  const here = { lat: 51.5, lon: -0.1 };
  const spots = T.parseOverpass(
    {
      elements: [
        { type: 'node', id: 2, lat: 51.52, lon: -0.1, tags: { name: 'Far Fish Bar', amenity: 'fast_food', cuisine: 'fish_and_chips', phone: '+44 20 7946 0000' } },
        { type: 'way', id: 3, center: { lat: 51.501, lon: -0.1 }, tags: { name: 'Near Curry', amenity: 'restaurant', cuisine: 'indian;curry', takeaway: 'yes', 'addr:housenumber': '4', 'addr:street': 'High St', 'addr:postcode': 'AB1 2CD', website: 'nearcurry.example' } },
        { type: 'node', id: 4, lat: 51.5, lon: -0.1, tags: { amenity: 'fast_food' } }, // no name
        { type: 'node', id: 2, lat: 51.52, lon: -0.1, tags: { name: 'Far Fish Bar' } }, // duplicate
        { type: 'node', id: 5, lat: 999, lon: 0, tags: { name: 'Nowhere' } }, // impossible position: kept, without a map point
      ],
    },
    here
  );
  assert.deepEqual(spots.map((s) => s.id), ['osm_w3', 'osm_n2', 'osm_n5'], 'nearest first, unplaceable last, unnamed and duplicates dropped');
  assert.equal(spots[0].cuisine, 'Indian');
  assert.equal(spots[0].address, '4 High St, AB1 2CD');
  assert.equal(spots[0].website, 'https://nearcurry.example');
  assert.equal(spots[1].cuisine, 'Fish & Chips');
  assert.equal(spots[2].lat, undefined);

  const q = T.overpassQuery(51.5, -0.1, 999999);
  assert.ok(q.includes('around:8000,'), 'radius is capped');
  assert.ok(q.includes('"takeaway"!="no"') && q.includes('"takeaway"~"^(yes|only)$"'));
  assert.deepEqual(T.parseGeocode([{ lat: '53.99', lon: '-1.54', address: { town: 'Harrogate', postcode: 'HG1 1AA' } }], 'HG1 1AA'), {
    label: 'Harrogate HG1 1AA',
    lat: 53.99,
    lon: -1.54,
  });
  assert.equal(T.parseGeocode([], 'zzz'), null);
});

test('Server: takeaways are family-only, merged across phones, and never leak to another family', async () => {
  const { usePlaces, useStore } = await import('../../server');
  useStore(createFileStore(null));
  const calls: string[] = [];
  const stamp = new Date().toISOString();
  let shops = [
    { id: 'osm_n1', name: 'Spice Hut', cuisine: 'Indian', lat: 53.99, lon: -1.54, source: 'osm' as const, updatedAt: stamp },
    { id: 'osm_n2', name: 'Wok This Way', cuisine: 'Chinese', lat: 53.99, lon: -1.541, source: 'osm' as const, updatedAt: stamp },
  ];
  let complete = true;
  usePlaces({
    async geocode(q) {
      calls.push('geocode:' + q);
      if (q === 'Nowhereville') throw new HttpError(404, { error: 'Couldn’t find that town or postcode.' });
      return { label: 'Harrogate', lat: 53.99, lon: -1.54 };
    },
    async takeawaysNear(lat, lon, r) {
      calls.push(`near:${lat},${lon},${r}`);
      return { spots: shops, complete };
    },
  });
  await withServer(async (baseUrl) => {
    for (const [method, path] of [['GET', '/api/takeaways'], ['POST', '/api/takeaways'], ['POST', '/api/takeaways/place'], ['POST', '/api/takeaways/discover']]) {
      const res = await fetch(`${baseUrl}${path}`, { method, headers: json, body: method === 'POST' ? '{}' : undefined });
      assert.equal(res.status, 401, `${method} ${path} needs a household`);
    }
    const a = await newHousehold(baseUrl);
    const b = await newHousehold(baseUrl);
    const post = (h: any, path: string, body: any) => fetch(`${baseUrl}/api/takeaways${path}`, { method: 'POST', headers: authed(h), body: JSON.stringify(body) });

    // Nothing to discover until a town is chosen; a bad town is a calm error.
    assert.equal((await post(a, '/discover', {})).status, 400);
    assert.equal((await post(a, '/place', { query: 'Nowhereville' })).status, 404);
    assert.equal((await post(a, '/place', { query: 'x' })).status, 400);
    const placed = await (await post(a, '/place', { query: 'Harrogate' })).json();
    assert.equal(placed.place.label, 'Harrogate');
    const found = await (await post(a, '/discover', { radiusM: 99999 })).json();
    assert.equal(found.found, 2);
    assert.equal(found.added, 2);
    assert.ok(calls.some((c) => c.endsWith(',8000')), 'radius capped on the server');
    assert.equal(found.hub.spots.length, 2);

    // Two phones score at once from their own copies; both scores survive.
    const base = found.hub;
    const now = Date.now();
    await post(a, '', { spots: base.spots, ratings: [{ spotId: 'osm_n1', who: 'Mum', stars: 5, likes: 'great naan', updatedAt: new Date(now).toISOString() }] });
    const merged = await (await post(a, '', { spots: base.spots, ratings: [{ spotId: 'osm_n1', who: 'Dad', stars: 3, dislikes: 'slow', updatedAt: new Date(now + 1).toISOString() }] })).json();
    assert.deepEqual(merged.ratings.map((r: any) => r.who).sort(), ['Dad', 'Mum']);
    assert.equal(merged.ratings.find((r: any) => r.who === 'Mum').likes, 'great naan');

    // Looking again keeps what the family did: a hidden spot stays hidden and scores stay.
    const hidden = { ...base.spots.find((s: any) => s.id === 'osm_n2'), hidden: true, updatedAt: new Date(now + 5).toISOString() };
    await post(a, '', { spots: [hidden] });
    const again = await (await post(a, '/discover', {})).json();
    assert.equal(again.added, 0);
    assert.equal(again.hub.spots.find((s: any) => s.id === 'osm_n2').hidden, true);
    assert.equal(again.hub.ratings.length, 2);

    // The search is a one-off: it is stamped, and a refresh finds new places and notices closed ones.
    assert.ok(again.hub.place.searchedAt);
    assert.equal(again.hub.place.found, 2);
    shops = [shops[0], { id: 'osm_n3', name: 'Pizza Palace', cuisine: 'Pizza', lat: 53.99, lon: -1.542, source: 'osm' as const, updatedAt: stamp }];
    const refreshed = await (await post(a, '/discover', {})).json();
    assert.equal(refreshed.added, 1);
    assert.equal(refreshed.gone, 1, 'Wok This Way is no longer on the map');
    assert.equal(refreshed.hub.spots.find((s: any) => s.id === 'osm_n2').gone, true);
    assert.equal(refreshed.hub.ratings.length, 2, 'scores are kept');
    // A busy-map (incomplete) refresh never claims anything has closed, and a place that returns is un-marked.
    complete = false;
    shops = [shops[1]];
    const partial = await (await post(a, '/discover', {})).json();
    assert.equal(partial.gone, 0);
    assert.equal(partial.complete, false);
    assert.equal(partial.hub.spots.find((s: any) => s.id === 'osm_n1').gone, undefined);
    complete = true;
    shops = [{ ...shops[0], id: 'osm_n2', name: 'Wok This Way' }, shops[0]];
    const back = await (await post(a, '/discover', {})).json();
    assert.equal(back.hub.spots.find((s: any) => s.id === 'osm_n2').gone, undefined);

    // Another family sees nothing of it.
    const other = await (await fetch(`${baseUrl}/api/takeaways`, { headers: authed(b) })).json();
    assert.deepEqual([other.place, other.spots, other.ratings], [null, [], []]);
    const mine = await (await fetch(`${baseUrl}/api/takeaways`, { headers: authed(a) })).json();
    assert.equal(mine.ratings.length, 2);
  });
});

test('Server: a map service outage gives a calm error and keeps the family’s data', async () => {
  const { usePlaces, useStore } = await import('../../server');
  useStore(createFileStore(null));
  const { createPlaces } = await import('../server/places');
  usePlaces(createPlaces((async () => new Response('busy', { status: 504 })) as typeof fetch));
  await withServer(async (baseUrl) => {
    const a = await newHousehold(baseUrl);
    const res = await fetch(`${baseUrl}/api/takeaways/place`, { method: 'POST', headers: authed(a), body: JSON.stringify({ query: 'Leeds' }) });
    assert.equal(res.status, 502);
    assert.match((await res.json()).error, /try again/i);
    assert.deepEqual((await (await fetch(`${baseUrl}/api/takeaways`, { headers: authed(a) })).json()).spots, []);
  });
});

test('Takeaways: the map calls identify the app and have the right shape', async () => {
  const { createPlaces } = await import('../server/places');
  const seen: { url: string; ua: string; body?: string }[] = [];
  const fake = (async (url: string, init: any) => {
    seen.push({ url: String(url), ua: init?.headers?.['User-Agent'], body: init?.body });
    if (String(url).includes('nominatim')) return new Response(JSON.stringify([{ lat: '53.99', lon: '-1.54', address: { town: 'Harrogate' } }]));
    return new Response(JSON.stringify({ elements: [{ type: 'node', id: 9, lat: 53.99, lon: -1.54, tags: { name: 'Chippy', amenity: 'fast_food', cuisine: 'fish_and_chips' } }] }));
  }) as unknown as typeof fetch;
  const p = createPlaces(fake);
  assert.deepEqual(await p.geocode('Harrogate'), { label: 'Harrogate', lat: 53.99, lon: -1.54 });
  const near = await p.takeawaysNear(53.99, -1.54, 3000);
  assert.equal(near.complete, true);
  const spots = near.spots;
  assert.equal(spots[0].name, 'Chippy');
  assert.ok(seen.every((s) => /DinnerSpinner/.test(s.ua)), 'identifies itself');
  assert.ok(seen[0].url.includes('q=Harrogate'));
  assert.ok(decodeURIComponent(seen[1].body!).includes('around:3000,53.99000,-1.54000'));
});

test('Takeaways: when the Overpass servers are busy, it falls back to Nominatim and says the list may be incomplete', async () => {
  const { createPlaces } = await import('../server/places');
  const urls: string[] = [];
  const fake = (async (url: string) => {
    urls.push(String(url));
    if (!String(url).includes('nominatim')) return new Response('busy', { status: 502 });
    return new Response(
      JSON.stringify([
        { osm_type: 'node', osm_id: 5, lat: '53.991', lon: '-1.541', category: 'amenity', type: 'fast_food', name: 'Kebab King', address: { road: 'High St', postcode: 'HG1 1AA' }, extratags: { website: 'kebabking.example', cuisine: 'kebab' } },
        { osm_type: 'node', osm_id: 6, lat: '53.99', lon: '-1.54', category: 'amenity', type: 'restaurant', name: 'Sit Down Bistro', extratags: {} },
        { osm_type: 'way', osm_id: 7, lat: '53.99', lon: '-1.54', category: 'shop', type: 'hairdresser', name: 'Takeaway Cuts' },
      ])
    );
  }) as unknown as typeof fetch;
  const near = await createPlaces(fake, async () => {}).takeawaysNear(53.99, -1.54, 3000);
  assert.equal(near.complete, false);
  assert.deepEqual(near.spots.map((s) => s.name), ['Kebab King'], 'duplicates across searches collapse; non-takeaways are left out');
  assert.equal(near.spots[0].cuisine, 'Kebab');
  assert.equal(near.spots[0].website, 'https://kebabking.example');
  assert.ok(urls.some((u) => u.includes('bounded=1') && u.includes('viewbox=') && u.includes('extratags=1')));

  const dead = createPlaces((async () => new Response('no', { status: 503 })) as typeof fetch, async () => {});
  await assert.rejects(dead.takeawaysNear(53.99, -1.54, 3000), /busy/i);
});

test('Takeaways: each place gets its own website, directions and order-online links', async () => {
  const T = await import('./takeaways');
  const links = T.orderLinks({ name: "Joe's Pizza", address: '1 High St', lat: 53.99, lon: -1.54, website: 'https://joes.example' }, 'Harrogate');
  assert.equal(links.website, 'https://joes.example');
  assert.ok(links.directions.startsWith('https://www.google.com/maps/search/?api=1&query='));
  for (const [key, site] of [['justEat', 'just-eat.co.uk'], ['uberEats', 'ubereats.com'], ['deliveroo', 'deliveroo.co.uk']] as const) {
    const q = decodeURIComponent(links[key]);
    assert.ok(q.includes("Joe's Pizza Harrogate") && q.includes('site:' + site), key);
  }
  assert.equal(T.orderLinks({ name: 'X' }).website, undefined);
});

test('Takeaways: only one branch of each big chain is kept, the nearest to the town', async () => {
  const T = await import('./takeaways');
  assert.equal(T.chainOf("McDonald's"), 'mcdonalds');
  assert.equal(T.chainOf('McDonalds Restaurant'), 'mcdonalds');
  assert.equal(T.chainOf('KFC'), 'kfc');
  assert.equal(T.chainOf('Domino’s Pizza'), 'dominos');
  assert.equal(T.chainOf('Greggs'), 'greggs');
  assert.equal(T.chainOf('The Golden Wok'), null);
  assert.equal(T.chainOf("Leon's Chippy"), null, 'an independent that merely shares a first name');
  const el = (id: number, name: string, dLat: number) => ({ type: 'node', id, lat: 53.99 + dLat, lon: -1.54, tags: { name, amenity: 'fast_food' } });
  const spots = T.parseOverpass(
    { elements: [el(1, 'KFC', 0.02), el(2, 'KFC', 0.005), el(3, "McDonald's", 0.01), el(4, "McDonald's", 0.03), el(5, 'Spice Hut', 0.04), el(6, 'Spice Hut', 0.05)] },
    { lat: 53.99, lon: -1.54 }
  );
  assert.deepEqual(spots.map((s) => s.id), ['osm_n2', 'osm_n3', 'osm_n5', 'osm_n6'], 'nearest KFC and McDonald’s only; independents all stay');
  // Branches already in a saved hub collapse in the league too, keeping the most-scored (else nearest).
  const now = new Date().toISOString();
  const mk = (id: string, name: string, dLat: number) => ({ id, name, cuisine: 'Burgers', source: 'osm' as const, lat: 53.99 + dLat, lon: -1.54, updatedAt: now });
  const hub = {
    ...T.emptyHub(),
    spots: [mk('a', 'KFC', 0.001), mk('b', 'KFC', 0.02), mk('c', 'Wok This Way', 0.01)],
    ratings: [
      { id: 'b|mum', spotId: 'b', who: 'Mum', stars: 5, updatedAt: now },
      { id: 'b|dad', spotId: 'b', who: 'Dad', stars: 4, updatedAt: now },
    ],
  };
  const league = T.buildLeague(hub, { lat: 53.99, lon: -1.54 });
  assert.deepEqual(league.map((r) => r.spot.id), ['b', 'c'], 'the scored KFC wins; one row per chain');
});

test('Takeaways: the map search also catches curry houses and delivery restaurants that were never tagged as takeaways', async () => {
  const T = await import('./takeaways');
  const q = T.overpassQuery(53.99, -1.54, 3000);
  assert.ok(q.includes('"delivery"="yes"') && q.includes('"cuisine"~"indian|chinese'));
  const spots = T.parseNominatimSpots([
    [
      { osm_type: 'node', osm_id: 1, lat: '53.99', lon: '-1.54', category: 'amenity', type: 'restaurant', name: 'Taj Tandoori', extratags: { cuisine: 'indian' } },
      { osm_type: 'node', osm_id: 2, lat: '53.99', lon: '-1.54', category: 'amenity', type: 'restaurant', name: 'Le Fine Dining', extratags: { cuisine: 'french' } },
      { osm_type: 'node', osm_id: 3, lat: '53.99', lon: '-1.54', category: 'amenity', type: 'restaurant', name: 'Dine In Only', extratags: { cuisine: 'indian', takeaway: 'no' } },
    ],
  ]);
  assert.deepEqual(spots.map((s) => s.name), ['Taj Tandoori']);
});

test('Takeaways: a place can be added from its own website', async () => {
  const T = await import('./takeaways');
  const page = `<html><head><title>Golden Wok | Order online</title><script type="application/ld+json">{"@context":"https://schema.org","@type":"Restaurant","name":"The Golden Wok","servesCuisine":"chinese","telephone":"01423 555123","address":{"streetAddress":"4 High St","addressLocality":"Harrogate","postalCode":"HG1 1AA"},"geo":{"latitude":53.99,"longitude":-1.54}}</script></head></html>`;
  assert.deepEqual(T.placeFromHtml(page), {
    name: 'The Golden Wok',
    cuisine: 'Chinese',
    address: '4 High St, Harrogate, HG1 1AA',
    phone: '01423 555123',
    lat: 53.99,
    lon: -1.54,
  });
  assert.deepEqual(T.placeFromHtml('<html><head><title>Spice Hut - Takeaway in Leeds</title></head></html>'), { name: 'Spice Hut' });
  assert.equal(T.placeFromHtml('<html></html>'), null);

  const { usePageFetcher, useStore } = await import('../../server');
  useStore(createFileStore(null));
  usePageFetcher((async (url: string) => ({ html: url.includes('blank') ? '<html></html>' : page, url })) as any);
  await withServer(async (baseUrl) => {
    const lookup = (h: any, body: any) => fetch(`${baseUrl}/api/takeaways/lookup`, { method: 'POST', headers: authed(h), body: JSON.stringify(body) });
    assert.equal((await fetch(`${baseUrl}/api/takeaways/lookup`, { method: 'POST', headers: json, body: '{}' })).status, 401, 'family groups only');
    const a = await newHousehold(baseUrl);
    assert.equal((await lookup(a, {})).status, 400);
    const ok = await (await lookup(a, { url: 'https://goldenwok.example' })).json();
    assert.equal(ok.details.name, 'The Golden Wok');
    assert.equal(ok.website, 'https://goldenwok.example');
    const none = await lookup(a, { url: 'https://blank.example' });
    assert.equal(none.status, 422);
    assert.match((await none.json()).error, /type the name/i);
  });
  const { fetchPublicPage } = await import('../server/fetchPage');
  usePageFetcher(fetchPublicPage);
});

test('Takeaways: with a Google key, places come from Google (closed and non-takeaways left out), and OpenStreetMap is the fallback', async () => {
  const { createPlaces } = await import('../server/places');
  const { sameSpot } = await import('./takeaways');
  const calls: { url: string; headers: Record<string, string>; body: any }[] = [];
  const reply = {
    places: [
      { id: 'abc1', displayName: { text: 'Golden Wok' }, formattedAddress: '1 High St, Harrogate HG1 1AA, UK', location: { latitude: 53.991, longitude: -1.541 }, types: ['meal_takeaway', 'restaurant'], primaryTypeDisplayName: { text: 'Chinese restaurant' }, businessStatus: 'OPERATIONAL', nationalPhoneNumber: '01423 111111', websiteUri: 'https://goldenwok.example' },
      { id: 'abc2', displayName: { text: 'Shut Down Pizza' }, location: { latitude: 53.99, longitude: -1.54 }, types: ['pizza_restaurant'], businessStatus: 'CLOSED_PERMANENTLY' },
      { id: 'abc3', displayName: { text: 'Posh Dining Room' }, location: { latitude: 53.99, longitude: -1.54 }, types: ['restaurant'], businessStatus: 'OPERATIONAL' },
      { id: 'abc4', displayName: { text: 'Far Away Kebabs' }, location: { latitude: 54.5, longitude: -1.54 }, types: ['meal_takeaway'], businessStatus: 'OPERATIONAL' },
    ],
  };
  const fake = (async (url: string, init: any) => {
    if (String(url).includes('places.googleapis.com')) {
      calls.push({ url: String(url), headers: init.headers, body: JSON.parse(init.body) });
      return new Response(JSON.stringify(reply));
    }
    throw new Error('should not reach the map service');
  }) as unknown as typeof fetch;
  const near = await createPlaces(fake, async () => {}, 'test-key').takeawaysNear(53.99, -1.54, 3000);
  assert.deepEqual(near.spots.map((s) => s.name), ['Golden Wok'], 'one entry even though eight searches all returned it');
  assert.equal(near.spots[0].source, 'google');
  assert.equal(near.spots[0].cuisine, 'Chinese');
  assert.equal(near.spots[0].address, '1 High St, Harrogate HG1 1AA');
  assert.equal(near.spots[0].phone, '01423 111111');
  assert.equal(near.complete, false);
  assert.equal(calls.length, 8);
  assert.equal(calls[0].headers['X-Goog-Api-Key'], 'test-key');
  assert.ok(calls[0].headers['X-Goog-FieldMask'].includes('websiteUri'));
  assert.ok(!calls[0].headers['X-Goog-FieldMask'].includes('reviews'), 'asks only for cheap fields');

  // Google down: the map data takes over.
  let overpassTried = false;
  const down = (async (url: string) => {
    if (String(url).includes('places.googleapis.com')) return new Response('quota', { status: 429 });
    overpassTried = true;
    return new Response(JSON.stringify({ elements: [{ type: 'node', id: 9, lat: 53.99, lon: -1.54, tags: { name: 'Curry Palace', amenity: 'fast_food', cuisine: 'indian' } }] }));
  }) as unknown as typeof fetch;
  const fb = await createPlaces(down, async () => {}, 'test-key').takeawaysNear(53.99, -1.54, 3000);
  assert.ok(overpassTried);
  assert.deepEqual(fb.spots.map((s) => s.name), ['Curry Palace']);

  assert.ok(sameSpot({ name: 'The Golden Wok', lat: 53.991, lon: -1.541 }, { name: 'Golden Wok', lat: 53.9911, lon: -1.5411 }));
  assert.ok(!sameSpot({ name: 'Golden Wok', lat: 53.991, lon: -1.541 }, { name: 'Golden Wok', lat: 54.1, lon: -1.541 }), 'same name far apart is a different shop');
});
