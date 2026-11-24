import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { HttpError } from '../server/store';
import { extractRecipeFromHtml, isoMinutes, parseRecipeText, recipeFromJsonLd, spreadOffsets, timeStakeFor } from './recipeImport';
import { DELIVERY_SHOPS, listText, searchTerm } from './delivery';

process.env.NODE_ENV = 'test';
process.env.GEMINI_API_KEY = '';

const PAGE = `<html><head>
<script type="application/ld+json">{"@context":"https://schema.org","@graph":[{"@type":"WebSite"},{"@type":["Recipe"],"name":"Quick Chilli &amp; Rice","description":"A <b>weeknight</b> chilli.","recipeCuisine":"mexican","totalTime":"PT45M","recipeCategory":"Dinner","keywords":"easy, family","recipeIngredient":["500g beef mince","1 tin kidney beans, drained","1 onion, chopped"],"recipeInstructions":[{"@type":"HowToSection","itemListElement":[{"@type":"HowToStep","text":"Fry the onion."},{"@type":"HowToStep","text":"Add the mince and brown."}]},{"@type":"HowToStep","text":"Simmer with the beans."}]}]}</script>
</head><body>nothing else</body></html>`;

test('Recipe import: reads the structured recipe data every recipe site embeds', () => {
  const r = extractRecipeFromHtml(PAGE)!;
  assert.equal(r.title, 'Quick Chilli & Rice');
  assert.equal(r.description, 'A weeknight chilli.');
  assert.equal(r.cuisine, 'Mexican');
  assert.equal(r.timeStake, '60m');
  assert.deepEqual(r.ingredients, ['500g beef mince', '1 tin kidney beans, drained', '1 onion, chopped']);
  assert.equal(r.prepSteps.length, 3);
  assert.deepEqual(r.prepSteps.map((s) => /\(-(\d+)m\)$/.exec(s)![1]), ['45', '23', '0'], 'timings run from the cooking time down to serving');
  assert.ok(r.tags.includes('Imported'));
  assert.equal(extractRecipeFromHtml('<html>no data</html>'), null);
  assert.equal(recipeFromJsonLd({ '@type': 'Recipe', name: 'No ingredients' }), null);
  assert.equal(isoMinutes('PT1H15M'), 75);
  assert.equal(timeStakeFor(0), '30m');
  assert.deepEqual(spreadOffsets(['a (-5m)', 'b'], 20), ['a (-5m)', 'b (-0m)']);
});

test('Recipe import: pasted text is split by its Ingredients and Method headings', () => {
  const r = parseRecipeText(`Gran's Lancashire hotpot\nA winter classic, ready in 90 minutes.\n\nIngredients\n- 500g lamb\n- 2 onions\n* 4 potatoes\n\nMethod\n1. Brown the lamb.\n2. Layer with onions and potatoes.\n3) Bake slowly.`);
  assert.equal(r.title, "Gran's Lancashire hotpot");
  assert.deepEqual(r.ingredients, ['500g lamb', '2 onions', '4 potatoes']);
  assert.equal(r.prepSteps.length, 3);
  assert.ok(r.prepSteps[0].startsWith('Brown the lamb.'));
  assert.equal(r.timeStake, 'all-day', '90 minutes is more than an hour');
  // No headings at all still gives something to edit, never an error.
  const loose = parseRecipeText('Toast\n2 slices bread\nButter\nToast the bread for two minutes and spread the butter over it while hot.');
  assert.equal(loose.title, 'Toast');
  assert.ok(loose.ingredients.length >= 2 && loose.prepSteps.length >= 1);
  assert.equal(parseRecipeText('').title, 'New recipe');
});

