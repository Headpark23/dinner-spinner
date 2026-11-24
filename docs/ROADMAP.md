# Dinner Spinner roadmap

Status of the twelve improvement ideas, checked against the code on `main` (plus the Freezer in PR 31). The first draft of this file was written before main's rebuild landed, so most of it was out of date. This version only lists what is left to do.

Effort: S = under a day, M = 1 to 3 days, L = a week or more.

## Where each idea stands

| # | Idea | Status on main | What is left |
| --- | --- | --- | --- |
| 1 | Week planner | **Mostly built.** `PlannerSheet.tsx`, `utils/planner.ts` (`suggestWeek`, themes per night, `tidyPlan`, `weekShopping`), "shop for the week" in one tap. | Freezer nights, household sharing, cost cap, cuisine variety. |
| 2 | Installable and offline | **Built.** `public/manifest.webmanifest`, `public/sw.js` (app shell, assets, photos, fonts cached), registered in `main.tsx`, offline shopping queue, install and update prompts. | Nothing left. `VERSION` is now stamped by the build. |
| 3 | Step alerts | **Mostly built.** Screen wake lock, service-worker notifications and an in-app banner when a step is due. | Real background push (needs a server), install prompt for iPhone. |
| 4 | Voting from separate phones | **Done, different design.** Household-wide live vote (`LiveVote.tsx`, `/api/tonight`), decided on the server, phones poll. Uses Google-sign-in family groups instead of a 4-digit room code. | Nothing: guests do not need to vote, so no code. |
| 5 | Dietary needs per person | **Mostly built.** `utils/diets.ts` (vegetarian, vegan, pescatarian, gluten-free, dairy-free, nut-free), `DietPicker`, avoid list with plural matching. | Nothing left. Onboarding asks each person's own diet. |
| 6 | Leftovers | **Mostly built.** "Made extra?" after dinner sends the rest to the fridge (use next, eat-by date) or the freezer; fridge rows show the use-by. | `makesLeftovers` on recipes that obviously make extra. |
| 7 | Supermarket links | **Done.** `utils/delivery.ts` (Tesco, Sainsbury's, Asda, Morrisons, Ocado, Waitrose, plus Uber Eats and Just Eat) and `DeliverySheet.tsx`. The shopping tab's `STORES` is built from the same list. | Nothing. |
| 8 | Cost per serving | **Done.** `utils/cost.ts` estimates what you would have to *buy* tonight and a per-head figure from the same price table. Cost filter (Free, £5, £10, no limit) applies to spins and the week planner. | Show which planner nights went over the cap. |
| 9 | Share a recipe card | **Built as a picture.** "Share as a picture" on the recipe sheet (share sheet, else copy, else download), with the photo credit printed. | A shareable link, only if a public site is planned. |
| 10 | Surprise me from the fridge | **Mostly built.** "Cook from what we have" now offers the freezer first and has a one-tap "photo of the fridge, then spin" start. | Check the photo hand-off with a real scan. |
| 11 | Seasonal dishes | **Built.** `utils/seasons.ts`, a mild 1.25x / 0.85x nudge in the single-dish spin, with a "Favour dishes in season" switch in More. | Nothing left. The week planner leans to each night's season too. |
| 12 | Streaks and milestones | **Built.** `utils/milestones.ts` (streak, home dinners, takeaway-free days, rescued items, freezer portions eaten) with a Milestones card on History. | Nothing left. A note appears when a step is first reached. |

## Freezer follow-ups (PR 31)

The Freezer tab is built and, as of PR 31, shared with the household like the fridge. The items below are what would make it more useful.

1. ~~Share it with the household~~ **Done.** `applyFreezerOp` in `utils/freezer.ts` (seed, add, tick, put back, remove, clear finished, replace all) runs on both the server and the phone. `GET /api/freezer` and `POST /api/freezer/ops` sit beside the fridge routes, the household store has a `freezer` field, and edits queue while offline. Two phones ticking portions both count. Every operation carries an id (`utils/opIds.ts`) and the server skips one it has already applied, so a resend after a lost reply no longer double-ticks a portion. The same applies to the fridge and the shopping list.
2. **Use it when planning (M).** Let a planner night be "from the freezer": offer batches oldest first, tick a portion when that night is cooked, and skip that night in `weekShopping`. `WeekPlan` entries are `{ mealId, title }` today, so add an optional `freezerId`.
3. **Count it in "Cook from what we have" (S).** A batch in the freezer is a dinner that needs nothing from the shop. Offer it first in `CupboardSheet`, with the "Eat soon" ones at the front.
4. **Leftovers (item 6) goes into it.** After dinner, "made extra?" can either add a fridge item with a use-by or send the rest to the freezer in one tap. See item 6 below.
5. **Stats (S).** Portions eaten from the freezer feed the milestones in item 12.
6. ~~Backup check~~ **Done.** `checkBackup` now refuses a backup whose freezer list is damaged (not a list, over 300 batches, missing a name, or a bad portion count), with the same "nothing was changed" message as the fridge.

## Remaining work by item

### 1. Week planner (M)
- **Freezer nights.** See follow-up 2.
- **Household sharing.** `weekPlan` and `weekThemes` are saved per phone (`week_plan`, `week_themes` in `localStorage`) and are not in the server store. Two people can plan different weeks. Move the plan into the household store using the same operations pattern.
- **Cost cap.** `suggestWeek` ignores the cost filter. Pass the chosen limit through and prefer cheaper dishes so a "cheap week" is possible, using `missingCost` from `utils/cost.ts`.
- **Variety.** `suggestWeek` avoids repeating a dish and prefers dishes not recently cooked, but it can still pick the same cuisine on consecutive nights. Add a soft penalty.
- **Spread the use-next boost.** Today it is not applied when planning at all. Give use-next fridge items a bonus on the first few nights.
- Tests: extend the planner tests to cover freezer nights, cost cap and cuisine spacing.

### 2. Installable and offline (S)
- ~~Update prompt~~ **Done.** `sw.js` no longer calls `skipWaiting()` on install. A new version waits, `utils/swUpdate.ts` (`watchForUpdate`) notices it (already waiting, or `updatefound` then `installed`, and only when a controller exists so a first visit is not an "update"), and `UpdateNotice` in `components/InstallUpdate.tsx` shows "A new version is ready, Refresh". Tapping posts `SKIP_WAITING` to the waiting worker and the page reloads on `controllerchange`, so nobody is reloaded mid-recipe. The app also re-checks for a new version whenever it returns to the foreground.
- ~~Install prompt~~ **Done.** `utils/installPrompt.ts` captures `beforeinstallprompt` (Android and desktop Chrome) for an "Install" button, and on iPhone and iPad Safari (which has no such event) shows "Tap Share, then Add to Home Screen". It is hidden when `display-mode: standalone` or `navigator.standalone` is true, and a dismissal is remembered for 30 days. It sits at the top of the More view as `InstallCard`. The iPhone wording says step reminders (item 3) need the app installed, which is why the two pair up.
- Tests: `utils/installUpdate.test.ts`. Not checkable in a dev build: the service worker only registers in production, so the waiting-worker flow and a real install dialog need a production build on a device.
- ~~Build-generated `VERSION`~~ **Done.** A small Vite plugin in `vite.config.ts` rewrites `const VERSION` in `dist/sw.js` to a hash of the built `index.html` (whose asset names carry content hashes), so the cache name changes exactly when the shell does. The source file keeps a placeholder value.

### 3. Step alerts (S to M)
- ~~Wake lock~~ **Done.** `src/utils/wakeLock.ts` holds the screen awake while a dinner is agreed and steps remain (a "Keep the screen on while I cook" tick, on by default), asks again when the page becomes visible, and does nothing where the browser lacks it.
- ~~Service-worker notifications~~ **Done.** `src/utils/stepAlerts.ts` shows alerts through `registration.showNotification` (Android Chrome refuses `new Notification()` on a page), falling back to the page API. `sw.js` handles `notificationclick`. Each due step also shows an in-app "Now:" banner and a chime. The reminder note says plainly that a locked phone may hold alerts back.
- **Still open.** True background delivery with the phone locked needs a push server and keys (open question 2). On iPhone, notifications need the app installed to the home screen, so this pairs with the install prompt in item 2.

### 4. Voting from separate phones (done)
- The live vote works across phones inside a signed-in family group, which is all that is needed. Guests outside a group do not need to vote (open question 3, answered), so the 4-digit room code is not being built. Revisit only if that changes: short-lived rooms on `/api/tonight`, rate-limited joins, vote state only.

### 5. Per-person dietary needs (mostly done)
- ~~Per-person diets and avoid~~ **Done.** `HouseholdMember` has optional `diets` and `avoid`; the household lists stay as the baseline. Edited per person under Fridge, Likes and dislikes, "Per person" (`MemberPrefs.tsx`). They travel with the members in backups and room sync.
- ~~Skip or warn~~ **Done.** `dietMode` ("Skip it", the default, or "Just warn"). `utils/memberDiets.ts` `effectiveRestrictions` feeds the spin pool, reels, week planner and swap suggestions. Recipes are never shelved by one person's list: only the household never list changes the recipe book.
- ~~Vote clash chip~~ **Done.** The vote screen says "Doesn't suit Sam (vegetarian) and Jo (avoids mushrooms)" using `dishClashes` per member.
- ~~Plain-language note~~ **Done.** The Per person card says it is a preference, not an allergy check; ticking nut-free adds a "read every label" warning.
- ~~Ask per-person diets in onboarding~~ **Done.** Under each name in the welcome sheet, a "Their own diet?" row of the same diet chips; `completeOnboarding` keeps them on that member. **Still open.** The clash chip names members only for whole dishes, not single reel parts. Tests: `utils/memberDiets.test.ts`.

### 6. Leftovers (mostly done)
- ~~Made extra?~~ **Done.** After "We've eaten. Log it", `LeftoversStep.tsx` asks how many portions are left and offers "Keep in fridge" or "Freeze it", once per dinner (recorded on the cook log entry as `leftovers`). `Meal.makesLeftovers?: { portions; keepDays }` is in the type to seed the defaults (2 portions, 3 days); no recipe sets it yet.
- ~~Fridge route~~ **Done.** `utils/leftovers.ts` `leftoverFridgeItem` adds "Leftover <dish>" flagged use next with an eat-by date, so the existing use-next boost and "Use these up" pick it up. Added through the normal fridge queue, so it syncs.
- ~~Freezer route~~ **Done.** Creates a `FreezerItem` with the dish's `mealId` and a "Leftovers" note.
- ~~`PantryItem.useBy`~~ **Done.** Optional YYYY-MM-DD, cleaned in `cleanItem` (so the server keeps it). Fridge rows show "Eat within 3 days" (grey), "Eat by tomorrow" (amber), "Eat today" or "Past its date" (red). It is not yet an input for ordinary items.
- ~~Use-by on ordinary items~~ **Done.** The add-item form on the Fridge has an optional "Use by" date, and `withDueFreshness` (`utils/leftovers.ts`) reads any item due within two days, or past its date, as use next. The stored value is left as typed; only what the app reads changes. **Still open.** Set `makesLeftovers` on recipes that obviously make extra. Tests: `utils/leftovers.test.ts`, `utils/followUps.test.ts`.

### 7. Supermarket links (done)
- ~~One shop list~~ **Done.** `planner.ts` `STORES` is now built from the supermarkets in `DELIVERY_SHOPS`, so the shopping tab's store picker offers all six (Tesco, Sainsbury's, Asda, Morrisons, Ocado, Waitrose) and a changed URL is fixed once. `StoreId` is a plain string; a saved choice that no longer exists falls back to Tesco.
- ~~Test~~ **Done.** `utils/stores.test.ts` checks every shop builds a valid https search URL, with awkward characters escaped, and that the picker list and the delivery list cannot drift apart.

