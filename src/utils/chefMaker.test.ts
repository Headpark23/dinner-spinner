import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { buildChefPrompt, chefRecipeToMeal, normalizeChefRecommendations } from './chefMaker';
import { createChefRecommender } from '../server/chefRecommend';

test('buildChefPrompt highlights use-next fridge items, spotlight choices, and dietary limits', () => {
  const prompt = buildChefPrompt({
    fridge: [
      { name: 'Spinach', freshness: 'red' },
      { name: 'Halloumi', freshness: 'green' },
    ],
    cupboard: ['Chickpeas', 'Harissa'],
    freezer: [],
    staples: ['Olive Oil', 'Garlic'],
    focusIngredients: ['Halloumi'],
    mealSlot: 'dinner',
    style: 'chef-special',
    diets: ['vegetarian'],
    avoid: ['mushrooms'],
    servings: 2,
    excludeTitles: ['Old Dish'],
  });

  assert.match(prompt, /URGENT USE-NEXT FRIDGE ITEMS.*Spinach/);
  assert.match(prompt, /MUST SPOTLIGHT THESE INGREDIENTS: Halloumi/);
  assert.match(prompt, /vegetarian/);
  assert.match(prompt, /mushrooms/);
  assert.match(prompt, /Old Dish/);
});

test('normalizeChefRecommendations infers red rescues, sorts steps descending, and converts cleanly to a Meal', () => {
  const recs = normalizeChefRecommendations(
    [
      {
        title: 'Charred Halloumi & Harissa Chickpeas',
        description: 'Crisp golden halloumi over smoky braised chickpeas.',
        cuisine: 'Middle Eastern',
        chefInspiration: 'Yotam Ottolenghi-style charred veg',
        whyItWorks: 'Uses your spinach before it wilts.',
        chefTip: 'Finish with lemon zest right before serving.',
        timeStake: '20m',
        effort: 'one-pot',
        servings: 2,
        ingredients: ['250g halloumi', '1 tin chickpeas', '100g spinach'],
        usesFromKitchen: ['Halloumi', 'Chickpeas', 'Spinach'],
        optionalExtras: ['Lemon'],
        steps: [
          { title: 'Wilt & serve', instruction: 'Fold in spinach and serve.', minutesBefore: 0 },
          { title: 'Sear halloumi', instruction: 'Fry halloumi until deep golden.', minutesBefore: 15 },
        ],
        tags: ['Vegetarian'],
      },
    ],
    ['Spinach'],
    2
  );

  assert.equal(recs.length, 1);
  assert.deepEqual(recs[0].rescues, ['Spinach']);
  assert.equal(recs[0].steps[0].minutesBefore, 15);
  assert.equal(recs[0].steps[1].minutesBefore, 0);

  const meal = chefRecipeToMeal(recs[0]);
  assert.equal(meal.title, 'Charred Halloumi & Harissa Chickpeas');
  assert.ok(meal.tags.includes('AI Chef'));
  assert.equal(meal.prepSteps.length, 2);
  assert.match(meal.prepSteps[0], /\(-15m\)$/);
});

test('createChefRecommender enriches dish hero and step photos via photoSearch', async () => {
  const recommender = createChefRecommender({
    generate: async () => ({
      text: JSON.stringify({
        recommendations: [
          {
            title: 'Pan-Seared Chicken Piccata',
            description: 'Bright lemon-caper pan sauce.',
            cuisine: 'Italian',
            chefInspiration: 'J. Kenji López-Alt pan sauce method',
            whyItWorks: 'Turns fridge chicken thighs into a 20-minute classic.',
            chefTip: 'Swirl cold butter off the heat to emulsify.',
            timeStake: '20m',
            effort: 'one-pot',
            servings: 4,
            photoQuery: 'chicken piccata lemon',
            ingredients: ['600g chicken thighs', '2 tbsp capers'],
            usesFromKitchen: ['Chicken thighs'],
            optionalExtras: ['Capers'],
            steps: [
              {
                title: 'Sear chicken',
                instruction: 'Brown skin-side down for 6 minutes.',
                minutesBefore: 15,
                visualCue: 'Deep mahogany crust',
                photoQuery: 'pan seared chicken',
              },
              {
                title: 'Finish pan sauce',
                instruction: 'Deglaze with lemon juice and butter.',
                minutesBefore: 0,
                visualCue: 'Glossy sauce coating the spoon',
                photoQuery: 'lemon butter pan sauce',
              },
            ],
          },
        ],
      }),
    }),
    findPhoto: async (q) => ({
      url: `https://upload.wikimedia.org/mock/${encodeURIComponent(q)}.jpg`,
      credit: {
        author: 'Test Chef',
        license: 'CC BY-SA 4.0',
        licenseUrl: 'https://creativecommons.org/licenses/by-sa/4.0/',
        source: 'https://commons.wikimedia.org/',
      },
    }),
  });

  const { recommendations } = await recommender({
    fridge: [{ name: 'Chicken thighs', freshness: 'red' }],
    cupboard: ['Capers'],
    freezer: [],
    staples: ['Butter'],
  });

  assert.equal(recommendations.length, 1);
  assert.match(recommendations[0].imageUrl || '', /chicken%20piccata%20lemon/);
  assert.match(recommendations[0].steps[0].imageUrl || '', /pan%20seared%20chicken/);
  assert.match(recommendations[0].steps[1].imageUrl || '', /lemon%20butter%20pan%20sauce/);
});

