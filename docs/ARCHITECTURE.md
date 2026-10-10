# NurseGenius Architecture

NurseGenius is one TanStack Start application deployed as one Cloudflare Worker, backed by Supabase
(Postgres, Auth, one Edge Function). The frontend and backend are separated by **folder and import
rules**, not by package or deployment.

```
Frontend (React routes, components, hooks)
        ↓  createServerFn RPC (typed, bearer token attached by auth-attacher)
Server Functions   src/functions/*.functions.ts   (client-safe RPC boundary)
        ↓  one dynamic import per handler
Controllers        src/server/<domain>/*.controller.server.ts   (compose + map errors)
        ↓
Services           src/server/<domain>/*.service.ts
        ↓
Repositories       src/server/<domain>/*.repository.server.ts
        ↓
Supabase (Postgres + RLS + app_private RPCs)
```

## Layer responsibilities

| Layer | Owns | Must not |
|---|---|---|
| **Frontend** `src/routes`, `src/components`, `src/hooks`, `src/lib` (browser helpers) | Rendering, local UI state, calling server functions. | Compute scores, correctness, XP, mastery or tier. Select `correct_answer`/`rationale`. Import server code other than `*.functions` modules (enforced by ESLint). |
| **Server function** `src/functions/*.functions.ts` | The trust boundary: authentication (`requireSupabaseAuth`), input schema (zod), calling one service method, mapping errors with `toAppError`. Client-safe module: the client build imports it, so it must not statically import anything under `src/server/` or `*.server.ts`; load services, repositories and `errors.ts` with dynamic `import()` inside the handler (see `AGENTS.md`). | Business rules. Raw queries. Reading `process.env`. |
| **Controller** `src/server/<domain>/*.controller.server.ts` | Wires a service to its repository (service-role client), runs it inside `guard()` so every failure becomes a safe `AppError`, performs the admin check for admin operations. | Business rules. |
| **Service** `src/server/<domain>/*.service.ts` | Business rules and calculations. Receives its repository (and a clock) through its constructor. Throws `AppError` subclasses. | Import Supabase, HTTP or TanStack types. Read the environment. |
| **Repository** `src/server/<domain>/*.repository.server.ts` | All database access: explicit `select` column lists, ownership in every `WHERE`, batching instead of per-row queries, calling `app_private` RPCs for multi-write operations. Returns plain objects. | Business decisions. |
| **Database** `supabase/migrations` | Constraints, indexes, RLS, column privileges, transactional RPCs. Final defence: clients hold no write grants on scoring data. | Be the only place a rule lives for something the app must explain to the user. |

Why `src/functions/` is outside `src/server/`: TanStack Start's import protection denies every `**/server/**`
path in the client build, and the client must import `*.functions.ts`. `src/server/` is therefore strictly
backend-only; ESLint forbids frontend code from importing `@/server/**`.

The coarse layering above is checked by `check_boundaries.py` (clean-code skill). Finer rules inside
`src/server/` (engines and services import no Supabase or framework code, no clock or randomness; function
modules load server code only dynamically and are all authenticated except the shared-test links) are
enforced by `src/server/intelligence/architecture.test.ts`, which runs with the unit tests.

```clean-architecture
layer shared    = src/lib/**, src/integrations/**
layer backend   = src/server/**
# API routes are server entry points even though the router keeps them under routes/.
layer functions = src/functions/**, src/routes/api/**
layer frontend  = src/routes/**, src/components/**, src/hooks/**

# The browser may call server functions, never server code (also enforced by ESLint and the bundler).
deny frontend -> backend

# Imports are placed by file path; this token keeps npm paths such as `@tanstack/react-start/server`
# (a package, not our code) from being mistaken for the backend layer.
namespace backend = our-backend-layer
```

Other server areas:

- `src/server/errors.ts`: `AppError` hierarchy; `toAppError` turns unexpected errors into a generic message and logs the original server-side.
- `src/server/config.server.ts`: the only place **new** server code reads environment variables (typed, fail-fast, lazy, values never logged).
- `src/server/ssr/`: Worker error capture and branded error page used by `src/server.ts` and `src/start.ts`.
- `src/server/payments/paystack-verify.server.ts`: Paystack verification; `src/routes/api/public/paystack-verify.ts` is a thin wrapper (the route file path is fixed by the router).

## Domains