### 8. Cost per serving (done)
- ~~Per-head figure~~ **Done.** `utils/cost.ts` `costPerHead`: every ingredient except the always-have staples, priced from the same table, divided by the four portions the table assumes, to the nearest 10p. It does not change with the serving size and ignores the fridge, so "about £3.20 a head" and "about £8 to buy" can both show. Shown on the recipe sheet and under the dish on the reel.
- ~~`Meal.estimatedCostPerHead`~~ **Removed.** Nothing read or wrote it.
- ~~Cost limit in the planner~~ **Done.** `suggestWeek` takes the same cost rule as the spin and relaxes it the same way if nothing is cheap enough. It is used when filling the week and when swapping one night. The planner sheet also now uses the effective diet and avoid lists from item 5 (it used the household lists only before).
- ~~Say which nights went over the cap~~ **Done.** A planned night above the cost limit shows "about £N to buy, above your cost limit" (`overCostLimit` in `utils/cost.ts`). Tests: `utils/cost.test.ts`, `utils/followUps.test.ts`.

### 9. Share a recipe card (picture done)
- ~~Canvas card~~ **Done.** "Share as a picture" on the recipe sheet draws a 1080 by 1350 card (photo, title, place and time, up to ten ingredients with "+N more", app name) with `utils/recipeCard.ts` and shares it with `navigator.share({ files })`. Where that is not available it copies the image, and failing that downloads a PNG. `utils/shareRecipeCard.ts` holds the browser glue.
- ~~Photo credit~~ **Done.** The licence line is printed on the card whenever the photo is, using the same credit the recipe sheet shows. If a photo will not load the card is drawn without it and without a credit.
- Not done: a link form. It needs a public recipe route, so do it only if a public site is planned.
- **Still open.** A photo hosted on another site that does not allow cross-origin use will taint the canvas, and that dish gets "Couldn't make the picture". The bundled photos are same-origin so they are fine. Tests: `utils/recipeCard.test.ts`.

