# Dinner Spinner

A pub fruit machine for deciding what's for dinner. Spin your household's recipes, use up what's in the fridge, vote on it together, cook to a timeline, and score it afterwards.

Built with React 19, TypeScript, Tailwind CSS v4 and Vite, served by a small Express server (which also handles the shared shopping list and optional Gemini photo scanning).

## Where things are

Five tabs, each named for what you'll find there:

| Tab | What's inside |
|---|---|
| **Dinner** | The evening in four steps: Pick (spin) → Vote → Cook (timeline) → Rate |
| **Recipes** | Your dishes, the 119 World Kitchen classics, add or scan a recipe, hidden dishes |
| **Shopping** | The shared household list |
| **Fridge** | What you have, always-have staples, never-use ingredients, scan a fridge or receipt |
| **More** | Takeaway, history and ratings, household and backup, how it works, sound |

## What it does

- **Spin**: three machines (your recipes, build-a-plate from 3 reels, or a 4-reel Sunday roast), with hold, nudge and a lever. You can filter by time and washing-up, and the spinner can favour dishes that use up "use next" fridge items.
- **World Kitchen**: 119 classic dinners from 46 cuisines to browse and add to your rotation.
- **Recipe sheet**: a photo, the method, and a "what do you have?" checklist. Anything you don't tick goes onto the shared shopping list.
- **Make it yours**: add your own ingredients, steps (with timing) and a note to any recipe. The original is kept, and your additions show up in the cooking timeline.
- **Not for us**: hide a dish for good, and a similar one from the World Kitchen replaces it automatically. Hidden dishes can be brought back.
- **Your own recipes**: add them by hand, or scan a recipe page or plate photo.
- **Tonight**: the household votes on one phone, or each person votes on their own phone once the household is set up (More, then Household and backup), with vetoes. Three vetoes in a row closes the kitchen and sends you to the takeaway spinner. A majority yes builds a timeline back from when you want to eat.
- **After dinner**: everyone gives the dish stars and a quick comment. The average becomes the dish's rating.
- **Shared shopping list**: one list for the whole household. Whoever's at the shop ticks items off ("Got it · Mum") and everyone else sees it within seconds. "Put away" moves ticked items into the fridge.
- **Shopping icons**: each shopping item gets a small picture, and ticked items are struck through.
- **Cooking reminders**: on the Cook step, "Remind me" sends a notification when each step is due.
- **Shared fridge and history**: once a household exists, the fridge and cooking history sync between phones within seconds. Without one the app stays on-device. The recipe book (your recipes, hidden dishes, favourites, ratings) is not live-shared; use backup and restore to move it.
- **Family group**: the first screen leads with it. Sign in with Google (or start one without) and everyone shares the shopping list, the fridge and the live vote across phones. Invite people with a link; they sign in and they're in. A new phone just signs in again.
- **Cook from what we have**: a card on the Dinner tab spins for a dinner that needs nothing from the shop. It mixes your saved recipes that are fully covered by the fridge and staples with "cupboard ideas" (pasta and tinned tomatoes, eggs and rice, lentils, beans...), and favours things that rescue "use next" fridge items. Matching is by ingredient name, so it is a good guess, not a guarantee.
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

### Google sign-in (optional)

Without it, "Start a family group" creates a group with a code and invite link. To add the Google button:

1. In Google Cloud Console create an OAuth client of type *Web application* and add your site's address (and `http://localhost:3000`) as an authorised JavaScript origin.
2. Set `GOOGLE_CLIENT_ID` to that client id on the server (Vercel: Project Settings, Environment Variables).

The server checks each sign-in with Google and only keeps a hash of the Google account id, the name and the email.

## Recipes and photos

World Kitchen recipe text is written for this project. Dish photos are freely licensed images from Wikimedia Commons (CC0, public domain, CC BY or CC BY-SA), resized and stored in `public/photos/`. Each photo's author, licence and source page are recorded in `src/data/photoCredits.json` and shown in the app under *How it works → Recipes and photo credits*, and under each photo.

To refresh or replace photos:

```bash
python -I scripts/fetch_photos.py                          # fetch any missing
python -I scripts/fetch_photos.py --override w_pho="File:Some better photo.jpg"
```

See `DESIGN.md` for the design system and `SCAFFOLD_HEALTH.md` for the original audit.