| Domain | Functions (`src/functions/`) | Server code (`src/server/`) | Database |
|---|---|---|---|
| Sessions (exam engine) | `sessions.functions.ts` | `sessions/` | `exams`, `exam_answers`, `user_question_stats`, `start_exam_session`, `save_exam_answer`, `submit_exam_session` |
| Question catalog | `questions.functions.ts` | `questions/` | `questions` (+ metadata), `subtopics`, `get_question_topic_counts` |
| Mistake bank | `mistakes.functions.ts` | `mistakes/` | `user_question_stats` |
| Bookmarks | `bookmarks.functions.ts` | `bookmarks/` | `bookmarks` |
| Question reports | `reports.functions.ts` | `reports/` | `question_reports` |
| Content management (admin) | `questions.functions.ts` (`admin*`) | `questions/question-admin.*` | `questions` and `subtopics` writes (service role only) |
| Learning intelligence | `intelligence.functions.ts` | `intelligence/` | `get_student_attempts`, `get_question_difficulty_stats`, `apply_review_states`, review columns on `user_question_stats` |
| Engagement (streaks, XP, achievements, daily challenge, study plan) | `engagement.functions.ts` | `engagement/` | `xp_events`, `user_achievements`, `daily_challenges`, `study_plans`, study-day functions |
| Competition (friends, friend challenges) | `competition.functions.ts` | `competition/` | `friendships`, `friend_challenges` and their functions |
| Leaderboards | `leaderboard.functions.ts` | `leaderboard/` | `get_daily_leaderboard`, `get_weekly_leaderboard` (service role only; verified exams only) |
| User directory (sub-admin, read-only) | `user-directory.functions.ts` | `user-directory/` | `list_user_directory`, `count_users_by_tier` |
| Shared tests (custom tests) | `custom-tests.functions.ts` | `custom-tests/` | `custom_tests`, `custom_test_questions`, `create_custom_test`, `submit_shared_attempt`, `import_custom_test_to_bank` |
| Payments | API route `/api/public/paystack-verify` | `payments/` | `activate_verified_subscription` (service role only), Paystack verification |
| Rate limiting (shared) | used by the other domains | `rate-limit/` | `consume_rate_limit` (fixed-window counter in Postgres, ADR-0007) |
| AI explanations | `ai-insights.functions.ts` | `ai-insights/` | `ai_insights`, `readiness_snapshots`, `record_readiness_snapshot`; Edge Function `ai-insight` (ADR-0011) |
| Performance analysis | `intelligence.functions.ts` (`getPerformanceAnalysis`) | `intelligence/performance/` | reads attempts only |
| Notifications | `notifications.functions.ts` | `notifications/` | `notification_outbox`, `notifications`, claim/list/mark functions, triggers on `friendships` and `friend_challenges` |

Shared, client-safe rules live in `src/lib/` (`exam-rules.ts`: tier names and limits, exam bounds and the
history size; `report-reasons.ts`) so the browser and the server use the same numbers. Anything shown as a
limit, an average or a level comes from one of these or from a server function; screens do not recompute it
(`strongestAndWeakest`, `planPerks` and the history wording only read what the server decided).

## Navigation

`src/lib/navigation.ts` is the only list of navigation buttons: groups (Learn, Review, Insights, Community,
Account, Admin), each button's label, destination, the admin tab it opens, and who may see it
(`navigationFor(viewer)`, `adminTabsFor`, `resolveAdminTab`). `AppHeader` builds the desktop menus and the
mobile sheet from it, and `/admin` builds its tabs from it, so a button, its page and its permission cannot
drift. `src/lib/navigation.test.ts` checks that every button leads to a route file that exists, that no two
buttons share a destination or a label, that every standalone page has a button (or a listed reason), and who
sees what; `src/lib/route-access.test.ts` checks that every page is public or guarded, and lists the few
files allowed to call the database directly. The page-by-page map is [ROUTE_MAP.md](ROUTE_MAP.md); the
feature-by-feature one is [FEATURE_INVENTORY.md](FEATURE_INVENTORY.md). Showing or hiding a button never
replaces a server check.

Adding a domain: write the service test first with a fake repository → service → repository (with a
`createFakeSupabase` test asserting the ownership filter) → controller → zod schemas (+ test that
forged fields are rejected) → `*.functions.ts` (auth middleware, one dynamic import) → document it in `docs/api/`.

## Security model

- Students hold **no write privileges** on `exams`, `exam_answers`, `user_question_stats`, `bookmarks`,
  `question_reports` or any Milestone 3 table, and may update only their onboarding fields on `profiles`
  (column grants, not just RLS). They cannot read `questions.correct_answer`, `questions.rationale` or
  `created_by`.
- **No client role, admins included, can write `questions` or `subtopics`.** Admins manage content through
  `admin*` server functions that check `is_any_admin`, validate, and retire instead of deleting.