### 10. Surprise me from the fridge (mostly done)
- ~~One button~~ **Done.** "Start with a photo of the fridge" in the Cook from what we have sheet takes you to the Fridge with a "Take the photo" card (a real tap, because phones refuse a camera that opens by itself). When the scan adds items it returns to Dinner and opens the spin; "Skip the photo" does the same without it. State is `surpriseStep` in the context.
- ~~Freezer first~~ **Done.** `utils/cupboard.ts` `freezerCandidates` turns each batch into a dinner that needs nothing from the shop, oldest first (so "eat soon" batches lead), and `pickSurprise` offers them before anything else. The card says "From the freezer, N portions left" and "Eat a portion tonight" ticks one off through the shared freezer. A batch from one of our recipes can also be put to the household. This closes freezer follow-up 3.
- The sheet now uses the effective diet and avoid lists from item 5 (it used the household lists only).
- **Still open.** The photo-success hand-off was not exercised against a real scan (it needs a family group and the AI reader). Abandoning the flow on the Fridge leaves the "Take the photo" card until the next spin. Tests: `utils/freezerSurprise.test.ts`.

### 11. Seasonal dishes (done)
- ~~Season from titles and tags~~ **Done.** `utils/seasons.ts` `seasonOf` reads winter (stew, roast, soup, pie, chilli, casserole and the like) or summer (salad, barbecue, kebab, gazpacho and the like) from the title and tags; a dish that reads as both, or neither, has no season. Nothing is hand-tagged.
- ~~Mild nudge~~ **Done.** `selectWeightedMeal` takes a `seasonal` flag and multiplies by 1.25 in season and 0.85 out, far below the 4.5x use-next boost. Winter is November to March, summer June to August (northern hemisphere); April, May, September and October change nothing.
- ~~Setting~~ **Done.** "Favour dishes in season" in More, on by default, stored as `seasonal` in the context.
- ~~Hemisphere setting~~ **Done.** "Northern seasons / Southern seasons" under the seasonal switch in More; `seasonForMonth` shifts the months by six for the south. ~~Season in the week planner~~ **Done.** `suggestWeek` takes `seasonal` (the hemisphere, or false) and picks each night with `seasonWeight` for that night's own date, so a week that crosses into a new season is nudged night by night. It follows the same More switch and hemisphere, and never beats themes, repeats or the cost limit. Tests: `utils/seasons.test.ts`, `utils/followUps.test.ts`.

