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
- **Shared fridge, cupboard, recipes and history**: once a household exists, the fridge, store cupboard, recipe book (your recipes, tweaks, favourites, ratings, hidden dishes), likes and dislikes, "always have" staples and cooking history sync between phones within seconds. The first phone in a group brings its lists; a phone joining later keeps the group's and adds its own recipes, scans and cupboard items. Without a group the app stays on-device.
- **Store cupboard**: Fridge, then Cupboard (or the shortcut under the spinner). Tins, jars, sauces, spices and dry goods, sorted onto shelves automatically. Tap "In stock" when something runs low and it goes on the shopping list. Cupboard items count as "have it" in recipes. "Photo of the cupboard" lists a shelf for you, and receipt scans put tins and sauces in the cupboard.
- **Vote notifications**: put a dish to every phone and the others get a notification, even with the app closed; you hear back as each person votes, and when dinner is agreed or vetoed. Turn it on under Tonight (or More). On iPhone, add the app to the Home Screen first (iOS 16.4+). Needs the https address, so it works on the hosted app, not over `http://192.168...`.
- **Family group**: the first screen leads with it. Sign in with Google (or start one without) and everyone shares the shopping list, the fridge and the live vote across phones. Invite people with a link; they sign in and they're in. A new phone just signs in again.
- **Recipes that follow your tastes**: Likes & dislikes, a shortcut under the spinner (also Fridge, then Likes & dislikes). Add something you never want and every dish containing it leaves your recipes (shelved, not deleted) and is replaced by a World Kitchen dish that fits, favouring things you love. Take it off the list and the shelved dishes come back. Add something you love and a few World Kitchen dishes built on it join your recipes. The welcome questions do the same on day one.
- **Cook from what we have**: a card on the Dinner tab spins for a dinner that needs nothing from the shop. It mixes your saved recipes that are fully covered by the fridge and staples with "cupboard ideas" (pasta and tinned tomatoes, eggs and rice, lentils, beans...), and favours things that rescue "use next" fridge items. Matching is by ingredient name, so it is a good guess, not a guarantee.
- **Family takeaway league** (family groups only): More, then Order takeaway. Type your town or postcode (never your phone's location) and the app finds the takeaways nearby from OpenStreetMap. Everyone scores them with stars and a note of what they like and don't, from their own phone, and the scores combine into a league table of favourites with each person's notes. The takeaway spinner then draws from the same list, favouring the high scorers. Scores merge by person and place, so two phones scoring at once never lose each other's votes.
- **Stats**: built only from what you've actually logged.

## Run locally

Requires Node.js 20+.

```bash
npm install
npm run dev
```

To share the shopping list across the household, open the app from each phone using the computer's local network address (for example `http://192.168.1.20:3000`) or a hosted copy. Everyone using the same server shares one list.

Optional: set `GEMINI_API_KEY` in `.env` for live fridge, cupboard, receipt and recipe scanning. Without it, the "Try a sample" buttons still work. Photos are shrunk on the phone before upload (Vercel refuses bodies over 4.5 MB). The scanner tries `gemini-3.5-flash` (override with `GEMINI_MODEL`), then fast "lite" models, because the newest flash models are often overloaded.

Vote notifications use Web Push. The server's push keys must stay the same between deploys: set `VAPID_PUBLIC_KEY` and `VAPID_PRIVATE_KEY` (make a pair with `npx web-push generate-vapid-keys`), or the server derives a stable pair from `VAPID_SEED`, falling back to `GEMINI_API_KEY`. If the keys change, each phone re-registers the next time it opens the app.

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

### Local takeaways (no setup, no key)

The finder uses OpenStreetMap's free services, called from the server: Nominatim turns a town or postcode into a place, and Overpass lists named `amenity=fast_food` (unless `takeaway=no`) and `amenity=restaurant` with `takeaway=yes|only` within 1 to 5 miles. Google Places would need a paid key, so it isn't used. Coverage depends on what mappers have added, so some shops will be missing; add them by hand (they are shared with the family too). The public Overpass servers are sometimes busy; the app tries two mirrors and then asks you to try again in a minute. Please keep to OpenStreetMap's usage policies (the server sends a `DinnerSpinner` user agent and rate-limits lookups). Map data is © OpenStreetMap contributors (ODbL).

API (all require the family code headers): `GET/POST /api/takeaways` (merge spots, scores and notes), `POST /api/takeaways/place` (`{query}`), `POST /api/takeaways/discover` (`{radiusM}`).

## Recipes and photos

World Kitchen recipe text is written for this project. Dish photos are freely licensed images from Wikimedia Commons (CC0, public domain, CC BY or CC BY-SA), resized and stored in `public/photos/`. Each photo's author, licence and source page are recorded in `src/data/photoCredits.json` and shown in the app under *How it works → Recipes and photo credits*, and under each photo.

To refresh or replace photos:

```bash
python -I scripts/fetch_photos.py                          # fetch any missing
python -I scripts/fetch_photos.py --override w_pho="File:Some better photo.jpg"
```

See `DESIGN.md` for the design system and `SCAFFOLD_HEALTH.md` for the original audit.
