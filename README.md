# Dinner Spinner

A pub fruit machine for deciding what's for dinner. Spin your household's recipes, use up what's in the fridge, vote on it together, cook to a timeline, and score it afterwards.

Built with React 19, TypeScript, Tailwind CSS v4 and Vite, served by a small Express server (which also handles the shared shopping list and optional Gemini photo scanning).

## What it does

- **Spin**: three machines (your recipes, build-a-plate from 3 reels, or a 4-reel Sunday roast), with hold, nudge and a lever. You can filter by time and washing-up, and the spinner can favour dishes that use up "use next" fridge items.
- **World Kitchen**: 119 classic dinners from 46 cuisines to browse and add to your rotation.
- **Recipe sheet**: a photo, the method, and a "what do you have?" checklist. Anything you don't tick goes onto the shared shopping list.
- **Make it yours**: add your own ingredients, steps (with timing) and a note to any recipe. The original is kept, and your additions show up in the cooking timeline.
- **Not for us**: hide a dish for good, and a similar one from the World Kitchen replaces it automatically. Hidden dishes can be brought back.
- **Your own recipes**: add them by hand, or scan a recipe page or plate photo.
- **Tonight**: the household votes on one phone, with vetoes. Three vetoes in a row closes the kitchen and sends you to the takeaway spinner. A majority yes builds a timeline back from when you want to eat.
- **After dinner**: everyone gives the dish stars and a quick comment. The average becomes the dish's rating.
- **Shared shopping list**: one list for the whole household. Whoever's at the shop ticks items off ("Got it · Mum") and everyone else sees it within seconds. "Put away" moves ticked items into the fridge.
- **Stats**: built only from what you've actually logged.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

To share the shopping list across the household, open the app from each phone using the computer's local network address (for example `http://192.168.1.20:3000`) or a hosted copy. Everyone using the same server shares one list.

Optional: set `GEMINI_API_KEY` in `.env` for live fridge, receipt and recipe scanning. Without it, the "Try a sample" buttons and the fallback still work.

```bash
npm test        # engine, server and UI render tests
npm run lint    # type-check
npm run build
```

## Recipes and photos

World Kitchen recipe text is written for this project. Dish photos are freely licensed images from Wikimedia Commons (CC0, public domain, CC BY or CC BY-SA), resized and stored in `public/photos/`. Each photo's author, licence and source page are recorded in `src/data/photoCredits.json` and shown in the app under *How it works → Recipes and photo credits*, and under each photo.

To refresh or replace photos:

```bash
python -I scripts/fetch_photos.py                          # fetch any missing
python -I scripts/fetch_photos.py --override w_pho="File:Some better photo.jpg"
```

See `DESIGN.md` for the design system and `SCAFFOLD_HEALTH.md` for the original audit.