### 12. Milestones (done)
- ~~Streak out of the view~~ **Done.** `utils/milestones.ts` holds `cookingStreak`, `homeCookedThisWeek`, `takeawayFreeDays`, `freezerPortionsEaten`, `statsFrom` and `milestones`, all pure and tested; `ScorecardView.tsx` only draws them.
- ~~New milestones~~ **Done.** Ladders for cooking in a row (3, 7, 14, 30), home dinners (10, 25, 50, 100), days since the last takeaway (7, 14, 30), items rescued (5, 10, 25, 50) and freezer portions eaten (3, 10, 25). The History page shows the highest step reached in each as a chip, and one "Next:" line for whichever is closest.
- ~~Celebrate, never shame~~ **Done.** Nothing is shown for a ladder that has not started, a takeaway only ends the takeaway-free count, there is no "lost" or "broke" wording (a test checks the words), and a takeaway night in the week row is now amber instead of red.
- ~~Celebrate when a step is first reached~~ **Done.** `MilestoneToast` shows one note per new step, remembers what it has shown (`ds_milestones_seen`), and on a first run or after the update records what is already earned without announcing it. **Still open.** Freezer portions eaten forget a batch once it is removed. Tests: `utils/milestones.test.ts`, `utils/followUps.test.ts`.

## Suggested order

