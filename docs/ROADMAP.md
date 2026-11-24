# Dinner Spinner roadmap

Plan for the next twelve improvements. Written after the Freezer feature landed, and checked against the code, so some items differ from the first idea list (see "Corrections to the brief").

Effort: S = under a day, M = 1 to 3 days, L = a week or more.

## Corrections to the brief

- **Cost per serving (8) is not "already there".** `Meal.estimatedCostPerHead` exists in `src/types/index.ts` but no recipe in `initialData.ts` or `worldRecipes.ts` sets it. Item 8 needs the data filled in first (see below).
- **Tesco (7) is not mentioned in `VotingView.tsx` or anywhere in `src/`.** Supermarket links are only in the backlog in `PRODUCT_EVOLUTION.md`. Nothing to reuse; start clean.
- **PWA (2) confirmed missing.** No manifest, no service worker, no `public/manifest` (only `public/photos`).
- **Voting (4) and the shopping list share a server, but it is a single global list.** `server.ts` writes one `.shopping-list.json` with no household or room concept. Rooms need that added; copying the shopping method as-is would mix every household's votes together.
- **Alerts (3) and the week planner (1) both depend on state that today lives only on one phone** (`reverseTimers`, `agreedMeal`).

## Order of work

| Phase | Items | Why this order |
| --- | --- | --- |
| 0 | Freezer (done) | Shipped. Feeds item 1 and item 6. |
| 1 | 2 Installable and offline, 1 Week planner | Offline is the groundwork. The planner changes what the app is for. They touch different files, so they can run in parallel. |
| 2 | 3 Step alerts, 7 Supermarket links, 8 Cost per serving | Small, high-value, mostly independent. |
| 3 | 5 Dietary needs, 6 Leftovers, 11 Seasonal | Change the eligibility and weighting engine. Do them together so the engine is touched once and tested once. |
| 4 | 4 Voting from separate phones | Biggest server change. Needs the household/room model. |
| 5 | 9 Share card, 10 Surprise me, 12 Streaks | Nice to have. |

## Phase 1

### 2. Installable and offline (M)

- Add `public/manifest.webmanifest` (name, icons 192/512 and a maskable one, `display: standalone`, theme colour from `DESIGN.md`) and link it in `index.html`.
- Service worker via `vite-plugin-pwa` (Workbox, `generateSW`). Precache the app shell. Runtime-cache `/photos/*` with cache-first and `/api/shopping` with network-first so the last list shows with no signal.
- Keep `pendingShoppingOps` as the write queue. Add: replay on the `online` event as well as the 5 s poll, and show the queue length in the Shopping tab ("3 changes waiting").
- Freezer and every other store already live in `localStorage`, so they work offline today.
- Update-available toast when a new service worker is waiting, so a stale shell never lingers.
- Risk: a service worker that caches `index.html` forever strands users on old builds. Use `skipWaiting` only behind the toast, and test an upgrade, not just a first install.
- Done when: Lighthouse PWA checks pass, airplane-mode reload shows the app, a shopping tick made offline syncs on reconnect.

### 1. Week planner (L)

- New type `WeekPlan { weekStart: string; nights: { date: string; mealId: string | null; locked: boolean; kind: 'cook' | 'freezer' | 'takeaway' | 'out' }[] }`, persisted like the other stores and included in backup/sync.
- Engine: add `planWeek(meals, pantry, cookLog, options)` to `dinnerEngine.ts`. It picks per night, skips locked nights, avoids repeating a cuisine two nights running, treats meals already planned this week as cooked for the cooling-off penalty, and spreads the use-next boost across the week instead of using it on night one.
- Freezer link: a night can be "from the freezer". Planning offers batches in the freezer, oldest first, and ticks a portion off when the night is marked done.
- UI: new view (or a Spin-screen mode) with Mon to Fri rows, a lock toggle per night, per-night respin, and "respin unlocked". Weekend toggle. Reuse `ReelWindow` styling.
- Combined shopping list: union of ingredients across the planned nights, minus pantry and staples (reuse `calculateMealPantryMatch`), de-duplicated by name, pushed with `addShoppingItems(names, forMeal)`.
- Tonight handoff: today's planned meal pre-fills the Tonight tab and the reverse timeline.
- Tests: no repeats within a week when the pool allows, locked nights survive a respin, shopping list de-dupes across meals, freezer nights do not add ingredients.
- Navigation: the nav already has five items. Either fold "Week" under Spin as a segmented control, or replace Stats with a "More" sheet. Decide before building (open question 1).

