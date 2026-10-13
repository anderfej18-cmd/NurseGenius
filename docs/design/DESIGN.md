# NurseGenius design system

The visual identity and the rules every screen follows. The values live in two places that a test keeps
identical: `src/lib/design-tokens.ts` (data) and `src/styles.css` (CSS custom properties). Components use
only the semantic tokens through Tailwind (`bg-card`, `text-muted-foreground`). The skills this system was
built under, the conflicts between them and how each was settled are in
[skills-read-log.md](skills-read-log.md).

## 1. Design read

**Persuade** on the landing page, **Operate** everywhere after sign-in. The person is a Nigerian nursing
student preparing for the RN or RM computer-based licensing exam: often on a phone, often at night, wanting
to know what to study next and whether they are getting closer. The feeling is calm, clinical and confident,
like a well-kept ward chart: evergreen ink, a mint signal, warm chart paper.

**Signature.** The observation-chart grid and one pulse-trace line. They texture the landing hero, the
readiness and progress visuals and the empty-state art. They appear nowhere else.

**Refused.** Purple or blue gradients, a centred hero over three equal cards, glass on everything, cream
with a serif and terracotta, invented statistics or testimonials, a sun/moon icon toggle, cards inside
cards, gradient text, glow as an affordance, "AI" sparkle iconography.

**Dials.** Landing: variance 7, motion 5, density 3. Signed-in app: variance 3, motion 2, density 7.

## 2. Colour

Two tiers. **Primitives** name a value by hue and step (`--evergreen-700`) and are never used in a
component. **Semantic tokens** name a job (`--primary`, `--muted-foreground`) and are the only tier
components reference. A theme is a different set of semantic assignments over the same primitives.

### Light theme (default; the landing page is always light)

| Role           | Token                          | Hex       | Used for                                      |
| -------------- | ------------------------------ | --------- | --------------------------------------------- |
| Page           | `background`                   | `#F6F3EC` | the canvas                                    |
| Surface        | `card`                         | `#FFFDF8` | cards, panels                                 |
| Raised         | `popover`, `raised`            | `#FFFFFF` | menus, dialogs, the active tab                |
| Sunken         | `sunken`, `muted`, `secondary` | `#EFEAE0` | fields, wells, tab tracks                     |
| Border         | `border`                       | `#E2DBCD` | decorative edges (1.2:1, never the only cue)  |
| Divider        | `divider`                      | `#EBE5D9` | rules between rows                            |
| Control edge   | `input`                        | `#72837B` | the boundary of a field (3.3:1 or better)     |
| Text           | `foreground`                   | `#13221F` | body and headings                             |
| Secondary text | `muted-foreground`             | `#56645F` | captions, hints, placeholders                 |
| Action         | `primary`                      | `#0E5A4F` | the one filled action of a view; links        |
| Action hover   | `primary-strong`               | `#0A443C` | hover and pressed                             |
| On action      | `primary-foreground`           | `#F4FBF8` | label on the primary fill                     |
| Selection tint | `accent`                       | `#D8F5E8` | hover and selected rows                       |
| On tint        | `accent-foreground`            | `#0A443C` | text on the tint                              |
| Mint signal    | `signal`                       | `#3FD99A` | brand moments only (logo mark, pulse, streak) |
| On signal      | `signal-foreground`            | `#062019` | text on mint                                  |
| Focus ring     | `ring`                         | `#0E5A4F` | keyboard focus                                |

### Dark theme (signed-in application only)

| Role                        | Hex       | Role                   | Hex         |
| --------------------------- | --------- | ---------------------- | ----------- |
| `background`                | `#0B1513` | `foreground`           | `#E6EFEB`   |
| `card`                      | `#111E1B` | `muted-foreground`     | `#9BAEA7`   |
| `popover`, `raised`         | `#172723` | `input` (control edge) | `#6A8077`   |
| `sunken`, `muted`           | `#0E1916` | `border`               | white at 9% |
| `primary`, `ring`, `signal` | `#3FD99A` | `divider`              | white at 6% |
| `primary-strong`            | `#62E4AE` | `accent`               | `#123A2E`   |
| `primary-foreground`        | `#062019` | `accent-foreground`    | `#62E4AE`   |

