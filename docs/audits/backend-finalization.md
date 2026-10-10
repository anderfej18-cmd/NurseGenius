# Backend finalization and frontend readiness: 2026-10-09

What was checked, what was changed, what could not be done and why. Companion documents:
[FEATURE_INVENTORY.md](../FEATURE_INVENTORY.md), [ROUTE_MAP.md](../ROUTE_MAP.md),
[ai-features.md](ai-features.md) (the seven AI features) and [../deployment.md](../deployment.md) (what the owner runs).

**Everything below was verified locally** (Vitest, the real migrations replayed on PGlite, typecheck, build, a
local dev server answering requests). No Supabase project, Edge Function, Cloudflare Worker, Paystack account,
AI provider or browser was used, and nothing was applied, deployed, committed or pushed.

## Verification run

| Check | Result |
|---|---|
| `bun run test` | exit 0: 156 files, 2,090 tests passed, 0 failed |
| `bun run lint` | exit 0: 0 errors, 9 warnings (all pre-existing: hook dependency lists, fast-refresh exports) |
| `bun run typecheck` | exit 0 |
| `bun run build` | exit 0 |
| Dependency-boundary check (`check_boundaries.py`) | PASS. It found one violation introduced during this work (`src/lib/topics.ts` importing a server-function module); fixed by moving the helper to `src/hooks/topic-data.ts` |
| Architecture validator | 0 errors, 21 warnings (files over 300 lines, mostly tests; `performance.ts` is 369) |
| `scan_repo.py` | no markers, no skipped tests, every area has tests |
| Security scanner (`scan.js src`) | 31 findings (19 critical, 12 high), the same count as before this pass. They are heuristic matches (words such as "generate" in code that makes no model call, test fixtures named `session`, the report-only CSP's `unsafe-inline` (`src/server/http/security-headers.ts`, ADR-0010), the one `dangerouslySetInnerHTML` in the chart component). The only file that really calls a model from the browser side is `lib/ask-ai.ts`, which calls the authenticated `ask-ai` Edge Function |
| Client bundle (`.output/public`) | contains none of: `service_role`, `SERVICE_ROLE`, `PAYSTACK_SECRET`, `LOVABLE_API_KEY`, the gateway address, `sk_live` |
| Local dev server, request smoke | `/`, `/today`, `/plan`, `/mastery`, `/analysis`, `/achievements`, `/topics`, `/history`, `/profile`, `/dashboard`, `/admin?tab=bank`: 200 with the right page title and a "Loading…" body (signed out); `/progress`: 307 to `/today`; an unknown path: 404 |

Tests whose first run was already green: the new view helpers (`history-view`, `profile-view`, `plan-view`,
`strongestAndWeakest`) and the new PGlite test files were written together with, or straight after, the code
they check, so there is no recorded red run for them. The session-history service and repository tests, the
history schema test and the navigation tests were run red first.

## 1. Backend status

### Migrations (all unapplied)

| Migration | What it does | Reviewed for | Covered by |
|---|---|---|---|
| `20261009100000_rate_limits_and_ai_access.sql` (edited in place) | rate-limit counters; SQL gate for AI help; `get_explainable_*` now also return `rationale` | RLS and grants on new objects, `SECURITY DEFINER` functions with fixed `search_path`, service-role-only execute | `rate-limit-and-ai-access.test.ts`, `rollback.test.ts`, contract test |
| `20261009100600_ai_insights.sql` | `ai_insights` (one row per student and kind), `readiness_snapshots`, `record_readiness_snapshot` | RLS on, no client grant, check constraints, advisory lock against concurrent inserts, trimming to 30, cascade on account deletion | `ai-insights.test.ts` (11) |
| `20261009100700_selection_reasons.sql` | `exam_answers.selection_reason`, `record_selection_reasons` | ownership check inside the function, idempotent, service-role-only | `selection-reasons.test.ts` (8) |

- **Order.** File names are 14-digit timestamps, unique, and sort into the order they run (`schema-hygiene.test.ts`). The three above come last; the whole chain of 40 replays cleanly on PGlite.
- **Rollback.** `supabase/rollback/20261006_milestones_1_to_3_rollback.sql` drops the new tables, functions and the column; `rollback.test.ts` passes.
- **Risk to check before applying: the in-place edit.** `…100000` was edited after it was written, on the understanding that it had never been applied. If it was ever run against any database (for example by Lovable Cloud), that database does not have the `rationale` column in the two `get_explainable_*` functions and re-running will not add it. Look in `supabase_migrations.schema_migrations` for `20261009100000` first; if it is there, move that change into a new migration.
- **Whole-schema checks added** (`schema-hygiene.test.ts`): every public table has row-level security on; the only policy open to a visitor who is not signed in is the price list (`plans`); the only function such a visitor may execute is the `updated_at` trigger helper. Note that Supabase's default privileges still grant table privileges to `anon`; row-level security is what blocks them. A hardening migration revoking them explicitly would add a second lock; it was not written because it changes the security posture and was not asked for.

### Types

`src/integrations/supabase/types.ts` is **still hand-extended**; it could not be regenerated because that needs the
Supabase CLI and a database with the migrations applied. To replace regeneration as a safety net, a new test
(`backend-contract.test.ts`) replays all migrations and checks the file against the real schema: it lists every
public table with exactly its columns, every function with matching argument names, and every `.from()` and
`.rpc()` call in the application against that schema (table exists, function exists, argument names valid,
required arguments supplied). It found one stale entry (`get_subadmin_user_directory`), now removed. Regenerate
after applying the migrations; any difference is a finding.

### Edge Functions

`ai-insight` (new) and `ask-ai` (extended) were reviewed again for configuration, authentication, grounding,
limits and failure handling; nothing changed in this pass. Facts: `ai-insight` accepts only the service-role
key (constant-time compare, before the body is read), has no CORS headers, validates a strict request, caps
output at 600 tokens and 20 seconds, and has a function-wide budget of 1,000 an hour; the Worker validates the
reply and checks that every number and topic comes from the measured facts before it is stored or shown, and
falls back to a computed summary on any failure; students are limited to 3 a minute and 40 a day. `ask-ai`
answers only for finished tests (SQL-enforced), rejects links, bounds follow-ups, and keeps its origin
allow-list. New in this pass: tests that the `deno.json` dependency versions of both functions equal the
versions installed for Node, so what is tested is what is deployed. **Neither function has been deployed or
called for real**; the model's real output has never been checked against the grounding rules.

### Authorization of the direct browser calls

Five browser files still call the database themselves (list in
[FEATURE_INVENTORY.md](../FEATURE_INVENTORY.md)). `src/lib/route-access.test.ts` now fails if a sixth appears or
a listed one touches another table. `src/server/testing/direct-browser-access.test.ts` (14 tests, real
migrations) attacks them: a student cannot give or take a role, cannot change a plan's price, cannot write a
payment, cannot change their own tier or usage, cannot change or read another student's profile or payments;
an ordinary admin cannot give a role or change a price; the central admin can. All held. Weaknesses that remain:
role assignment and tier assignment from the browser leave no audit trail, and the policy named "anyone reads
active plans" returns inactive plans too (`USING (true)`; the screen filters). Neither is exploitable for gain.

### New server function

`listExamHistory` (sessions domain): authenticated, strict schema (a user id or any other field is rejected),
repository query filtered by `user_id` and `status = 'completed'`, the verified average computed on the server.
Tests: service (3), repository (2), schema (2). Documented in `docs/api/sessions.md`.

## 2. Problems found and fixed in this pass

| # | Problem | Fix |
|---|---|---|
| 1 | The dashboard averaged scores and ranked strong and weak topics in React from raw rows | Uses `listExamHistory` (server average over verified scores) and `getTopicMastery` (server levels); wording helper `strongestAndWeakest` |
| 2 | Topic lists paged through every question row from the browser | `getTopicCounts` (one grouped query) through `hooks/topic-data.ts`. For admins this now counts active questions only, so a topic whose questions are all retired no longer appears in the add-question topic list |
| 3 | The upgrade page said paid plans give "Full AI explanations" (no tier gating exists) and typed the limits in again | Limits read from `lib/exam-rules` (`planPerks`); the AI claim is gone |
| 4 | The landing page claimed an "80% completion guard" (a screen rule only), a "weekly Top 10" (students see the daily board), Opay payment (it is Paystack) and a named model | Copy corrected |
| 5 | The leaderboard page's description promised weekly rankings | Corrected to today's rankings |
| 6 | A dead `TIER_LIMIT` table in `use-auth.tsx` whose numbers contradicted the real rules | Removed; `TIER_LABEL` moved beside the other tier rules |
| 7 | A signed-out visitor to a test in progress stayed on "Loading…", and on results saw a raw error | Both redirect to sign-in |
| 8 | Navigation: seven buttons, three features hidden as tabs of `/progress`, a second Leaderboard button on phones, no Study Plan, History, Topics or Profile pages, admin tabs not linkable | One navigation list, grouped menus, a mobile sheet, separate pages, `/admin?tab=…`; see [ROUTE_MAP.md](../ROUTE_MAP.md) |
| 9 | The first draft of the notifications button said "reminders"; the code only ever notifies about friend requests and challenges | Wording corrected |
| 10 | The inventory work showed that `ui-coverage.test.ts` still listed `getTopicCounts` as unused | Removed from the API-only list |

## 3. Blockers (cannot be done here)

| Blocker | What the owner does | Where |
|---|---|---|
| No Supabase CLI, database or credentials in this environment | Apply the three migrations in file order; confirm `…100000` was never applied first | `docs/deployment.md` §1 |
| Types cannot be regenerated | After applying, regenerate `types.ts`, then run the four checks | §4 |
| `ai-insight` and the updated `ask-ai` cannot be deployed or called | Deploy both; no new secret is needed | §3b |
| Real model behaviour is unknown | Run smoke steps 12–16; watch the `ai-insight discarded` log lines for a week and tune the prompt (bump `promptVersion` in both places) | §6 |
| Paystack checkout needs keys | `VITE_PAYSTACK_PUBLIC_KEY` (browser) and `PAYSTACK_SECRET_KEY` (Worker) | §5 |
| No browser or end-to-end test tooling in the project | Run steps 17–18 of the smoke test by hand | §6 |

## 4. Remaining risks and open items

1. Nothing has been seen in a browser: layout, the mobile sheet, focus handling in the new menus and every loading, empty and error state are verified only through code and pure-helper tests.
2. Five browser files talk to the database directly (inventory); moving the central-admin ones to server functions would add audit trails and shrink the surface.
3. The "80% answered or 80% of the time" submit unlock is a screen rule the server does not enforce.
4. The Mistake Bank has no AI help button (its items do not carry the exam id).
5. Names, username and exam preference cannot be edited after onboarding.
6. Five server functions have no screen (reasons in `ui-coverage.test.ts`).
7. `performance.ts` is over the 300-line guideline; 9 lint warnings pre-date this work.
8. The security scanner's 31 heuristic findings are unchanged and unreviewed line by line beyond what is noted above.