## Phase 2

### 3. Alerts for cooking steps (S to M)

- Wake lock: `navigator.wakeLock.request('screen')` while a dinner is agreed and the timeline has unfinished steps. Re-acquire on `visibilitychange`. Feature-detect.
- Notifications: ask for permission only after the user taps "Remind me", never on load. Schedule with `setTimeout` against the step `minuteOffset` while the page is open, and via the service worker (`showNotification`) so it still fires with the screen locked. True background scheduling (Notification Triggers) is not reliable across browsers, so the honest scope is "works while the app is open or recently backgrounded". Say that in the UI.
- Fallback: in-app banner plus the existing audio cue when permission is denied.
- Depends on item 2 (service worker).
- iOS caveat: web push and notifications need the app installed to the home screen (another reason item 2 comes first).

### 7. Supermarket links (S)

- Per shopping item, an "Open in..." menu with Tesco, Sainsbury's, Ocado, Aldi search URLs. Search-URL patterns change; keep them in one `src/utils/supermarkets.ts` map with a unit test that checks each builds a valid URL.
- Remember the household's preferred store in `localStorage`. Add a bulk "open all in one store" only if the store supports multi-search (most do not), otherwise one tap per item.
- Do not scrape prices. Links only.

### 8. Cost per serving and "cheap week" (M, because of the data)

- Data first: populate `estimatedCostPerHead` for all recipes. Two options: derive it from an ingredient price table (`src/data/ingredientPrices.ts`, about 150 common UK ingredients), or ask Gemini once, offline, to produce a reviewed JSON that is committed. Prefer the price table so numbers are explainable and editable.
- Show on meal cards and the recipe sheet. Mark clearly as an estimate.
- Filter: "Budget" toggle on the machine (pool filter) and a "cheap week" option in the planner (item 1) that caps average cost per head.
- Stats: swap the estimated takeaway savings figure to use real per-meal costs when available.

## Phase 3: one pass through the engine

Do 5, 6 and 11 together. All three change `filterEligibleMeals` and `selectWeightedMeal`, so the tests are shared and the weighting stays understandable.

### 5. Dietary needs per person (M)

- Extend `HouseholdMember` with `diet?: 'vegetarian' | 'vegan' | 'pescatarian' | 'gluten-free' | 'dairy-free'` and `avoid: string[]` (nuts, mushrooms, anything free text).
- Ingredient classification: a small keyword map for diets (meat, fish, dairy, gluten words). Tag recipes at load time rather than guessing at spin time. Free-text avoids reuse the existing substring match used for `bannedIngredients`.
- Spin behaviour: a setting, "Skip dishes someone can't eat" (hard filter) versus "warn only". Default to skip.
- Voting: a warning chip on the ballot naming who it clashes with.
- Safety: this is preference handling, not an allergy guarantee. Add a plain-language line on the screen that allergy checks must be done on the real ingredients. Do not claim "nut free".
- Migrate existing `bannedIngredients` as the household-wide list; do not remove it.

### 6. Leftovers (M)

- Add `makesLeftovers?: { portions: number; keepDays: number }` to `Meal`, and a "Made extra?" prompt in the after-dinner review (`AfterDinnerReview.tsx`).
- Fridge route: add a fridge item flagged use-next with an "eat by" date (the pantry model already has red/amber/green, so the existing "use next" boost picks it up with no engine change).
- Freezer route: a second button, "Freeze the rest", creates a `FreezerItem` directly. This is the natural bridge to the Freezer feature.
- Pantry `FreshnessLevel` has no dates today. Add an optional `useBy` date and turn amber/red automatically as it approaches. Needed here and also fixes a gap for ordinary fridge items.