Dark is its own ramp, not an inversion. Surfaces lighten with elevation (page, card, raised), depth comes
from tone and borders rather than shadow, and status colours move to lighter steps.

### Status and pathways

| Meaning               | Light text/fill                | Light tint | Dark text/fill | Dark tint |
| --------------------- | ------------------------------ | ---------- | -------------- | --------- |
| Success               | `#1B7750`                      | `#DDF1E6`  | `#4ADE9A`      | `#0F3326` |
| Warning               | `#905507`                      | `#F8E9CC`  | `#F2B45A`      | `#3A2C10` |
| Error (`destructive`) | `#B4322B`                      | `#F9E0DC`  | `#F2877F`      | `#3D1C1A` |
| Information           | `#2565A8`                      | `#DCE9F7`  | `#7DB3EE`      | `#12293F` |
| RN pathway            | `#0E8A7A` fill, `#0A6F63` text | `#D5EFEA`  | `#4FD1BD`      | `#0F3430` |
| RM pathway            | `#C8613D` fill, `#9E4A28` text | `#F6DFD4`  | `#F09A76`      | `#3B2217` |

Status colour is never the only signal: a word or icon always goes with it. The RN and RM hues mark only
RN and RM labels and chart series.

### The rest of the primitives

Light neutrals `#FFFFFF` `#FFFDF8` `#F6F3EC` `#EFEAE0` `#EBE5D9` `#E2DBCD`, ink `#72837B` `#56645F`
`#13221F`. Night `#0B1513` `#0E1916` `#111E1B` `#172723` `#6A8077` `#9BAEA7` `#E6EFEB`. Evergreen `#F4FBF8`
`#0E5A4F` `#0A443C`. Mint `#D8F5E8` `#62E4AE` `#3FD99A` `#123A2E` `#062019`. Status steps as in the table
above, plus teal and clay ramps for the pathways.

### Rules

- One accent job: the primary fill is the one coloured action of a view. Peers stay neutral.
- Use a token only for its role. A border colour is never borrowed as a text colour.
- Every pair the interface renders is listed in `CONTRAST_PAIRS` and measured in both themes by
  `design-tokens.test.ts`: text at 4.5:1 or more, control edges, focus rings and chart marks at 3:1 or more.
  The tightest text pair has 0.18 to spare (success text on its tint).
- Charts take their series from `chart-1` to `chart-5`, which are checked at 3:1 against the card.

## 3. Typography

| Role    | Family              | Weights       | Use                                |
| ------- | ------------------- | ------------- | ---------------------------------- |
| Display | Bricolage Grotesque | 600, 700      | `h1`, `h2`, the hero, big numbers  |
| Text    | Geist               | 400, 500, 600 | everything else                    |
| Figures | Geist Mono, tabular | 500           | timers, counters, scores in tables |

All three are self-hosted (`public/fonts`, SIL OFL licences at the repository root), Latin subset,
`font-display: swap`. The two faces above the fold are preloaded. The fallback stack is the system sans, so
a slow font never blocks reading. The Latin subset does not include the Latin Extended Additional block, so
a name with a dot-below vowel (such as ẹ or ọ) falls back to the system font for that glyph.

Scale (px / line-height): 12/1.4 caption, 14/1.45 interface text, 16/1.55 reading, 18/1.5, 20/1.35,
24/1.25, 30/1.2, 38/1.1, 48/1.05. The hero is fluid: `clamp(2.5rem, 1.6rem + 4.2vw, 4.5rem)` at 1.05 with
`-0.03em` tracking. Display headings track `-0.02em`. Body copy has a 68ch measure, `text-wrap: balance`
on headings and `pretty` on paragraphs. Numbers that change use `tabular-nums`. Inputs are 16px on a phone
so iOS does not zoom.