- Writes happen only through service-role code that takes the user id from the verified token, and
  through `SECURITY DEFINER` SQL functions executable by `service_role` only.
- Tier limits are enforced inside `start_exam_session` under the student's row lock, as well as in the service.
- `exams.score_verified` marks scores computed from the answer key by the server; legacy browser-written scores are verified by recomputation or left unverified, and the leaderboards count verified exams only.
- Responses carry security headers (`src/server/http/security-headers.ts`): an enforced `frame-ancestors` and a CSP in Report-Only mode (ADR-0010). The CSP is not an XSS defence until it is enforced.
- AI only phrases measured facts (ADR-0011): the figures come from deterministic code over the student's own answers, the model's text is used only if it fits a schema and rests on those facts, and a computed summary is shown otherwise. The gateway key exists only in the Edge Functions.
- Scores, correctness and statistics are computed in SQL from the answer key at submission, in one
  transaction, and submitting twice is a no-op.

## Testing

`bun run test` runs Vitest. Besides unit tests with fake repositories, `src/server/testing/` replays
every migration on **PGlite** (Postgres compiled to WASM) with small stand-ins for Supabase's roles, `auth`,
`storage` and `pg_cron`, and verifies RLS, column privileges, the SQL functions and the legacy-data
backfill against a real engine. It does not exercise PostgREST or the Supabase platform itself.

## Files that stay where they are

| File | Why |
|---|---|
| `src/integrations/supabase/*` | Lovable-generated ("do not edit"); moving them risks regeneration at the old path. `client.ts`, `auth-attacher.ts`, `previewAuthStorage.ts` are browser; `client.server.ts`, `auth-middleware.ts` are server; `types.ts` is shared. |
| `src/server.ts`, `src/start.ts` | Referenced by `wrangler.jsonc`/`vite.config.ts` and framework convention. |
| `src/routeTree.gen.ts` | Generated by the router plugin. |
| `supabase/` | The Supabase CLI and Lovable Cloud expect it at the root. |

## Environment variables

| Scope | Variables |
|---|---|
| Browser (`VITE_*`) | `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`, `VITE_PAYSTACK_PUBLIC_KEY` |
| Worker (secrets) | `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `PAYSTACK_SECRET_KEY` |
| Edge Function (`ask-ai`) | `LOVABLE_API_KEY`, `ALLOWED_ORIGINS` (comma-separated origins allowed to call it; required) |
| Edge Function (`ai-insight`) | `LOVABLE_API_KEY` (same secret), plus the platform's `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY`; no other variable, and no CORS |

Two Lovable-generated files read `process.env` directly (`client.server.ts`, `auth-middleware.ts`) and `client.ts` falls back to it for SSR; they are not rewritten. All other server code reads settings through `config.server.ts`. The tracked `.env` may hold public settings only; `src/server/env-files.test.ts` fails if a secret appears in it (ADR-0010).

## How the /Dev skills map onto this stack

The Dev skills target Express. Both routers state that project conventions win, so they are applied as
principles on top of TanStack Start:

| Skill rule | NurseGenius application |
|---|---|
| Routes → controllers → services → repositories | Server function plays route + controller; service and repository as above. |
| Validate all external input at the edge | zod schema in every server function's `inputValidator`. Services re-check business invariants. |
| One centralized error handler, typed `AppError` | `src/server/errors.ts`; every handler maps through `toAppError`. |
| Never leak stack traces or DB internals | Unexpected errors become a generic message; originals logged server-side only. |
| Authorization per resource, not just authentication (IDOR) | Every repository query filters by `user_id` (or admin role) in addition to the id. |
| Parameterized queries, select only needed columns, no N+1, paginate everything | supabase-js builder only; explicit column lists; batched `in()` lookups; capped cursor pagination. |
| Transaction when two or more writes must succeed together | supabase-js has no transactions, so each such operation is one `app_private` plpgsql function. |
| One config source, validated at startup | `config.server.ts`. |
| Test first; unit-test services with fake repositories; test unhappy paths | Vitest, co-located `*.test.ts`. |
| Minimalism: reuse, no speculative abstraction | Helpers are added only when two call sites need them. |

Deliberate deviations: no Sentry, pino or Redis (not in the stack; `console.error` in `toAppError`);
rate limiting is a Postgres fixed-window counter (ADR-0007) applied to `ask-ai`, the shared-test endpoints and payment verification; other endpoints rely on the business limits (one active session, daily cap).

## Scripts

| Command | Purpose |
|---|---|
| `bun run test` | Vitest, one run |
| `bun run typecheck` | `tsc --noEmit` |
| `bun run lint` | ESLint |
| `bun run build` | Production build |