### 11. Seasonal dishes (S)

- Tag recipes with `seasons?: ('winter' | 'spring' | 'summer' | 'autumn')[]`, defaulting from tags/titles (stew, roast, salad, barbecue) so no hand-tagging of 120 recipes is needed. Allow overrides.
- Weighting: a mild multiplier (about 1.25x in season, 0.85x out). Keep it small so it nudges rather than dominates the 4.5x clear-out boost.
- Hemisphere/season from the device date, with a setting to turn it off.

## Phase 4

### 4. Voting from separate phones (L)

- Room model on the server: `rooms[code] = { createdAt, members, proposedMealId, ballot, expiresAt }` with a 4-digit code, 24 h expiry, and a cap on rooms to stop abuse. Server persistence is optional since a room only lives for one evening.
- Transport: SSE for server-to-phone updates plus `POST` for votes. This fits the existing Express server and avoids a WebSocket dependency. Add polling fallback, the same pattern as the shopping list.
- Client: "Start a room" and "Join with code" on the Tonight tab. Each phone picks "I'm..." (already stored as `meId`). Votes and vetoes apply on the server so two phones cannot spend one veto token twice.
- Security: a 4-digit code is guessable. Rate-limit joins, expire rooms, and keep rooms to vote state only (no recipes, no personal data). Do not put the shopping list under the room code.
- Reuse the sync ops idea from `src/utils/shopping.ts`: apply the same pure function on server and client, tested once.
- Depends on the household/room concept (see open question 3). Do it after item 2 so reconnects are handled.

## Phase 5

### 9. Share a recipe card (M)

- Canvas-rendered image (dish photo, title, time, ingredients) shared with `navigator.share({ files })`, with a copy-image fallback. Photos come from our own `/photos` set; check `photoCredits.json` and print the credit on the card.
- A link version needs a public recipe route. Only do this if a deployed site is planned.

### 10. Surprise me from the fridge (M)

- Reuse the existing `snap-fridge` scan (`/api/pantry/analyze`), then spin only dishes with a high `calculateMealPantryMatch` percentage. Offer to keep the scanned items or use them for one spin only.
- Includes the freezer: if a batch is waiting, show it first ("You have 3 chilli portions").

### 12. Streaks and milestones (S)

- Derived from `cookLog`, `takeawayLog` and the freezer's used items, so no new storage. Examples: dinners in a row cooked at home, items rescued (already counted), freezer portions eaten.
- Pure functions in `src/utils/milestones.ts` with tests; display on `ScorecardView`. Avoid guilt framing: celebrate, do not shame a takeaway.

## Cross-cutting

- Every new store goes into `syncWithCloud`, `importBackupData` and `resetToFactoryDefaults` (as the Freezer now does) and is sanitised on load.
- Every engine change gets a unit test in `src/utils/dinnerEngine.test.ts` before the UI.
- Version the localStorage schema. Several items add fields to `Meal`, `HouseholdMember` and `PantryItem`; add a small migration helper before Phase 3 rather than patching each load.
- Check against the `PRODUCT_EVOLUTION.md` constraints: mobile-first 480px, reduced motion, 44px touch targets, no asset bloat, works without a Gemini key.

## Open questions

1. Navigation: where does the week planner live, given the five-item nav is full?
2. Cost data (item 8): price table (explainable, editable) or one-off Gemini estimate (faster, less trustworthy)?
3. Households (item 4): is one household per server enough, or is this ever deployed for several families? That decides whether rooms need real accounts.
4. Notifications (item 3): is "works while the app is open or backgrounded" acceptable, or is true push (needs a push server and VAPID keys) wanted?
5. Deployment: is there a public URL planned? Items 2, 3, 4 and the link form of 9 all need HTTPS.
