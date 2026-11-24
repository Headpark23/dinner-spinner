# Dinner Spinner roadmap

Status of the twelve improvement ideas, checked against the code on `main` (plus the Freezer in PR 31). The first draft of this file was written before main's rebuild landed, so most of it was out of date. This version only lists what is left to do.

Effort: S = under a day, M = 1 to 3 days, L = a week or more.

## Where each idea stands

| # | Idea | Status on main | What is left |
| --- | --- | --- | --- |
| 1 | Week planner | **Mostly built.** `PlannerSheet.tsx`, `utils/planner.ts` (`suggestWeek`, themes per night, `tidyPlan`, `weekShopping`), "shop for the week" in one tap. | Freezer nights, household sharing, cost cap, cuisine variety. |
| 2 | Installable and offline | **Built.** `public/manifest.webmanifest`, `public/sw.js` (app shell, assets, photos, fonts cached), registered in `main.tsx`, offline shopping queue, install and update prompts. | Build-generated `VERSION`. |
| 3 | Step alerts | **Mostly built.** Screen wake lock, service-worker notifications and an in-app banner when a step is due. | Real background push (needs a server), install prompt for iPhone. |
| 4 | Voting from separate phones | **Built, different design.** Household-wide live vote (`LiveVote.tsx`, `/api/tonight`), decided on the server, phones poll. Uses Google-sign-in family groups instead of a 4-digit room code. | Decide whether a code is still wanted. |
| 5 | Dietary needs per person | **Partly built, household-wide.** `utils/diets.ts` (vegetarian, vegan, pescatarian, gluten-free, dairy-free, nut-free), `DietPicker`, avoid list with plural matching. | Per-person diets and a clash warning on the vote. |
| 6 | Leftovers | **Not built.** (`cupboard.ts` has a "leftover rice bowl" recipe only.) | Everything. |
| 7 | Supermarket links | **Built.** `utils/delivery.ts` (Tesco, Sainsbury's, Asda, Morrisons, Ocado, Waitrose, plus Uber Eats and Just Eat) and `DeliverySheet.tsx`. `planner.ts` also holds a shorter `STORES` list. | Merge the two shop lists. |
| 8 | Cost per serving | **Built, differently.** `utils/cost.ts` estimates what you would have to *buy* (ingredient price table minus fridge and staples). Cost filter (Free, £5, £10, no limit) and "about £4 to buy" on the result. `Meal.estimatedCostPerHead` is still unused. | Show cost per head, cost on planner, retire the unused field. |
| 9 | Share a recipe card | **Not built.** `navigator.share` is used only for the family invite link. | Everything. |
| 10 | Surprise me from the fridge | **Mostly built.** "Cook from what we have" (`cupboard.ts`, `CupboardSheet.tsx`) plus the fridge photo scan. | Link the photo scan straight into one spin; include the freezer. |
| 11 | Seasonal dishes | **Not built.** | Everything. |
| 12 | Streaks and milestones | **Partly built.** Stats shows a "N-night streak" of home-cooked dinners (`ScorecardView.tsx`). | Milestones (rescued items, takeaway-free runs, freezer portions eaten). |

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
- **Still open.** Bump `VERSION` in `sw.js` on each release that changes the shell (now `v3`). Consider generating it from the build so this cannot be forgotten.

### 3. Step alerts (S to M)
- ~~Wake lock~~ **Done.** `src/utils/wakeLock.ts` holds the screen awake while a dinner is agreed and steps remain (a "Keep the screen on while I cook" tick, on by default), asks again when the page becomes visible, and does nothing where the browser lacks it.
- ~~Service-worker notifications~~ **Done.** `src/utils/stepAlerts.ts` shows alerts through `registration.showNotification` (Android Chrome refuses `new Notification()` on a page), falling back to the page API. `sw.js` handles `notificationclick`. Each due step also shows an in-app "Now:" banner and a chime. The reminder note says plainly that a locked phone may hold alerts back.
- **Still open.** True background delivery with the phone locked needs a push server and keys (open question 2). On iPhone, notifications need the app installed to the home screen, so this pairs with the install prompt in item 2.

### 4. Voting from separate phones (S, or nothing)
- The live vote already works across phones inside a signed-in family group. The original idea was a 4-digit code so someone outside the group can vote. Only build that if guests are a real need (open question 3). If so: short-lived rooms on `/api/tonight`, rate-limited joins, vote state only.

### 5. Per-person dietary needs (M)
- Diets and the avoid list are household-wide (`diets` in the context). Add `diets` and `avoid` to each household member, keep the household list as the baseline.
- Spin behaviour: a setting for "skip dishes someone can't eat" (default) versus "just warn".
- Vote screen: a clash chip naming who a dish does not suit, using `mealFitsDiets` per member.
- Keep the plain-language note that this is preference handling, not an allergy check. The nut-free diet in particular should say to read labels.

### 6. Leftovers (M)
- Add `makesLeftovers?: { portions: number; keepDays: number }` to `Meal` and a "Made extra?" step in `AfterDinnerReview.tsx`.
- Two routes: add a fridge item flagged "use next" with an eat-by date (the existing use-next boost then picks it up), or "Freeze the rest" which creates a `FreezerItem` directly.
- `PantryItem` has no dates. Add an optional `useBy` that turns amber and red as it nears. This also fixes a gap for ordinary fridge items.
- The fridge is a server-synced store, so extend `FridgeOp` rather than writing around it.

### 7. Supermarket links (S)
- Done in `delivery.ts`. Clean-up only: `planner.ts` has its own four-shop `STORES` list used by the shopping tab's store picker, which duplicates `DELIVERY_SHOPS`. Point both at one list so a changed URL is fixed once. Add a test that every shop builds a valid search URL.

### 8. Cost per serving (S)
- Keep what is there (cost to buy tonight). Add a per-head figure on recipe cards, calculated from the same price table and `servings`, so "£2 a head" and "£8 to buy" can both appear.
- Remove or populate `Meal.estimatedCostPerHead`, which nothing reads or writes. Delete it unless per-head is added.
- Feed the cost limit into the planner (item 1).

### 9. Share a recipe card (M)
- Canvas-rendered image (photo, title, time, ingredients) via `navigator.share({ files })`, with a copy-image fallback. Photos carry licence credits (`photoCredit`, `photoCredits.json`); print the credit on the card.
- A link form needs a public recipe route, so do it only if a public site is planned.

### 10. Surprise me from the fridge (S)
- "Cook from what we have" and the fridge scan both exist but are separate steps. Add one button: scan, add what it sees, then spin from what is in the fridge. Offer the freezer batches first (follow-up 3).

### 11. Seasonal dishes (S)
- Tag recipes with seasons, defaulted from titles and tags (stew, roast, salad, barbecue) so nothing is hand-tagged across the ~120 dishes. Apply a mild multiplier (about 1.25x in season, 0.85x out) in `selectWeightedMeal`, well below the 4.5x use-next boost. Add a setting to turn it off. Test in `dinnerEngine.test.ts`.

### 12. Milestones (S)
- The streak is computed inside `ScorecardView.tsx`. Move it to `utils/milestones.ts` as pure, tested functions, then add: takeaway-free runs, items rescued (already counted), freezer portions eaten. Celebrate; avoid shaming a takeaway night.

## Suggested order

1. ~~Freezer household sync and backup check~~ (done). The per-operation id for fridge and freezer is done too.
2. **Quick wins that finish half-built features:** wake lock and locked-screen alerts (3), update and install prompts (2), merge the shop lists (7), cost per head (8).
3. **Planner upgrades** (1) together with freezer nights and "Cook from what we have" (follow-ups 2 and 3, item 10), since all touch the same plan and spin code.
4. **Engine pass** for per-person diets (5), leftovers (6) and seasons (11), so `filterEligibleMeals` and `selectWeightedMeal` change once with shared tests.
5. **Milestones** (12), then the **share card** (9).

## Cross-cutting

- Every new store goes through the same four places as the Freezer did: sync payload, backup import and check, factory reset, sanitise on load. Anything that should be shared between phones also needs a server store and operations, as the fridge and shopping list have.
- Engine changes get unit tests before the UI.
- Keep the design constraints in `PRODUCT_EVOLUTION.md`: mobile-first width, reduced motion, 44px touch targets, works without a Gemini key.
- `PRODUCT_EVOLUTION.md` itself is also stale. Its backlog still lists room-code voting, supermarket links, notifications and cost as future work. Update it alongside this file.

## Open questions

1. Where do new planner features live? The planner is a sheet; freezer nights and a shared plan may justify its own screen.
2. Alerts: is "works while the app is open or recently backgrounded" enough, or is real push (a push server and keys) wanted?
3. Guests: do people outside a family group ever need to vote? If not, item 4 is finished.
4. Should the freezer be visible on the Dinner home screen ("3 portions of chilli waiting"), or stay inside Fridge?
