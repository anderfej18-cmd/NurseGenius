# Skills read log (UI/UX redesign)

Written before any redesign code. It records what was read, how, what could not be
applied, and which conflicts were resolved and how. Counts come from the extraction
scripts, not from memory.

## Sources

| Source (in `Design skills/`)       | Files                   | Notes                                                                                                     |
| ---------------------------------- | ----------------------- | --------------------------------------------------------------------------------------------------------- |
| `ui-master-lite.skill` (UI Master) | 56                      | `SKILL.md`, `NOTICE.md`, 8 reference files, 45 vendored source bundles                                    |
| `design-skill.zip`                 | 77                      | `SKILL.md`, 6 own references, vendored `better-*`, `shadcn`, `explain-interface`, `migrate-radix-to-base` |
| `design-skills-bundle.zip`         | 81                      | same vendored `better-*`/`shadcn` files as `design-skill` (byte-identical copies)                         |
| `frontend-skill.zip`               | 7                       | `SKILL.md` and 6 references                                                                               |
| `files.zip`                        | 5 archives, 223 members | `apple-design` (1), `emil-design-eng` (1), `apple-hig` (160), `impeccable` (54), `taste` (7)              |
| `Dev skills/*.zip`                 | 165                     | `clean-code`, `backend-skill`, `complete-backend-development`                                             |
| `genius-nurse-hub/AGENTS.md`       | 1                       | project rule: keep privileged helpers out of client-safe `*.functions.ts` modules                         |

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
- The three machine-generated files in the `impeccable` skill were first inspected by structure only
  and then, on 2026-10-11 before Phase 1, inspected fully:
  - `scripts/live-browser.js` (13,510 lines, the script injected by Impeccable's own dev server for its
    live mode: element picker, annotation overlay, variant cycling, shader overlay, design-system
    panel): **read in full**, every line, in 12 sequential chunks. It is tool code, not design guidance, and
    nothing in it changes a rule adopted here. (It does honour `prefers-reduced-motion` in its own
    animations; its controls are small developer-tool controls and are not a model for ours.)
  - `scripts/modern-screenshot.umd.js` (29 KB, 14 lines, a minified vendored DOM-to-image library):
    **read in full**. It is third-party library code with no design guidance.
  - `scripts/data/font-index.json` (1.1 MB, one line): **parsed completely** with a script. It holds a
    schema version, the sample text, three render sizes, 36 feature names, 5 categories (sans 1,447,
    serif 628, display 586, handwriting 306, mono 109 entries) and 3,076 entries covering 1,807 font
    families, every entry having the same 7 fields and every fingerprint string well-formed (5 entries
    have one empty fingerprint). The encoded glyph fingerprints (base-36 strings used by the CLI to
    match a font) were **not read by eye**; they carry no guidance. All 1,807 family names were listed
    and read; Bricolage Grotesque, Geist and Geist Mono (the faces chosen here) are in the index.
- `Dev skills` entry points and the clean-code rules guide were re-opened for this
  phase. The 152 backend and architecture reference files were read in the earlier
  backend phase and are not re-read here.

## What cannot be applied here, and why

| Skill instruction                                                            | Status                                                                                                                                                                |
| ---------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `taste` reverse-engineers a site with Playwright MCP                         | Not run: no Playwright MCP. Its banned-vocabulary list is applied to docs and copy instead.                                                                           |
| `image-to-code` and `taste-skill` require generating design images first     | Not possible: no image-generation tool. The design is specified in tokens and built in code.                                                                          |
| `impeccable` scripts (`context`, `detect`, `concept-seed`, `serve-question`) | Not run: the CLI launcher and its binary are not part of this project. The craft floor and refuse list are applied by hand.                                           |
| shadcn CLI (`npx shadcn@latest ...`)                                         | Not run (no network use for component installs). Rules followed by hand; missing primitives (`field`, `empty`, `spinner`) are authored in the same style from tokens. |
| Apple HIG                                                                    | Native Apple platform guidance. Only platform-neutral parts apply: 44px targets, contrast, reduced motion, destructive-action rules, writing, empty and error states. |
| `userinterface-wiki` audio and sound-synthesis rules                         | Not applicable: the app plays no sound.                                                                                                                               |
| `vercel/web-design-guidelines` fetches rules by URL                          | Not fetched; its checks overlap rules already read in `better-*`.                                                                                                     |

## Conflicts and how they were resolved

Precedence: user brief, then project conventions (`AGENTS.md`, existing stack), then
the more specific source, then general guidance.

| Conflict                                                                                                   | Resolution                                                                                                                                                                                                                                              |
| ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Several sources ban Lucide, Inter, `rounded-full`, hand-rolled SVG                                         | The project already uses lucide-react and shadcn. Kept Lucide (one family, one stroke). Inter is not used. Hand-rolled SVG is limited to the signature pulse trace and chart marks.                                                                     |
| Slop-bans and impeccable discourage accordion FAQs, sun/moon toggles, feature-card grids, eyebrows         | The brief asks for an FAQ and a theme control. FAQ is a two-column question and answer list (no accordion). Theme control is a Light / Dark / System segmented control, not a sun/moon icon. No eyebrows, no section numbers, no feature-card triplets. |
| Warm cream paper plus serif plus terracotta is flagged as a default look; the brief asks for warm neutrals | Light neutrals use a mineral, green-tinted warm gray (not cream), a sans display face, and no terracotta accent. The RM pathway hue is not terracotta.                                                                                                  |
| `taste-skill` bans em dashes everywhere                                                                    | Applied to all user-visible copy and docs (period or comma instead).                                                                                                                                                                                    |
| Skills ask for dark mode via `prefers-color-scheme` or a class                                             | One mechanism only: a `.dark` class on `<html>`, set before paint from the stored preference or the system setting.                                                                                                                                     |
| `baseline-ui` says never add animation unless requested; `impeccable` wants one authored moment            | The brief requests purposeful motion. One authored hero sequence on the landing page, short feedback transitions elsewhere, nothing on exam keyboard actions, everything gated by `prefers-reduced-motion`.                                             |
| `design-system` skills want a primitive then semantic token tier                                           | Adopted: primitives are the palette ramps in `src/lib/design-tokens.ts`; components only reference semantic CSS variables.                                                                                                                              |

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

