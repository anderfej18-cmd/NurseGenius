# Fix pass, 2026-10-09

Scope: the findings of the implementation audit of Milestones 1–3. Nothing here was run against a live
database or deployed function; see "What was not verified". Deployment steps: `docs/deployment.md`.

## Findings, causes and fixes

| Id | Finding | Root cause | Fix | Evidence |
|---|---|---|---|---|
| S1 | `ask-ai` open to any origin, trusted a client-sent answer, no limit | Edge Function written before the server-side scoring model; authorised by request content | IDs only; question and key read in SQL; CORS allowlist (`ALLOWED_ORIGINS`), token cap, timeout, rate limit; pure `policy.ts`/`handler.ts` (ADR-0006) | 58 Vitest tests under `supabase/functions/ask-ai`, 13 DB tests |
| S2 | Shared-test endpoints: unvalidated input, DB text leaked, service role, no limit | Pre-layering code with its own copy of checks | Rewritten as `custom-tests/` domain (zod, typed errors, service-role RPCs, rate limit) (ADR-0009) | 46 unit tests, 11 DB tests |
| S3 | Leaderboard and sub-admin directory unreachable from the browser | Earlier migration revoked the RPCs; pages still called them | Server functions over service-role-only RPCs; fitness test blocks browser calls to revoked RPCs (ADR-0008) | `browser-rpc-grants.test.ts`, `admin-access-and-directories.test.ts` |
| S4 | Any admin could grant paid tiers | `is_any_admin` used where central admin was meant | `assign_user_tier`/`approve_receipt` central-admin only | DB tests |
| S5 | No security headers | Never added | Enforced `frame-ancestors`; CSP Report-Only (ADR-0010). **Not an XSS defence until enforced** | 8 tests |
| L1 | `.env` tracked | Hosting platform manages it | Kept; holds public settings only; test fails if a secret appears | `env-files.test.ts` |
| L2 | Payment verification weaknesses | Amount/plan/account not all checked server-side; replay | Provider seam, kobo comparison, account/email/currency/plan checks, reference replay refused by the database, rate limit | 37 tests |
| L3 | Tier limits checked outside the lock | Service read the profile, then called the RPC | Limits enforced in `start_exam_session` under the row lock; shared by practice, daily and friend challenge; SQL caps tied to TS constants by a test (migration `…100500`) | `quota-enforcement.test.ts` (7), seen red then green |
| L4 | Legacy scores/flags written by the browser were trusted | Pre-engine data | `exams.score_verified`: set by trigger on server completion; backfilled only when stored score and every flag match the key; leaderboards and dashboard average count verified only; nothing deleted or rewritten (migration `…100400`) | `score-integrity.test.ts` (8), seen red then green |
| L5 | No rate limiting | None existed | Postgres fixed-window limiter on `ask-ai`, shared tests, payments (ADR-0007) | DB and unit tests |
| L6 | Spaced-review atomicity | Suspected | Shown self-healing by test (`review_stale` generated column); no code change | `hints-and-review-consistency.test.ts` |
| — | `hints_used` missing | Not built | Column and `hintUsed` event on `saveExamAnswer` (database increments, ceiling 10). No screen shows hints | tests |
| — | Confidence, adaptive/mistakes/due selection, mode rules, admin UI, student screens unreachable | Built server-side but not wired | Wired into existing screens; `src/lib/session-modes.ts` is the single rule table | `ui-coverage.test.ts` (63), `session-modes.test.ts` |
| S8 | Generated types out of date | Cannot regenerate without the live project | `types.ts` hand-extended (including `score_verified`) | Typecheck only |

## Files and migrations

Migrations: `20261009100000_rate_limits_and_ai_access`, `…100100_admin_access_and_directories`,
`…100200_custom_tests_service_rpcs`, `…100300_hints_used`, `…100400_score_integrity`,
`…100500_quota_enforcement`. Each has an entry at the top of
`supabase/rollback/20261006_milestones_1_to_3_rollback.sql`; `rollback.test.ts` proves the schema returns to
its pre-milestone fingerprint. New or changed code is listed by domain in `docs/ARCHITECTURE.md` (Domains)
and `docs/api/`. ADRs 0006–0010. CI: `.github/workflows/ci.yml` (test, lint, typecheck, build; no secrets).

## Verification results (this run)

| Command | Result |
|---|---|
| `bun run test` | exit 0: 126 files, 1,689 tests passed, 0 failed |
| `bun run lint` | exit 0: 0 errors, 11 warnings (pre-existing `react-hooks/exhaustive-deps` style) |
| `bun run typecheck` | exit 0 |
| `bun run build` | exit 0 |
| `check_boundaries.py` | PASS: every dependency points inward |
| `scan_repo.py` | no TODO/FIXME markers; every area has tests |
| `architecture_validator.py` | 0 errors, 14 warnings (test files over 300 lines) |
| `scan.js` (security) | 24 findings, all triaged below |
| Client bundle grep | no service-role, Paystack-secret or `LOVABLE_API_KEY` names; none of the revoked RPC names; `correct_answer` appears only as a field name in admin, results and mistake screens that receive it after completion |

Triage of `scan.js`: the 13 "LLM call without authentication" findings match the words "completion" and
"session" in unrelated files, and `src/lib/ask-ai.ts` is a browser wrapper whose function checks the caller
(ADR-0006); the "express-session" findings are the same word match; `chart.tsx` is the shadcn chart style
injection of static configuration (pre-existing); the CSP `unsafe-inline` note is the known limit of
Report-Only mode; the ImageMagick and `max_tokens` hits are matches in tests.

## What was not verified

- **No live database or deployed function was used.** All SQL was replayed on PGlite only. PostgREST,
  Supabase Auth, real roles, the Edge runtime, `verify_jwt` and the Paystack API were not exercised.
- Server functions were not exercised end to end from a browser.
- The CSP has not been tested in a browser against the real pages.

## Remaining blockers and exact steps

1. Apply migrations 1–18 in order (`docs/deployment.md`), then run the unverified-exams query.
2. Set `ALLOWED_ORIGINS`, deploy `ask-ai`, confirm `verify_jwt`.
3. Regenerate `types.ts` and rerun the four checks.
4. Run the smoke test in `docs/deployment.md`.
5. Watch CSP reports, then enforce the policy.

## Unresolved issues and decisions needed

- Legacy exams that fail verification stay unverified; the owner must decide whether to leave or review them.
- Per-answer feedback ("practice" mode) is a product decision and is not built; every mode reveals answers on completion.
- Hints have a recording API but no screen.
- Admin plan/role screens still write from the browser, protected by RLS (reviewed, not moved).
- The SQL tier caps duplicate the TypeScript constants; the parity test catches drift but does not remove it.
- Test files over 300 lines remain (14 architecture warnings).
- No end-to-end (browser) tests exist.
