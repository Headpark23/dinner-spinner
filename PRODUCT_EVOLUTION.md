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
4. **Offline & API-Key Resilience**: Works 100% offline via `localStorage` and JSON backup/restore; `/api/pantry/analyze` seamlessly falls back to realistic UK Kitchen AI simulations when `GEMINI_API_KEY` is absent.

## 5. Completed Evolution Milestones (v2.0)
- [x] **Core Engine Extraction (`src/utils/dinnerEngine.ts`)**: Pure, unit-tested domain logic for eligibility filtering (`timeStake` + `effort` + `bannedIngredients`), weighted selection (`4.5×` Clearout boost, `0.15×` 4-day cooling-off penalty, `1.3×` favourite boost), pantry match calculation, dynamic 3-Reel and 4-Reel Sunday Roast meal synthesis, and reverse timer math.
- [x] **Kinetic Cycling Reels & Pantry Match Badges (`ReelWindow.tsx`, `MachineView.tsx`)**: Real-time cycling of candidate dishes/ingredients during spins, live eligible drum counter, per-ingredient stock & Red-rescue badges, and Favourite (`♥`) toggle.
- [x] **Multi-Member Household Ballot & Portion Scaler (`VotingView.tsx`)**: Per-member ballot tracking, strict Veto Token enforcement (`0 tokens` block + weekly reset), custom household member roster, `2p/4p/6p/8p` ingredient scaling, and live Reverse Prep Progress bar with automatic Red pantry item clearance on cook completion.
- [x] **Interactive Meal Vault & Smart Shopping Diff (`PantryView.tsx`)**: Search, multi-filter (`♥ Favourites`, `5★ Gold`, `20m Dash`, `♻️ Uses Red Items`), manual custom recipe creation form, 1-tap "Stock All Missing Items", and AI Text-to-Recipe / Demo Scan modes.
- [x] **Telemetry & SVG Data Visualisations (`ScorecardView.tsx`)**: Executive Bento KPIs (Estimated £ Takeaway Savings, Red Items Rescued, Gold Reels), interactive SVG Donut Chart for Cuisine Rotation, Pantry Freshness Health bar, Time-Stake Reality distribution, and Household Veto Telemetry.
- [x] **Real Server Cloud Sync & JSON Import/Restore (`server.ts`, `ProfileSyncModal.tsx`)**: Persistent `POST /api/sync/cloud` & `GET /api/sync/cloud` snapshots plus client-side `.json` file import/export.
- [x] **Automated Unit & API Integration Test Suite (`src/utils/dinnerEngine.test.ts`)**: 7 deterministic test suites covering domain algorithms and Express HTTP endpoints (`npm test`).

## 6. Deferred Opportunities & Prioritised Backlog
1. **Multi-Device Live WebSocket Room Sync (P1 — Strategic Expansion)**: Allow family members in different rooms (or on the train home) to join a 4-digit room code and cast votes simultaneously via WebSockets/SSE.
2. **UK Supermarket Basket Deep-Linking (P2 — High Impact)**: Map "Missing Bits" shopping lists directly to Tesco, Sainsbury's, Ocado, and Aldi search URLs.
3. **Browser Web Notifications for Reverse Prep Steps (P2 — Quick Win)**: Optional Web Notification API alerts when each reverse prep countdown milestone hits `00:00`.
4. **Nutritional & Cost-Per-Portion Estimator (P3 — Experiment)**: Optional macro (Protein/Fibre) and per-portion UK supermarket cost tags on Meal Cards.

## 7. Technical Risks & Safeguards
- **Gemini API Quota / Missing Key**: Mitigated via `hasRealGeminiKey` detection and deterministic `getSimulatedVisionResponse()` fallback in `server.ts`.
- **Browser `localStorage` Quota**: Mitigated by storing normalized JSON arrays and providing 1-click JSON file export/import in `ProfileSyncModal`.