## Phase 6 (remaining student pages), 2026-10-12

Skills re-opened before the phase: `dataviz` (SKILL.md, choosing-a-form, anti-patterns, marks-and-anatomy,
interaction; the palette validator was run on the single chart series and its scope noted in
`DESIGN.md` section 11) and the Dev skill `clean-code` (router, `clean-code-rules` GUIDE, completion
checklist). Conflicts resolved:

| Conflict                                                                                                     | Resolution                                                                                                                                                                                                                                                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `dataviz` hero figure must be sans, never a display face; the design system uses a display face for headings | Stat tiles and chart figures use the body sans. The display face stays on page titles and the landing page.                                                                                                                                                                                                                                                                                                                                                      |
| `dataviz` wants a hover tooltip on every chart; the mastery bars already print every value                   | `MeterList` is a labelled meter list (a "meter" form per the skill), so each value is at the tip and in the accessible name; only the line chart has a crosshair tooltip, and it has a table twin.                                                                                                                                                                                                                                                               |
| `dataviz` validator fails a lone evergreen series on lightness band and chroma floor                         | The checks are for categorical palettes (the script says so). Recorded in `DESIGN.md`; contrast, the check that applies, passes.                                                                                                                                                                                                                                                                                                                                 |
| `clean-code` wants files by role, no junk drawers, tests for new rules                                       | New pure logic has tests (`chart-geometry`, `dashboard-view`, `plan-form`, schema parity in `engagement.schemas.test.ts`); shared pieces (`Section`, `LoadFailed`, `usePagedList`) have several callers; `StatTile` and `ConfirmDialog` have one caller each so far (the dashboard, and the remove-friend dialog) and are kept because Phase 7 uses `ConfirmDialog` for the admin confirmations and the dashboard needs four tiles; the boundary scanner passes. |

## Phase 7 (admin split and redesign), 2026-10-12

Skills re-opened before the phase: Dev skill `clean-code` (router SKILL.md, `clean-code-rules` GUIDE,
review checklist with agent smells A1 to A10), UI Master SKILL.md (Operate mode), its
`audit-and-iterate` reference, the `interface-design` source (hierarchy, density, one focal point), and
the `shadcn` SKILL.md rules (gap not space, size-\*, Field, Alert, Empty, Badge, ToggleGroup for option
sets, AlertDialog for confirmation, Dialog titles). Conflicts resolved:

| Conflict                                                                                                   | Resolution                                                                                                                                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| The plan says "pure move first, then restyle"; `clean-code` says design from the end state                 | Done in that order: the 2,051-line route was split by script into one file per tab with no change (typecheck clean), then each tab was rebuilt.                                                                                                                  |
| The old page had a wrapping tab strip; the shell sidebar and phone menu already list every admin tab       | One navigation only: the page shows the open tab under its own title (label and description from `ADMIN_TABS`); the top bar already reads "Admin / tab".                                                                                                         |
| `shadcn` wants `FieldGroup`/`Field` from its registry; the project has its own `Field` (render-prop, ARIA) | The project's `Field` is used (project conventions win).                                                                                                                                                                                                         |
| `clean-code` surgical scope vs. known defects in moved code                                                | Fixed only where the moved code was unsafe or misleading: `confirm()`/`prompt()` replaced by dialogs, a biased sort-shuffle replaced by Fisher-Yates (`sampleQuestions`), a race in the admin search, a localStorage read during server render. Each has a test. |
| Native `<select>` in the question bank vs. the design system's Select                                      | Replaced by the shared Select; a stand-in value represents "not set" because Radix items cannot carry an empty value.                                                                                                                                            |

## Phase 8 (fixtures, control audit, docs, final checks), 2026-10-12

Skills re-opened before the phase: Dev skill `clean-code` (router `SKILL.md` and the `review-checklist`
with agent smells A1 to A10 and the risk levels) and the UI Master `audit-and-iterate` reference
(sections A to G: scan, critique lens, subtraction, ugly-data stress test, bounded iteration). Conflicts
resolved:

| Conflict                                                                                                                               | Resolution                                                                                                                                                                                                                                                                         |
| -------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `audit-and-iterate` G wants one batched visual round, then one confirming round; the harness can shoot 380 captures                    | One full batched round over every view at five widths in both themes after the last code change; findings are fixed once and only the affected views are shot again.                                                                                                               |
| `audit-and-iterate` D wants ugly-data stress tests (huge lists, long names); the fixtures hold one realistic size per view             | Empty and error states are reachable for every view through `?state=`; long names and 1,000-row lists are not in the fixtures and were not stress-tested. Reported as a limit.                                                                                                     |
| `clean-code` A7 (phantom success) against a control audit that cannot call a backend                                                   | `control-audit.md` states what was traced in code and what was not run, instead of marking controls "working".                                                                                                                                                                     |
| The security scanner (`scan.js`) reports 17 critical "LLM call without authentication" and 7 session findings that are keyword matches | All 30 were read. None is a defect: the AI findings are repository, service, view and test files that mention readiness or insight (authentication is the `requireSupabaseAuth` middleware and the Edge Function checks), and the session findings are exam sessions, not Express. |