## 4. Space, grid and layout

- **Spacing** is a 4px base: 4, 8, 12, 16, 20, 24, 32, 40, 48, 64, 80, 96, 128. Space inside a group is
  at most half the space between groups.
- **Page gutter** is `clamp(16px, 3vw, 32px)`.
- **Containers.** Landing 1240px, application content 1200px, reading text 720px. A 12-column grid from
  1024px up.
- **Breakpoints** are Tailwind's: 640, 768, 1024, 1280. Every layout is designed for 320, 390, 768, 1024
  and 1440 and re-flows rather than shrinks.
- **Section padding** on the landing page is 96 to 128px on desktop and 56 to 72px on a phone.
- Fixed bars use `env(safe-area-inset-*)` and `100dvh`, never `100vh`.

## 5. Shape, borders and depth

- **Radii.** 6px chips and keys, 10px buttons and fields, 14px cards, 20px sheets and hero panels. A pill
  is only for status badges. An inner radius is the outer radius minus the padding between them.
- **Borders** are 1px, low contrast, and decorative. A control's own edge uses the stronger `input` token.
- **Shadows** are two layers, tinted evergreen, one light direction:
  `0 1px 2px rgb(14 90 79 / .06), 0 10px 28px -14px rgb(14 90 79 / .22)` for cards. The dark theme drops
  them and relies on tone and the border.

## 6. Components

| Component            | Rule                                                                                                                                                                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Button**           | Heights 32, 40, 48; 44 on a coarse pointer. Variants: primary, secondary, outline, ghost, destructive, link. Hover only where a pointer can hover. Press scales to 96% in 120ms. Focus ring. Disabled lowers opacity and, where the reason is not obvious, the page says why. Loading keeps the label and adds a spinner. |
| **Field**            | Visible label above, hint and error below, linked by `aria-describedby`; `aria-invalid` on error; the error is next to the field, never only a toast. The control is a sunken well with a 3:1 edge.                                                                                                                       |
| **Tabs**             | A sunken track with a raised active chip. Keyboard arrows move between tabs.                                                                                                                                                                                                                                              |
| **Card**             | 14px, border, faint shadow. Use only when a group needs its own surface; spacing and tone first.                                                                                                                                                                                                                          |
| **Dialog and sheet** | Raised surface, 20px, focus moves in and returns to the trigger, Escape closes. A destructive action asks for confirmation with a specific verb button.                                                                                                                                                                   |
| **Table**            | Header row in `muted-foreground`, 1px dividers, `tabular-nums` figures, scrolls inside its own container; the page never scrolls sideways.                                                                                                                                                                                |
| **Badge**            | The only pill. Words always accompany the colour.                                                                                                                                                                                                                                                                         |
| **Progress**         | `transform` only. The value is also written in words beside it.                                                                                                                                                                                                                                                           |
| **Empty state**      | Says what belongs here, why it is empty, and gives one next action. Never filled with invented records.                                                                                                                                                                                                                   |
| **Toast**            | Follows the applied theme. Never the only channel for an error.                                                                                                                                                                                                                                                           |

Icons are Lucide, one family, with a 1.5px stroke beside regular text and 2px beside semibold, on a 16, 20 or 24px grid, padded to a 44px hit area when
tappable. Decorative icons are `aria-hidden`; icon-only buttons carry an `aria-label`.

## 7. Motion

Animate `transform` and `opacity` only; never `transition: all`. Curves: `--ease-out
cubic-bezier(0.23, 1, 0.32, 1)` for entrances and most interface motion, `--ease-in-out
cubic-bezier(0.77, 0, 0.175, 1)` for movement on screen. Durations: press 120ms, popover 180ms, sheet and
dialog 240ms, hero sequence at most 800ms with a 60ms stagger. Nothing animates on exam keyboard actions.
One authored moment (the landing hero) plus scroll reveals; everywhere else, short feedback only.
`prefers-reduced-motion: reduce` keeps the fades and removes the movement (translate, scale, parallax),
stops pulsing skeletons, and turns smooth scrolling off.

