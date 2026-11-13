# Dinner Spinner: Design Direction

## The idea in one line
**A modern British kitchen heirloom.** The fruit machine stays as the product's signature, rendered like real bottle-green enamel hardware with an aged-brass payline and proper lever. It sits inside a calm porcelain interface that reads like an impeccably edited cookbook rather than a casino.

## What I learned from the category (and adjacent products)
This is drawn from product knowledge rather than a fresh screenshot crawl in this pass.
- **NYT Cooking, Mob, Bon Appétit:** confidence comes from editorial type and photography, not from chrome. Titles are set in a serif and metadata stays quiet and small.
- **Mela, Crouton, Paprika:** recipe utilities stay legible at arm's length in a kitchen, with large tap targets, one primary action per screen and timers you can read across the room.
- **Pestle / Apple Clock:** a timeline you cook against should emphasise *the next step* and *the time it's due*, not a percentage.
- **Monzo, Things 3:** restraint reads as trust. One accent colour, used only to say "this is the action". Status colours carry meaning and nothing else.
- **Duolingo (done gently):** progress and streaks bring people back, but only when they reflect something real. So no invented numbers.
- **Real slot machines and pub fruit machines:** the delight comes from the *physical* metaphor (the lever, the hold buttons, the payline), not from glowing everything.

## What was removed (the "generated" look)
Emoji used as icons, monospace uppercase on every label, amber glows and drop-shadow halos, gradient buttons, ping/pulse animations on static status, "OAuth2 VERIFIED" theatre, bento KPI tiles of invented numbers, and repeated identical bordered boxes.

## Tokens
| Role | Light | Dark |
|---|---|---|
| Porcelain (page) | `#F5F2EB` | `#111713` |
| Card | `#FFFDF8` | `#18201B` |
| Carbon ink (text) | `#1D2420` | `#F5F1E8` |
| Ink 2 (secondary) | `#53605A` | `#BDC7C0` |
| Line | `#DED8CC` | `#2A382F` |
| Oxblood (the one accent, actions) | `#8F2F3B` | `#D67882` |
| Sage (fresh / have it / agreed) | `#466354` | `#89AA96` |
| Amber (eat soon) | `#996B23` | `#D6AD68` |
| Bottle-green enamel (reel window) | `#10241D` | `#07110D` |
| Aged brass (machine details) | `#C3A15D` | `#D1B16F` |

Status colours are semantic only: oxblood for "use next" and destructive actions, amber for "soon", sage for "fresh" and success. The legacy token names remain in code so the redesign cannot disturb feature call sites.

## Type
- **Newsreader** (variable serif, OFL) for display: screen titles, meal names and the reel.
- **Manrope** (OFL) for all UI text, with tabular numerals for times and counts.
- Scale: 30 / 22 / 17 / 15 / 13 / 12. Uppercase is only used for tiny section eyebrows, tracked +0.08em.

## Layout
- Mobile-first, a single 480px column. The header is sticky and slim, and the bottom tab bar is sticky inside the column (it no longer floats over the whole viewport on desktop).
- 4px base grid, with 16px gutters and 12/16/24 vertical rhythm.
- The Spin button must be visible without scrolling on a 375×812 phone.
- Desktop (≥1024px) adds a "Tonight" side column: next prep step, the fridge items to use up, and household vetoes.

## Components
Buttons come in primary (solid tomato), secondary (card with a line border) and quiet (text only). Selections use segmented controls rather than stacks of glowing toggles. The pantry boost is a switch. Cards have a 14px radius, a 1px line border and no shadow, apart from the reel window, which gets an inset shadow because it's the one "physical" object. Icons are Lucide at 1.75 stroke throughout.

## Motion
The reel scrolls vertically while spinning, the lever travels down and springs back, and held reels show a brass tab. Everything else is a 150ms ease. With `prefers-reduced-motion`, motion is cut and the result simply appears. Confetti fires only when a five-star dish lands *after a spin*, and never under reduced motion.

## Imagery
Meal photography is planned for the result card and the meal vault: overhead or 45° natural-light shots on wood or linen, warm colour temperature, 4:3 crop and a dark bottom gradient only where text overlays. Until licensed photos are approved and stored locally, the card uses a cuisine-tinted typographic tile instead of an emoji.

## Data
Only real numbers. Stats come from the cook and takeaway logs, the fridge and the vote history. Where there isn't enough data yet, the screen says so and suggests the action that would create it.