test('Server: POST /api/chef/recommend validates inventory and returns photo-enriched chef dishes', async () => {
  process.env.NODE_ENV = 'test';
  const { app, useChefRecommender } = await import('../../server');
  const server = http.createServer(app);
  await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
  const port = (server.address() as any).port;
  const base = `http://127.0.0.1:${port}`;

  try {
    // Empty inventory -> 400
    const emptyRes = await fetch(`${base}/api/chef/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ fridge: [], cupboard: [], freezer: [], staples: [] }),
    });
    assert.equal(emptyRes.status, 400);

    // Mocked recommender -> 200 with recommendations
    useChefRecommender(
      createChefRecommender({
        generate: async () => ({
          text: JSON.stringify({
            recommendations: [
              {
                title: 'Crispy Courgette Carbonara',
                description: 'Silky egg & parmesan sauce with caramelised courgettes.',
                cuisine: 'Italian',
                chefInspiration: 'Nigella Lawson courgette pasta',
                whyItWorks: 'Rescues courgettes with store-cupboard spaghetti.',
                chefTip: 'Toss off the heat so the eggs turn glossy, never scrambled.',
                timeStake: '20m',
                effort: 'one-pot',
                servings: 4,
                photoQuery: 'courgette pasta',
                ingredients: ['2 courgettes', '400g spaghetti', '3 eggs'],
                usesFromKitchen: ['Courgettes', 'Spaghetti', 'Eggs'],
                steps: [
                  {
                    title: 'Caramelise courgettes',
                    instruction: 'Cook sliced courgettes slowly in olive oil until sweet.',
                    minutesBefore: 12,
                    visualCue: 'Golden edges and jammy centres',
                    photoQuery: 'sauteed courgettes',
                  },
                  {
                    title: 'Emulsify sauce',
                    instruction: 'Toss hot pasta off the heat with egg mixture and pasta water.',
                    minutesBefore: 0,
                    visualCue: 'Silky glaze coating every strand',
                  },
                ],
              },
            ],
          }),
        }),
        findPhoto: async (q) => ({
          url: `https://upload.wikimedia.org/mock/${encodeURIComponent(q)}.jpg`,
          credit: {
            author: 'Wikimedia Cook',
            license: 'CC0',
            licenseUrl: 'https://creativecommons.org/publicdomain/zero/1.0/',
            source: 'https://commons.wikimedia.org/',
          },
        }),
      })
    );

    const okRes = await fetch(`${base}/api/chef/recommend`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fridge: [{ name: 'Courgettes', freshness: 'red' }],
        cupboard: ['Spaghetti'],
        freezer: [],
        staples: ['Eggs'],
      }),
    });
    assert.equal(okRes.status, 200);
    const body: any = await okRes.json();
    assert.equal(body.recommendations.length, 1);
    assert.equal(body.recommendations[0].title, 'Crispy Courgette Carbonara');
    assert.deepEqual(body.recommendations[0].rescues, ['Courgettes']);
    assert.match(body.recommendations[0].imageUrl, /courgette%20pasta/);
  } finally {
    useChefRecommender(null);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
