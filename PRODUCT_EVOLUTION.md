# Dinner Spinner — Continuous Product Evolution Blueprint

## 1. Product Vision
**Dinner Spinner** is a tactile British pub fruit-machine ("one-armed bandit") kitchen companion that eliminates daily household dinner indecision, prevents fridge food waste via weighted "Use-Next" clearout mechanics, resolves family stalemates with a democratic Veto-to-Takeaway Override protocol, and guides home cooks to the table on time with reverse-calculated prep schedules.

## 2. Target Users & Core Personas
- **The Midweek Family Chef**: Wants an answer to *"What's for dinner?"* in under 30 seconds that respects how much time (`20m` to `all-day`) and washing-up tolerance (`one-pot` vs `standard` vs `chef-mode`) they actually have tonight.
- **The Zero-Waste Household**: Wants expiring fridge items (`Red: Use Next`) prioritized automatically (`4.5×` probability boost) and cleared from inventory once cooked.
- **The Indecisive Couple / Flatmates**: Needs a structured, fun ballot with bounded weekly Veto Tokens (`3/week`) and an automatic 3-veto **Takeaway & Door Duty Override** when nobody wants to cook.

## 3. Competitive Landscape & Strategic Differentiation
Benchmarked against 12 category leaders (**Sorted Food Sidekick, SuperCook, What's For Dinner?!, Matcher, Paprika 3, Samsung Food, Mealime, Mealie, Tandoor, KitchenOwl, NYT Cooking, Eat This Much**):
- **Why Competitors Fall Short**:
  - Recipe vaults (*Paprika, Mealie, NYT Cooking*) require manual browsing when users are already decision-fatigued.
  - Pantry matchers (*SuperCook*) return thousands of uncurated web links with no family consensus or cooking timeline.
  - Swipe matchers (*What's For Dinner?!, Matcher*) require multi-device synchronous swiping and stop once a dish is named—offering no reverse prep timers or pantry stock integration.
- **Dinner Spinner's Moat**:
  - **1-Device Tactile Speed**: Spin, Hold, Nudge, Vote, and Time-Schedule in one cohesive arcade cabinet interface with zero-dependency procedural Web Audio synthesis.

## 4. Established Product Constraints & Design Principles
1. **Zero Audio/Asset Bloat**: All mechanical ticks, clunks, buzzers, klaxons, and jackpot fanfares are synthesized procedurally via Web Audio API (`src/utils/audio.ts`).
2. **Mobile-First Arcade Ergonomics + Desktop Telemetry**: Primary cabinet maintains a thumb-friendly `480px–500px` arcade form factor, paired with a live 4-card Kitchen Companion Telemetry Deck on desktop viewports (`lg:`).
3. **Strict Accessibility & Motion Safety**: Honors `@media (prefers-reduced-motion: reduce)`, high-contrast `:focus-visible` amber rings, keyboard shortcuts (`Space`, `N`, `1-4`, `M`), and ≥36–44px touch targets.
4. **Offline & API-Key Resilience**: Installable as an app (`public/manifest.webmanifest`) and opens offline through a service worker (`public/sw.js`: app shell, built assets, dish photos and fonts cached; `/api` never cached). Data lives in `localStorage` with JSON backup/restore, and shared household data queues while offline. `/api/pantry/analyze` seamlessly falls back to realistic UK Kitchen AI simulations when `GEMINI_API_KEY` is absent.
5. **Preference, Not Allergy Check**: Diets and avoid lists read ingredient names only. Every place that offers them says so plainly and tells people with allergies to check labels (nut-free says it twice).
6. **Celebrate, Never Shame**: Streaks, takeaway nights and milestones are worded kindly. A takeaway only ends a takeaway-free count; nothing says a streak was "lost".

## 5. Completed Evolution Milestones (v2.0)
- [x] **Core Engine Extraction (`src/utils/dinnerEngine.ts`)**: Pure, unit-tested domain logic for eligibility filtering (`timeStake` + `effort` + `bannedIngredients`), weighted selection (`4.5×` Clearout boost, `0.15×` 4-day cooling-off penalty, `1.3×` favourite boost), pantry match calculation, dynamic 3-Reel and 4-Reel Sunday Roast meal synthesis, and reverse timer math.
- [x] **Kinetic Cycling Reels & Pantry Match Badges (`ReelWindow.tsx`, `MachineView.tsx`)**: Real-time cycling of candidate dishes/ingredients during spins, live eligible drum counter, per-ingredient stock & Red-rescue badges, and Favourite (`♥`) toggle.
- [x] **Multi-Member Household Ballot & Portion Scaler (`VotingView.tsx`)**: Per-member ballot tracking, strict Veto Token enforcement (`0 tokens` block + weekly reset), custom household member roster, `2p/4p/6p/8p` ingredient scaling, and live Reverse Prep Progress bar with automatic Red pantry item clearance on cook completion.
- [x] **Interactive Meal Vault & Smart Shopping Diff (`PantryView.tsx`)**: Search, multi-filter (`♥ Favourites`, `5★ Gold`, `20m Dash`, `♻️ Uses Red Items`), manual custom recipe creation form, 1-tap "Stock All Missing Items", and AI Text-to-Recipe / Demo Scan modes.
- [x] **Telemetry & SVG Data Visualisations (`ScorecardView.tsx`)**: Executive Bento KPIs (Estimated £ Takeaway Savings, Red Items Rescued, Gold Reels), interactive SVG Donut Chart for Cuisine Rotation, Pantry Freshness Health bar, Time-Stake Reality distribution, and Household Veto Telemetry.
- [x] **Real Server Cloud Sync & JSON Import/Restore (`server.ts`, `ProfileSyncModal.tsx`)**: Persistent `POST /api/sync/cloud` & `GET /api/sync/cloud` snapshots plus client-side `.json` file import/export.
- [x] **Automated Unit & API Integration Test Suite (`src/utils/*.test.ts`)**: 143 deterministic tests covering domain algorithms, the shared fridge, freezer and shopping logic, and Express HTTP endpoints, run with `npm test` (Node test runner through `tsx`). `npm run lint` type-checks with `tsc --noEmit`.

### Since v2.0 (see `docs/ROADMAP.md` for detail and file names)
- [x] **Household sync**: Google-sign-in family groups share the shopping list, fridge, freezer and a live dinner vote decided on the server, so every phone agrees. Fridge, freezer and shopping edits are small operations with ids, applied identically on the server and each phone, so a resend never double-counts.
- [x] **Week planner**: seven themed nights, "shop for the week" in one tap, honouring diets, avoid lists and the cost limit.
- [x] **Freezer**: batch-cooked meals in portions, ticked off as eaten, shared with the household and shown on the Dinner screen.
- [x] **Installable and offline**: install prompt (Android and desktop Chrome button; "Share, then Add to Home Screen" on iPhone) and a "new version is ready, Refresh" notice instead of silently serving an old shell.
- [x] **Step alerts**: the screen stays awake while cooking, and reminders go through the service worker (with an in-app banner and chime when a step is due).
- [x] **Per-person diets**: each member can have their own diets and avoid list on top of the household baseline; "skip" (default) or "just warn", and the vote screen names who a dish does not suit.
- [x] **Leftovers**: "Made extra?" after dinner sends the rest to the fridge (flagged use next, with an eat-by date) or the freezer.
- [x] **Supermarket links**: one list of six supermarkets plus Uber Eats and Just Eat, shared by the delivery sheet and the shopping tab's store picker. Shops cannot be given a basket, so the app opens each item's search and offers the list to copy.
- [x] **Cost**: what a dish would cost to buy tonight, and about what it costs a head, from one price table; the cost limit applies to spins and the planner.
- [x] **Share a recipe as a picture**: a canvas card (photo, title, time, ingredients, licence credit) sent through the share sheet, else copied, else downloaded.
- [x] **Surprise me from the fridge**: "Cook from what we have" offers freezer batches first and can start with a photo of the fridge.
- [x] **Seasonal dishes**: a mild nudge (1.25x in season, 0.85x out) for winter and summer dishes read from titles and tags, with a switch in More.
- [x] **Milestones**: streaks, home dinners, takeaway-free days, items rescued and freezer portions eaten, on the History page.

## 6. Deferred Opportunities & Prioritised Backlog
The earlier backlog (room-code voting, supermarket links, notifications, cost per portion) has been built or settled; see section 5. What is genuinely left:
1. **Real background push (P2)**: Alerts work while the app is open or recently backgrounded. Delivery with the phone locked needs a push server and keys, so it is a decision before it is a task (`docs/ROADMAP.md`, open question 2).
2. **Guest voting by room code (P3, only if wanted)**: Voting already works across phones inside a family group, and guests do not need to vote, so the 4-digit code was not built. Revisit only if that changes.
3. **Nutrition tags (P3 — Experiment)**: Optional macro (protein, fibre) tags on meal cards. Cost per head is done; nutrition is not.
4. **A shareable recipe link (P3)**: Needs a public recipe route, so only if a public site is planned. The picture card covers sharing today.
5. **Small follow-ups**: show which planner nights went over the cost cap; ask per-person diets during onboarding; a use-by field for ordinary fridge items and automatic "use next" as a date nears; a moment of celebration when a milestone is first reached; a hemisphere setting for seasons; generate the service worker `VERSION` from the build so it cannot be forgotten. Each is listed against its item in `docs/ROADMAP.md`.

## 7. Technical Risks & Safeguards
- **Gemini API Quota / Missing Key**: Mitigated via `hasRealGeminiKey` detection and deterministic `getSimulatedVisionResponse()` fallback in `server.ts`.
- **Browser `localStorage` Quota**: Mitigated by storing normalized JSON arrays and providing 1-click JSON file export/import in `ProfileSyncModal`.

