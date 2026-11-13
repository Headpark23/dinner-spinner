# Heirloom Interface Redesign Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Raise Dinner Spinner to a refined, five-star “modern British kitchen heirloom” experience, led by the existing licensed food photography, without removing, renaming, or changing any product mechanics.

**Architecture:** Keep all state, handlers, context APIs, navigation indices, storage, server calls, and dinner-engine logic untouched. Apply the redesign through the existing shared UI primitives, a revised token layer, and presentation-only class hooks on the shell, spinner, header, navigation, and result card; secondary views inherit the system through shared components and semantic colour utilities.

**Tech Stack:** React 19, TypeScript, Tailwind CSS v4, Vite, Lucide React, Node test runner through `tsx`.

**Spec:** `DESIGN.md`

## Global Constraints

- Preserve every existing feature, control, keyboard shortcut, handler, navigation destination, modal, responsive state, and accessibility label.
- Do not modify `src/context/DinnerContext.tsx`, `src/utils/dinnerEngine.ts`, `server.ts`, recipe data, photo-credit data, or user-owned uncommitted photo assets.
- Keep the mobile-first 480px interaction model and the desktop “Tonight” companion rail.
- Keep semantic status colours distinct for success/fresh, warning/eat-soon, and destructive/use-next states.
- Retain visible keyboard focus, reduced-motion support, and touch targets of at least 44px for primary controls.
- Use no new runtime dependency and no image generation; feature the existing licensed food-photo library throughout result and recipe surfaces.
- Fill genuine photo gaps only with reusable open-source images whose author, licence, licence URL, and original source are recorded in `src/data/photoCredits.json`.
- Spend visual drama on the reel housing; keep surrounding utility surfaces restrained.

## Review Focus

- Existing spin modes, time filters, effort filters, clearout switch, nudge, hold, lever, spin button, recipe sheet, favourite control, shopping shortcut, and household vote action must remain present and wired to the same handlers.
- Bottom navigation must retain all five destinations and the pantry urgency badge at mobile size.
- Dark mode and light mode must both retain readable contrast, semantic status meaning, and visible focus treatment.
- Reduced-motion users must still receive immediate results without reel, lever, or view-transition animation.
- Long dish names, four-reel Sunday mode, dense pantry lists, sheets, and the desktop companion rail must not overflow their containers.

---

### Task 1: Freeze the feature inventory and premium design contract

**Files:**
- Create: `src/designContract.test.ts`
- Test: `src/designContract.test.ts`

**Interfaces:**
- Consumes: source files as UTF-8 text.
- Produces: a regression contract for feature anchors and the new presentation hooks.

- [ ] **Step 1: Write the failing design-contract test**

Create tests that read `src/index.css`, `src/App.tsx`, `src/components/ui.tsx`, `src/components/ReelWindow.tsx`, `src/components/ArcadeNavBar.tsx`, and `src/components/views/MachineView.tsx`. Assert the existing feature labels/handlers remain, and assert the not-yet-present hooks `app-shell`, `cabinet-shell`, `view-stage`, `tonight-rail`, `machine-intro`, `control-deck`, `reel-housing`, `spin-result`, and `app-nav` plus the new porcelain/bottle-green/aged-brass token values.

- [ ] **Step 2: Run the test to verify it fails for the missing redesign contract**

Run: `npx tsx --test src/designContract.test.ts`

Expected: FAIL on the first missing presentation hook or premium token, while the preserved feature-anchor assertions pass.

### Task 2: Rebuild the shared visual system without changing component APIs

**Files:**
- Modify: `src/index.css:1-220`
- Modify: `src/components/ui.tsx:1-359`
- Test: `src/designContract.test.ts`

**Interfaces:**
- Consumes: the existing `Button`, `IconButton`, `Card`, `Segmented`, `Switch`, `Chip`, `Notice`, `TextInput`, `Select`, `Sheet`, and `DishTile` props unchanged.
- Produces: the same exported component signatures with refined surface, typography, focus, control, and sheet styling.

- [ ] **Step 1: Replace the global colour/type/elevation tokens**

Use cool porcelain, carbon ink, bottle-green enamel, oxblood action, aged brass, restrained sage, and amber semantic values in both colour schemes. Keep existing Tailwind token names (`tomato`, `sage`, `saffron`, `enamel`, `brass`) so call sites and meaning remain intact.

- [ ] **Step 2: Add the presentation hooks and responsive surface rules**

Define the hooks from Task 1, including soft kitchen-light page atmosphere, a disciplined 480px cabinet, quiet desktop rail, restrained cards, and reduced-motion overrides.

- [ ] **Step 3: Refine shared primitives without changing props or event forwarding**

Adjust shape hierarchy, borders, active states, spacing, typography, focus and sheet treatment in `ui.tsx`; preserve every exported name, default, spread prop, role and handler.

- [ ] **Step 4: Run type-check and the focused contract test**

Run: `npm run lint`

Expected: PASS with no TypeScript errors.

Run: `npx tsx --test src/designContract.test.ts`

Expected: still FAIL only on hooks not yet added to application markup.

### Task 3: Turn the spinner into the signature heirloom object

**Files:**
- Modify: `src/components/ReelWindow.tsx:1-340`
- Modify: `src/components/views/MachineView.tsx:63-270`
- Test: `src/designContract.test.ts`

**Interfaces:**
- Consumes: existing `useDinner()` values and `onSpin: () => void`.
- Produces: identical spin, nudge, hold, lever, keyboard, result-card and recipe actions with new presentation hooks.