test('Recipe import: the server never fetches private or internal addresses', async () => {
  const { fetchPublicPage, isPublicAddress } = await import('../server/fetchPage');
  for (const ip of ['127.0.0.1', '10.0.0.5', '192.168.1.1', '172.16.0.1', '169.254.169.254', '0.0.0.0', '::1', 'fd00::1', '::ffff:10.0.0.1']) {
    assert.equal(isPublicAddress(ip), false, ip);
  }
  assert.equal(isPublicAddress('93.184.216.34'), true);
  const never = (async () => {
    throw new Error('must not fetch');
  }) as unknown as typeof fetch;
  await assert.rejects(fetchPublicPage('http://127.0.0.1/admin', never), HttpError);
  await assert.rejects(fetchPublicPage('http://localhost/x', never, async () => ['127.0.0.1']), HttpError);
  await assert.rejects(fetchPublicPage('file:///etc/passwd', never), HttpError);
  const seen: string[] = [];
  const page = (async (u: string) => { seen.push(u); return new Response('<html></html>', { headers: { 'content-type': 'text/html' } }); }) as unknown as typeof fetch;
  const bare = await fetchPublicPage('twofatindians.co.uk/Home', page, async () => ['93.184.216.34']);
  assert.equal(bare.url, 'https://twofatindians.co.uk/Home', 'a bare address gets https://');
  assert.deepEqual(seen, ['https://twofatindians.co.uk/Home']);
  await assert.rejects(fetchPublicPage('http://user:pw@example.com/', never, async () => ['93.184.216.34']), HttpError);
  // A public page that redirects somewhere private is stopped at the redirect.
  const redirect = (async (url: string) =>
    String(url).includes('example.com')
      ? new Response(null, { status: 302, headers: { location: 'http://intranet.local/secret' } })
      : new Response('secret')) as unknown as typeof fetch;
  await assert.rejects(
    fetchPublicPage('https://example.com/r', redirect, async (h) => (h === 'example.com' ? ['93.184.216.34'] : ['10.1.2.3'])),
    /can’t be read/
  );
  const ok = await fetchPublicPage('https://example.com/r', (async () => new Response(PAGE, { headers: { 'content-type': 'text/html' } })) as unknown as typeof fetch, async () => ['93.184.216.34']);
  assert.ok(ok.html.includes('Quick Chilli'));
});

test('Recipe import: /api/recipes/import returns a recipe, or the page text when there is no recipe data', async () => {
  const { app, usePageFetcher } = await import('../../server');
  const server = http.createServer(app);
  await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const post = (body: unknown) => fetch(`${base}/api/recipes/import`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  try {
    usePageFetcher((async (url: string) => ({
      html: url.includes('plain') ? '<html><body><h1>Nan’s curry</h1><p>Ingredients</p><p>1 onion</p></body></html>' : PAGE,
      url,
    })) as any);
    assert.equal((await post({})).status, 400);
    const good = await (await post({ url: 'https://recipes.example/chilli' })).json();
    assert.equal(good.recipe.title, 'Quick Chilli & Rice');
    assert.ok(good.recipe.tags.includes('From a website'));
    const plain = await post({ url: 'https://recipes.example/plain' });
    assert.equal(plain.status, 422);
    assert.match((await plain.json()).text, /Nan’s curry/);
    usePageFetcher((async () => {
      throw new HttpError(400, { error: 'That address can’t be read.' });
    }) as any);
    assert.equal((await post({ url: 'http://10.0.0.1/' })).status, 400);
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    const { fetchPublicPage } = await import('../server/fetchPage');
    usePageFetcher(fetchPublicPage);
  }
});

test('Delivery: every supermarket gets a search link for each item, and apps get a home page', () => {
  const items = ['2 x semi-skimmed milk', '500g beef mince', 'onions'];
  assert.deepEqual(items.map(searchTerm), ['semi-skimmed milk', 'beef mince', 'onions']);
  const supers = DELIVERY_SHOPS.filter((s) => s.kind === 'supermarket');
  assert.ok(supers.length >= 5);
  for (const s of supers) {
    const url = s.search!('beef mince');
    assert.ok(url.startsWith('https://') && /beef(%20|\+)mince/.test(url), s.name);
  }
  const apps = DELIVERY_SHOPS.filter((s) => s.kind === 'app').map((s) => s.name);
  assert.deepEqual(apps.sort(), ['Just Eat', 'Uber Eats']);
  assert.equal(listText(['milk', 'eggs']), 'Shopping list:\n- milk\n- eggs');
});
