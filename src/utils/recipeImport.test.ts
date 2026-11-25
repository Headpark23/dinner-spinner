import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { HttpError } from '../server/store';
import {
  extractRecipeFromHtml,
  htmlToText,
  isPrepFragment,
  isoMinutes,
  looksLikeMethodSentence,
  parseIngredientInput,
  parseRecipeText,
  recipeFromJsonLd,
  repairImportedMeal,
  splitIngredientDisplay,
  spreadOffsets,
  timeStakeFor,
} from './recipeImport';
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

test('Recipe import tightening: commas stay inside ingredients, sentences never become ingredient checkboxes, and existing broken imports self-heal', async () => {
  const { WORLD_RECIPES } = await import('../data/worldRecipes');
  const { INITIAL_MEALS } = await import('../data/initialData');

  // 1. Multiline draft save never splits commas into separate checkboxes
  assert.deepEqual(
    parseIngredientInput('▢ 500g chicken thighs, boneless, diced\n1 tin kidney beans, drained and rinsed\n2 onions, finely chopped'),
    ['500g chicken thighs, boneless, diced', '1 tin kidney beans, drained and rinsed', '2 onions, finely chopped']
  );

  // 2. HTML fallback keeps line breaks so parseRecipeText separates ingredients from method sentences
  const html = `<html><body>
    <h1>Sticky Honey Garlic Salmon</h1>
    <p>Serves 4</p>
    <h2>Ingredients (serves 4)</h2>
    <ul><li>4 salmon fillets, skinless</li><li>2 tbsp soy sauce</li><li>2 tbsp honey</li></ul>
    <h2>Instructions</h2>
    <p>Heat a non-stick pan over medium heat and sear the salmon for 4 minutes.</p>
    <p>Pour in the honey and soy sauce and simmer for 2 minutes until sticky.</p>
    <h2>Nutrition</h2><p>420 kcal</p>
  </body></html>`;
  const parsedFromHtml = parseRecipeText(htmlToText(html));
  assert.equal(parsedFromHtml.title, 'Sticky Honey Garlic Salmon');
  assert.deepEqual(parsedFromHtml.ingredients, ['4 salmon fillets, skinless', '2 tbsp soy sauce', '2 tbsp honey']);
  assert.equal(parsedFromHtml.prepSteps.length, 2);
  assert.ok(!parsedFromHtml.prepSteps.some((s) => /420 kcal/i.test(s)), 'stops before nutrition footer');

  // 3. Soft line-wraps in PDF/Word/text join back into whole sentences rather than broken checkboxes
  const wrapped = parseRecipeText(`One-Pan Orzo\nIngredients\n300g orzo\n1 onion,\nfinely chopped\n2 garlic cloves\n1. Heat the oil in a deep frying pan over\nmedium heat and fry the onion for\n5 minutes until soft.\n2. Stir in the orzo and stock and simmer for 12 minutes.`);
  assert.deepEqual(wrapped.ingredients, ['300g orzo', '1 onion, finely chopped', '2 garlic cloves']);
  assert.equal(wrapped.prepSteps.length, 2);
  assert.match(wrapped.prepSteps[0], /^Heat the oil in a deep frying pan over medium heat and fry the onion for 5 minutes until soft\./);

  // 4. Self-heals already-saved recipes that were shredded by the old comma splitter or had leaked method clauses
  const brokenMeal: any = {
    id: 'meal_broken',
    title: 'Imported Curry',
    description: 'Test',
    cuisine: 'Indian',
    timeStake: '30m',
    effort: 'one-pot',
    source: 'own',
    tags: ['Family recipe'],
    ingredients: [
      '▢ 500g chicken thighs',
      'boneless and skinless',
      'cut into chunks',
      '1 large onion',
      'finely chopped',
      '1 tin chopped tomatoes',
      'drained',
      'Heat the oil in a large pan over medium heat',
      'add the onion and cook for 5 minutes until softened',
      'then stir in the chicken and tomatoes and simmer for 15 minutes.',
    ],
    prepSteps: ['Prep and chop everything (-20m)', 'Cook the main (-12m)', 'Finish the sauce and season (-4m)', 'Serve (-0m)'],
  };
  const healed = repairImportedMeal(brokenMeal);
  assert.deepEqual(healed.ingredients, [
    '500g chicken thighs, boneless and skinless, cut into chunks',
    '1 large onion, finely chopped',
    '1 tin chopped tomatoes, drained',
  ]);
  assert.equal(healed.prepSteps.length, 1);
  assert.match(healed.prepSteps[0], /^Heat the oil in a large pan over medium heat, add the onion/);

  // 5. Display splitter highlights leading quantities and prep notes cleanly
  assert.deepEqual(splitIngredientDisplay('500g chicken thighs, boneless, diced'), {
    qty: '500g',
    item: 'chicken thighs',
    prep: 'boneless, diced',
  });

  // 6. Zero false positives across all 120+ bundled ingredients
  for (const m of [...INITIAL_MEALS, ...WORLD_RECIPES]) {
    for (const ing of m.ingredients) {
      assert.equal(isPrepFragment(ing), false, `Bundled ingredient falsely flagged as prep fragment: "${ing}" in ${m.id}`);
      assert.equal(looksLikeMethodSentence(ing), false, `Bundled ingredient falsely flagged as method sentence: "${ing}" in ${m.id}`);
    }
  }
});