## 8. Themes

- The signed-in application (student and admin) offers **Light, Dark or System** as a labelled segmented
  control (`ThemeControl`), placed inside the application. The choice is saved on the device in
  `localStorage` under `ng.theme` and restored on the next visit.
- Public pages (landing, sign in, onboarding, shared tests, the 404 page) are always light, so a visitor's
  preference never changes the first impression. The landing page also wraps itself in `.theme-fixed`.
- A small script in `<head>` (`themeInitScript`) puts the right class on `<html>` before the first paint,
  so there is no flash of the wrong theme. It only reads storage. A test runs the real script over every
  address, stored value and system setting and requires it to agree with the application's own rules.
- The theme is a class on `<html>`. It never touches data or behaviour.

## 9. Accessibility floor

Semantic landmarks and headings that do not skip; a skip link; visible keyboard focus on everything
focusable; labels on every control; 4.5:1 text and 3:1 control contrast in both themes (measured);
44px touch targets on coarse pointers; nothing relies on colour alone; layouts work at 320px wide with
no horizontal scroll; reduced motion honoured; error text linked to its field.

## 10. Enforced by tests

| Rule                                                                                                        | Test                     |
| ----------------------------------------------------------------------------------------------------------- | ------------------------ |
| CSS and `design-tokens.ts` declare identical tokens                                                         | `design-tokens.test.ts`  |
| Every listed colour pair meets its floor in both themes                                                     | `design-tokens.test.ts`  |
| Theme rules, and the pre-paint script agrees with them                                                      | `theme.test.ts`          |
| No raw colours, palette classes, gradients, `transition-all` or old glow utilities in components and routes | `ui-system.test.ts`      |
| Chart arithmetic: scale, nearest point, straight segments, ticks                                            | `chart-geometry.test.ts` |

## 11. Data visualisation

Read from the `dataviz` skill before any chart was built. The product has one measured quantity that
is worth a chart (a score from 0 to 100) and one that is a list (mastery per topic), so there are two
forms and no more:

- `TrendChart`: one series on one 0 to 100 axis. 2px line, 10% wash, solid hairline grid, the latest
  point ringed in the card colour, a crosshair that snaps to the nearest test, keyboard arrows, and a
  "Show table" twin so every value is readable without the tooltip. No legend, because there is one series.
- `MeterList`: single-series bars on a 0 to 100 axis with the value at the tip, square at the baseline
  and rounded at the data end. Status words (Weak, Developing, Proficient) carry the reading, not colour.
- A stat tile is used wherever the data is one number (readiness, streak, level, allowance). Confidence
  and pace are tiles and counts, not charts.
- No dual axes, no pie or donut, no rainbow, no categorical palette. Both forms use `chart-1`, which is
  checked at 3:1 against the card in both themes.
- Colour validation: the skill's validator scores categorical palettes (lightness band, chroma floor,
  colour-blind separation). `chart-1` alone is not a categorical palette, so those checks do not apply:
  with a single series there is nothing to tell apart, and the brand evergreen is deliberately low
  chroma. What does apply, contrast against the surface, passes (`design-tokens.test.ts`). If a second
  series is ever added it must be validated as a palette first.
- Figures on stat tiles use the body sans with proportional digits, not the display face (the skill's rule
  for hero figures); the display face stays on page titles.

## 12. Known limits

- Every screen was captured in headless Chrome from the fixture harness (`visual/`), in both themes at
  320, 390, 768, 1024 and 1440 px, and checked for horizontal overflow and console errors. A person has
  not looked at them, and none was captured against live data, so real content lengths are unseen.
- The harness shows each view with synthetic data. It proves layout and states, not that the backend
  accepts a call; [control-audit.md](control-audit.md) lists what could not be verified.
- Fonts are a Latin subset; some Yoruba and Igbo diacritics fall back to the system font.
- The fallback font is not metric-matched to Geist, so a late font swap can shift text slightly.
