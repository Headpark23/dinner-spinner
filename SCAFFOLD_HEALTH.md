# Dinner Spinner — Scaffold Health Report

Inspected 13 Nov 2026. Stack: React 19 + TypeScript + Tailwind v4 + Vite 8, served by an Express server (`server.ts`) that also proxies Gemini vision. All state lives in one React context (`src/context/DinnerContext.tsx`) persisted to `localStorage`; the pure decision logic is in `src/utils/dinnerEngine.ts`.

Baseline checks: `npm test` 8/8 pass · `npm run lint` clean · `npm run build` OK (402 kB JS / 115 kB gzip).

## 1. Feature map

| Feature | Status |
|---|---|
| Single-reel spin (time + effort + banned filter, weighted pick, cooling-off, clearout boost) | Working and verified |
| 3-reel builder and 4-reel Sunday roast (hold, nudge, combo meal synthesis) | Working and verified |
| Keyboard shortcuts (Space, N, 1–4, M) | Working, needs refinement (Space on a focused button both clicks and spins) |
| Family vote (per-member ballot, majority lock, fast-track lock) | Working and verified |
| Veto tokens and 3-veto takeaway override | Working and verified |
| Reverse prep timeline and portion scaler | Working and verified (scaler only prefixes "1.5×", no real quantities) |
| "Finished cooking" (logs cook, clears rescued red items) | **Broken**: every extra tap logs another cook |
| Takeaway + door-duty spinner, usual orders, copy order | Working and verified |
| Fridge traffic-light inventory, staples, banned list | Working and verified |
| Meal vault (search, filters, manual recipe form) | Working and verified |
| Shopping diff ("Shop" tab) | Working, needs refinement |
| AI vision: fridge photo, receipt, recipe photo/text | **Broken in practice**: the "Demo" buttons call live Gemini when a key is present, with no timeout; the request hung for over 45 s in testing |
| Scorecard charts | Partially implemented: several numbers are invented (hard-coded Jul–Nov history, +28 takeaway baseline, "£3,768 saved") |
| Cloud sync / JSON backup | Working; labelled "OAuth2 verified / connected" although there is no sign-in at all |
| Confetti on 5★ result | **Broken**: fires on page load and on favourite/rating changes, not just after a spin |

## 2. What works
The domain engine is solid, pure and unit-tested. Every core journey completes end to end in a real browser: spin → propose → vote → timeline → cooked, and veto ×3 → takeaway override. No console errors.

## 3. What needs fixing (fixed in this pass)
1. Double-logging of cooks (data integrity).
2. AI demo buttons hanging; no server-side timeout or client abort.
3. Confetti firing on load.
4. Fabricated statistics on the Scorecard. Replaced with figures computed from a real cook/takeaway log.
5. Misleading "OAuth2 verified" copy and a hot-linked third-party avatar.
6. Space shortcut double-firing on focused buttons; the spinning drum shows meals outside the eligible pool (including banned ones).
7. Veto streak and takeaway override lost on reload.
8. On a phone, the Spin button sits below the fold.

## 4. What must be preserved
The engine and its weights, the context API that the tests import, the five views and their export names, the procedural Web Audio, the offline-first `localStorage` model, the server's simulation fallback, and the reel/lever/hold/nudge mechanic. That mechanic is the product's character; the redesign keeps it and makes it look deliberate.

## 5. Blockers to the redesign
None. The UI is presentation-only on top of the context, so it can be re-skinned screen by screen without touching the engine. One risk: the project isn't under version control. A copy of the original `src/` was taken before any edits.