test('Guessed dish photos & og:image import: every dish and cuisine resolves to a real bundled food photo with zero flags or O tiles', async () => {
  const fs = await import('node:fs');
  const { WORLD_RECIPES } = await import('../data/worldRecipes');
  const { INITIAL_MEALS } = await import('../data/initialData');
  const { POPULAR_CUISINES } = await import('../data/popularCuisines');
  const { PHOTO_CREDITS, resolveMealPhoto, cuisinePhotoUrl } = await import('../data/photos');

  const checkLocalUrl = (url: string, label: string) => {
    const m = /^\/photos\/([a-z0-9_]+)\.webp$/.exec(url);
    assert.ok(m, `Expected local webp URL for ${label}, got ${url}`);
    assert.ok(PHOTO_CREDITS[m[1]], `Missing credit for ${m[1]} (${label})`);
    assert.equal(fs.existsSync(`public${url}`), true, `Missing image file public${url} (${label})`);
  };

  // Every built-in and world recipe gets a verified local food photo (exact or smartly guessed)
  for (const meal of [...INITIAL_MEALS, ...WORLD_RECIPES]) {
    const res = resolveMealPhoto(meal);
    checkLocalUrl(res.url, meal.id);
    checkLocalUrl(res.fallbackUrl, `${meal.id} fallback`);
  }

  // Custom/imported dishes & combo spins match sensible food photography and never fall back to flags or letters
  const salmon = resolveMealPhoto({ id: 'meal_custom_1', title: 'Sticky Honey Garlic Salmon', cuisine: 'Other', ingredients: ['salmon', 'honey'] });
  assert.equal(salmon.url, '/photos/w_teriyaki.webp');
  assert.equal(salmon.guessed, true);

  const lasagne = resolveMealPhoto({ id: 'meal_custom_2', title: "Mum's Lasagne", cuisine: 'Other', ingredients: ['beef mince', 'pasta'] });
  assert.equal(lasagne.url, '/photos/w_lasagne.webp');

  const mystery = resolveMealPhoto({ id: 'meal_custom_3', title: 'Tuesday Surprise', cuisine: 'Other', ingredients: ['salt'] });
  checkLocalUrl(mystery.url, 'mystery fallback');

  // External imported URLs keep their URL as primary and retain a local fallbackUrl if blocked/broken
  const external = resolveMealPhoto({
    id: 'meal_custom_4',
    title: 'Crispy Tacos',
    cuisine: 'Mexican',
    imageUrl: 'https://images.example.com/tacos.jpg',
  });
  assert.equal(external.url, 'https://images.example.com/tacos.jpg');
  assert.equal(external.guessed, false);
  assert.equal(external.fallbackUrl, '/photos/w_tacos_pastor.webp');

  // Every World Kitchen cuisine chip resolves to a real dish thumbnail
  for (const c of [{ id: 'all' }, ...POPULAR_CUISINES, { id: 'other' }]) {
    checkLocalUrl(cuisinePhotoUrl(c.id), `cuisine:${c.id}`);
  }

  // JSON-LD image & og:image extraction
  const withOg = extractRecipeFromHtml(
    `<html><head><meta property="og:image" content="https://cdn.example.com/chilli-hero.jpg" />` +
      PAGE.replace('<html><head>', '')
  )!;
  assert.equal(withOg.imageUrl, 'https://cdn.example.com/chilli-hero.jpg');

  // repairImportedMeal upgrades old "Other" recipes to an inferred cuisine
  const oldOther: any = {
    id: 'meal_old_other',
    title: "Mum's Lasagne",
    description: 'Classic bake',
    cuisine: 'Other',
    timeStake: '60m',
    effort: 'standard',
    source: 'own',
    tags: ['Imported'],
    ingredients: ['500g beef mince', 'lasagne sheets'],
    prepSteps: ['Bake until bubbling (-0m)'],
  };
  assert.equal(repairImportedMeal(oldOther).cuisine, 'Italian');
});
