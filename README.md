<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# 🎰 Dinner Spinner — Mechanical Kitchen Decision Cabinet

A tactile British pub fruit-machine ("one-armed bandit") dinner decider, zero-waste pantry manager, family voting booth, and reverse prep timer built with **React 19, TypeScript, Tailwind CSS v4, Express, Web Audio API, and Google Gemini Vision**.

## ✨ Key Features

- **3 Arcade Reel Modes**:
  - **Single Reel**: Spins your curated recipe library filtered by **Time Stake** (`20m`, `30m`, `60m`, `all-day`), **Effort** (`one-pot`, `standard`, `chef-mode`), and **Banned Ingredients**.
  - **3-Reel Builder**: Mix-and-match `Carb + Hero Ingredient + Sauce` with individual reel **HOLD** locks and **NUDGE** steps.
  - **4-Reel Sunday Roast Jackpot**: Builds a full Sunday feast (`Meat + Potatoes + Star Side + Veg & Gravy`).
- **Smart Probability Engine**:
  - **Use-It-or-Lose-It Clearout (`4.5×` Boost)**: Prioritizes recipes that rescue expiring **Red ("Use Next")** fridge items.
  - **4-Day Cooling-Off Rule (`-85%` Weight)**: Prevents midweek meal repetition while allowing manual Nudge overrides.
- **Family Voting Booth & 3-Veto Takeaway Override**:
  - Pass-the-phone household ballot with weekly Veto Token allowances (`3/week`).
  - Hit **3 consecutive vetoes** and the kitchen officially closes—triggering the **Takeaway & Door Duty Spinner**!
- **Reverse Prep Timers & Portion Scaler**:
  - Enter your target eating time (e.g. `18:30`) and get a backwards-calculated prep checklist (`-28m`, `-18m`, `-0m`) plus `2p / 4p / 6p / 8p` ingredient scaling.
- **Pantry Vision, Meal Vault & Kitchen Telemetry**:
  - Traffic-light fridge inventory, Gemini Multimodal Vision (Fridge Snap, Supermarket Receipt Scanner, Recipe Photo/Text Extractor with offline demo fallback), interactive SVG Cuisine Donut Chart, and JSON Cloud Sync/Backup.

## 🚀 Run Locally

**Prerequisites:** Node.js (v20+)

1. Install dependencies:
   ```bash
   npm install
   ```
2. *(Optional)* Set `GEMINI_API_KEY` in `.env` for live Gemini Vision analysis (works out-of-the-box in Smart Kitchen Simulation mode if omitted).
3. Start the development server:
   ```bash
   npm run dev
   ```
4. Run automated unit & API tests and type-checking:
   ```bash
   npm test
   npm run lint
   npm run build
   ```