1. ~~Freezer household sync and backup check~~ (done). The per-operation id for fridge and freezer is done too.
2. **Quick wins that finish half-built features:** wake lock and locked-screen alerts (3), update and install prompts (2), merge the shop lists (7), cost per head (8).
3. **Planner upgrades** (1) together with freezer nights and "Cook from what we have" (follow-ups 2 and 3, item 10), since all touch the same plan and spin code.
4. **Engine pass** for per-person diets (5), leftovers (6) and seasons (11), so `filterEligibleMeals` and `selectWeightedMeal` change once with shared tests.
5. ~~Milestones (12), then the share card (9).~~ Done.

## Cross-cutting

- Every new store goes through the same four places as the Freezer did: sync payload, backup import and check, factory reset, sanitise on load. Anything that should be shared between phones also needs a server store and operations, as the fridge and shopping list have.
- Engine changes get unit tests before the UI.
- Keep the design constraints in `PRODUCT_EVOLUTION.md`: mobile-first width, reduced motion, 44px touch targets, works without a Gemini key.
- `PRODUCT_EVOLUTION.md` was brought up to date after items 1 to 12 landed (its backlog is now the short list of what is still open). Keep the two in step when an item ships.

## Open questions

1. Where do new planner features live? The planner is a sheet; freezer nights and a shared plan may justify its own screen.
2. Alerts: is "works while the app is open or recently backgrounded" enough, or is real push (a push server and keys) wanted?
3. ~~Guests~~ **Answered: no.** People outside a family group do not need to vote, so item 4 is finished.
4. Should the freezer be visible on the Dinner home screen ("3 portions of chilli waiting"), or stay inside Fridge?
