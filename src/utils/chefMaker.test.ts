import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { buildChefPrompt, chefRecipeToMeal, normalizeChefRecommendations } from './chefMaker';
import { createChefRecommender } from '../server/chefRecommend';

test('buildChefPrompt highlights use-next fridge items, spotlight choices, 5 UK top chefs, and dietary limits', () => {
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

  assert.match(prompt, /Jamie Oliver/);
  assert.match(prompt, /Gordon Ramsay/);
  assert.match(prompt, /Nigella Lawson/);
  assert.match(prompt, /Tom Kerridge/);
  assert.match(prompt, /Nadiya Hussain/);
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
        chefInspiration: 'Nadiya Hussain — spiced weeknight shortcut',
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

test('createChefRecommender returns fast structured chef dishes without external photo lookups', async () => {
  const recommender = createChefRecommender({
    generate: async () => ({
      text: JSON.stringify({
        recommendations: [
          {
            title: 'Pan-Seared Chicken Piccata',
            description: 'Bright lemon-caper pan sauce.',
            cuisine: 'Italian',
            chefInspiration: 'Gordon Ramsay — crispy-skin pan sauce',
            whyItWorks: 'Turns fridge chicken thighs into a 20-minute classic.',
            chefTip: 'Swirl cold butter off the heat to emulsify.',
            timeStake: '20m',
            effort: 'one-pot',
            servings: 4,
            ingredients: ['600g chicken thighs', '2 tbsp capers'],
            usesFromKitchen: ['Chicken thighs'],
            optionalExtras: ['Capers'],
            steps: [
              {
                title: 'Sear chicken',
                instruction: 'Brown skin-side down for 6 minutes.',
                minutesBefore: 15,
                visualCue: 'Deep mahogany crust',
              },
              {
                title: 'Finish pan sauce',
                instruction: 'Deglaze with lemon juice and butter.',
                minutesBefore: 0,
                visualCue: 'Glossy sauce coating the spoon',
              },
            ],
          },
        ],
      }),
    }),
  });

  const { recommendations } = await recommender({
    fridge: [{ name: 'Chicken thighs', freshness: 'red' }],
    cupboard: ['Capers'],
    freezer: [],
    staples: ['Butter'],
  });

  assert.equal(recommendations.length, 1);
  assert.equal(recommendations[0].chefInspiration, 'Gordon Ramsay — crispy-skin pan sauce');
  assert.equal(recommendations[0].steps.length, 2);
});

test('Server: POST /api/chef/recommend validates inventory and returns fast chef dishes', async () => {
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
                chefInspiration: 'Nigella Lawson — cosy one-pan pasta',
                whyItWorks: 'Rescues courgettes with store-cupboard spaghetti.',
                chefTip: 'Toss off the heat so the eggs turn glossy, never scrambled.',
                timeStake: '20m',
                effort: 'one-pot',
                servings: 4,
                ingredients: ['2 courgettes', '400g spaghetti', '3 eggs'],
                usesFromKitchen: ['Courgettes', 'Spaghetti', 'Eggs'],
                steps: [
                  {
                    title: 'Caramelise courgettes',
                    instruction: 'Cook sliced courgettes slowly in olive oil until sweet.',
                    minutesBefore: 12,
                    visualCue: 'Golden edges and jammy centres',
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
        chefFocus: 'Nigella Lawson',
      }),
    });
    assert.equal(okRes.status, 200);
    const body: any = await okRes.json();
    assert.equal(body.recommendations.length, 1);
    assert.equal(body.recommendations[0].title, 'Crispy Courgette Carbonara');
    assert.deepEqual(body.recommendations[0].rescues, ['Courgettes']);
  } finally {
    useChefRecommender(null);
    await new Promise<void>((resolve) => server.close(() => resolve()));
  }
});
