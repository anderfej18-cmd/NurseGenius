# Skills read log (UI/UX redesign)

Written before any redesign code. It records what was read, how, what could not be
applied, and which conflicts were resolved and how. Counts come from the extraction
scripts, not from memory.

## Sources

| Source (in `Design skills/`) | Files | Notes |
|---|---|---|
| `ui-master-lite.skill` (UI Master) | 56 | `SKILL.md`, `NOTICE.md`, 8 reference files, 45 vendored source bundles |
| `design-skill.zip` | 77 | `SKILL.md`, 6 own references, vendored `better-*`, `shadcn`, `explain-interface`, `migrate-radix-to-base` |
| `design-skills-bundle.zip` | 81 | same vendored `better-*`/`shadcn` files as `design-skill` (byte-identical copies) |
| `frontend-skill.zip` | 7 | `SKILL.md` and 6 references |
| `files.zip` | 5 archives, 223 members | `apple-design` (1), `emil-design-eng` (1), `apple-hig` (160), `impeccable` (54), `taste` (7) |
| `Dev skills/*.zip` | 165 | `clean-code`, `backend-skill`, `complete-backend-development` |
| `genius-nurse-hub/AGENTS.md` | 1 | project rule: keep privileged helpers out of client-safe `*.functions.ts` modules |

Design skills total: **449 extracted files**, 445 hashed (SHA-1), **378 distinct
contents**. 67 files are byte-identical duplicates of another file (mostly the
vendored `better-*`/`shadcn` copies appearing in both the bundle and `design-skill`).
Duplicates were read once and recorded as "identical to X" in the working log.

Nothing was inaccessible. Every archive was extracted into its own empty folder and
the member counts match (`unzip -Z1` count versus files on disk).

## How it was read

- Text files were opened with the Read tool, in 61 ordered batches (000 to 060),
  every line of every batch, chunked where a file exceeded the tool's size cap.
  Each batch was appended to the working read log only after it had been read.
- UI Master, design-skill and frontend-skill entry points and their own references
  were read first, before batching.
- The three machine-generated data files in the `impeccable` skill were inspected
  by structure and head only, not line by line:
  `data/font-index.json` (1.1 MB font fingerprint index: schema, sizes, features,
  categories, entries), `live-browser.js` (13,510 lines, the injected live-mode UI
  script for Impeccable's own dev server) and `modern-screenshot.umd.js`
  (minified vendored library). They contain no design guidance.
- `Dev skills` entry points and the clean-code rules guide were re-opened for this
  phase. The 152 backend and architecture reference files were read in the earlier
  backend phase and are not re-read here.

## What cannot be applied here, and why

| Skill instruction | Status |
|---|---|
| `taste` reverse-engineers a site with Playwright MCP | Not run: no Playwright MCP. Its banned-vocabulary list is applied to docs and copy instead. |
| `image-to-code` and `taste-skill` require generating design images first | Not possible: no image-generation tool. The design is specified in tokens and built in code. |
| `impeccable` scripts (`context`, `detect`, `concept-seed`, `serve-question`) | Not run: the CLI launcher and its binary are not part of this project. The craft floor and refuse list are applied by hand. |
| shadcn CLI (`npx shadcn@latest ...`) | Not run (no network use for component installs). Rules followed by hand; missing primitives (`field`, `empty`, `spinner`) are authored in the same style from tokens. |
| Apple HIG | Native Apple platform guidance. Only platform-neutral parts apply: 44px targets, contrast, reduced motion, destructive-action rules, writing, empty and error states. |
| `userinterface-wiki` audio and sound-synthesis rules | Not applicable: the app plays no sound. |
| `vercel/web-design-guidelines` fetches rules by URL | Not fetched; its checks overlap rules already read in `better-*`. |

## Conflicts and how they were resolved

Precedence: user brief, then project conventions (`AGENTS.md`, existing stack), then
the more specific source, then general guidance.

| Conflict | Resolution |
|---|---|
| Several sources ban Lucide, Inter, `rounded-full`, hand-rolled SVG | The project already uses lucide-react and shadcn. Kept Lucide (one family, one stroke). Inter is not used. Hand-rolled SVG is limited to the signature pulse trace and chart marks. |
| Slop-bans and impeccable discourage accordion FAQs, sun/moon toggles, feature-card grids, eyebrows | The brief asks for an FAQ and a theme control. FAQ is a two-column question and answer list (no accordion). Theme control is a Light / Dark / System segmented control, not a sun/moon icon. No eyebrows, no section numbers, no feature-card triplets. |
| Warm cream paper plus serif plus terracotta is flagged as a default look; the brief asks for warm neutrals | Light neutrals use a mineral, green-tinted warm gray (not cream), a sans display face, and no terracotta accent. The RM pathway hue is not terracotta. |
| `taste-skill` bans em dashes everywhere | Applied to all user-visible copy and docs (period or comma instead). |
| Skills ask for dark mode via `prefers-color-scheme` or a class | One mechanism only: a `.dark` class on `<html>`, set before paint from the stored preference or the system setting. |
| `baseline-ui` says never add animation unless requested; `impeccable` wants one authored moment | The brief requests purposeful motion. One authored hero sequence on the landing page, short feedback transitions elsewhere, nothing on exam keyboard actions, everything gated by `prefers-reduced-motion`. |
| `design-system` skills want a primitive then semantic token tier | Adopted: primitives are the palette ramps in `src/lib/design-tokens.ts`; components only reference semantic CSS variables. |

## Rules carried into the build (checked again at each phase)

- Semantic tokens only in components; no raw hex or palette classes in `src/components` or routes.
- Contrast: 4.5:1 text, 3:1 UI, measured from the token file by a unit test, light and dark.
- Touch targets 44px on mobile; visible `:focus-visible`; real `<button>` and `<a>`.
- States for every data view: loading, empty, error, populated. No fabricated data.
- Motion: transform and opacity only, named properties (no `transition: all`), ease-out curves,
  120 to 240 ms for UI, `prefers-reduced-motion` removes movement.
- Numbers use tabular figures. Headings `text-wrap: balance`, body `text-wrap: pretty`.
- Layout: 4px base spacing, grouping by space, one radius scale, concentric radii, no cards in cards.
- Bounded visual QA: one batched screenshot round across widths, fixes in one batch, at most one confirming round.
- Project rules: clean-code layering (route container + presentational view), reuse before adding,
  no new dependency without need, no dead files, `AGENTS.md` client/server boundary kept.