- [ ] **Step 1: Add `machine-intro`, `control-deck`, and `spin-result` hooks to existing containers**

Do not move controls across conditional branches and do not rename labels, handlers, ARIA attributes, or state reads.

- [ ] **Step 2: Add the `reel-housing` hook and refine only visual class strings**

Preserve `handleLeverPull`, keyboard effects, timeouts, confetti conditions, held-reel logic, nudge logic, and `onSpin` invocation exactly.

- [ ] **Step 3: Run the focused contract test**

Run: `npx tsx --test src/designContract.test.ts`

Expected: FAIL only on shell/header/navigation hooks not yet added.

### Task 4: Refine the cabinet shell, header, navigation and desktop rail

**Files:**
- Modify: `src/App.tsx:17-169`
- Modify: `src/components/CabinetHeader.tsx`
- Modify: `src/components/ArcadeNavBar.tsx`
- Test: `src/designContract.test.ts`

**Interfaces:**
- Consumes: unchanged header callback props and `useDinner()` navigation state.
- Produces: identical modal triggers and five-view navigation with the `app-shell`, `cabinet-shell`, `view-stage`, `tonight-rail`, and `app-nav` hooks.

- [ ] **Step 1: Add shell and rail hooks without changing render conditions**

Keep active view indices `0`, `1`, `2`, `3`, and `4`, modal state, and `TonightPanel` actions unchanged.

- [ ] **Step 2: Add header and navigation hooks without changing buttons**

Retain all button labels, pantry badge logic, sound toggle, profile/rules callbacks and bottom safe-area behaviour.

- [ ] **Step 3: Run the contract test to green**

Run: `npx tsx --test src/designContract.test.ts`

Expected: PASS.

### Task 5: Verify mechanics, responsiveness and visual quality

**Files:**
- Modify only if verification reveals a presentation regression in the files above.
- Test: `src/designContract.test.ts`, `src/utils/dinnerEngine.test.ts`

**Interfaces:**
- Consumes: the completed presentation layer.
- Produces: verified build and interaction parity.

- [ ] **Step 1: Run the complete automated checks**

Run: `npm test`

Expected: all dinner-engine, server, and existing UI render tests pass.

Run: `npx tsx --test src/designContract.test.ts`

Expected: PASS.

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: PASS with a production bundle.

- [ ] **Step 2: Perform mobile and desktop interaction checks**

At phone and desktop breakpoints, verify all five navigation views, the three spin modes, all time/effort choices, clearout switch, spin/lever, nudge, holds, favourite, recipe sheet open/close, shopping shortcut, send-to-vote, profile, rules, sound, and keyboard shortcuts.

- [ ] **Step 3: Perform accessibility and stress checks**

Verify keyboard-only focus order, focus visibility, reduced-motion rendering, light/dark contrast, long meal names, four-reel layout, dense lists, modal scroll containment, and safe-area navigation.

- [ ] **Step 4: Review screenshots and make presentation-only corrections**

Capture phone and desktop screenshots, compare against the “modern British kitchen heirloom” direction, and remove any decoration that competes with the reel or obscures controls.

### Task 6: Audit and complete the licensed photo library

**Files:**
- Modify only for uncovered recipes: `public/photos/*.webp`
- Modify only for matching attribution records: `src/data/photoCredits.json`
- Verify: `src/data/photos.ts`, `src/data/initialData.ts`, `src/data/worldRecipes.ts`

**Interfaces:**
- Consumes: meal IDs and the existing `photoFor(mealId)` lookup convention.
- Produces: locally stored WebP images plus complete, user-visible attribution metadata for every newly added file.

- [ ] **Step 1: Inventory photo coverage before downloading anything**

Compare all starter and World Kitchen meal IDs with `photoFor` mappings, local files, and credit records. Treat existing uncommitted images and credit edits as user-owned inputs to preserve and integrate.

- [ ] **Step 2: Search only for genuine gaps**

Prefer Wikimedia Commons files licensed CC0, public domain, CC BY, or CC BY-SA. Reject non-commercial, no-derivatives, unclear, or missing licences; reject an image if the pictured dish does not credibly match the recipe.

- [ ] **Step 3: Download and normalize accepted images**

Use the existing `scripts/fetch_photos.py` workflow to create 960px-wide, locally stored WebP assets. Do not hotlink remote images.

- [ ] **Step 4: Record and validate attribution**

For each new asset, add its Commons file title, author, exact licence, licence URL, and source URL to `src/data/photoCredits.json`; verify every credited file exists and every added file has a credit.

- [ ] **Step 5: Re-run the complete automated checks**

Run: `npm test`

Expected: PASS.

Run: `npm run lint`

Expected: PASS.

Run: `npm run build`

Expected: PASS.

## Self-Review

- Spec coverage: the shared system, spinner, shell, navigation, companion rail, mobile layout, desktop layout, dark mode, focus, reduced motion, licensed imagery, and attribution are covered. Secondary screens inherit the shared system without risky structural rewrites.
- Step scan: each implementation step changes one presentation boundary or runs one checkable verification group.
- Type consistency: no public component, context or handler signatures change.
- Review focus coverage: the contract test freezes feature anchors; automated suites protect engine/server behaviour; manual interaction checks cover dynamic UI and responsive failure modes.
- Proportion: the plan deliberately avoids redesigning every feature component individually because shared primitives and tokens provide the safest high-quality change with the smallest mechanical risk.
