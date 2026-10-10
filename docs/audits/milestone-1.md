# Milestone 1 audit: secure core loop

> The lint and typecheck failures recorded below were fixed during Milestone 2 (lint 0 errors, typecheck clean). Current results are in [milestone-2.md](milestone-2.md).

Scope: make it impossible for a normal browser client to forge scores, read answer keys, upgrade
tiers, bypass exam limits, or touch another student's exam. No AI, no new content, no visual changes.

## Checklist

- [x] Milestone 0: separation, tooling, errors/config, architecture doc
- [x] Step 1 security migration (profiles, questions, exams, answers)
- [x] Step 2 question catalog (filters, keyset pagination, topic counts)
- [x] Step 3 session engine (start, get, save answer, submit, results)
- [x] Step 4 attempt behaviour + `user_question_stats` (+ backfill)
- [x] Step 5 mistake bank
- [x] Step 6 bookmarks
- [x] Step 7 question reports
- [x] Step 8 frontend rewiring (4 files)
- [ ] **Not applied**: migrations have not been run on Lovable Cloud (see "Unresolved")

## What changed

**Migrations (3 files, `supabase/migrations/20261006200*`)**: column privileges on `profiles` and
`questions`; select-only policies and revoked writes on `exams`/`exam_answers`; session, attempt and
question metadata columns; `subtopics`, `user_question_stats`, `bookmarks`, `question_reports`;
partial unique index (one active session); `start_exam_session`, `save_exam_answer`,
`submit_exam_session`, `get_question_topic_counts`; indexes for every new access path.

**Server**: 16 server functions in 5 domains (`docs/api/`), services/repositories/controllers under `src/server/`.

**Frontend** (only what the lockdown broke): `exam.start.tsx`, `exam.$examId.index.tsx`,
`exam.$examId.results.tsx`, `admin.tsx` (three answer-key reads), plus `use-auth.tsx` re-exporting the tier
limits from the shared `src/lib/exam-rules.ts`. No markup or styling changed.

## Verification matrix (the requested checks)

| Requirement | How it is enforced | Evidence |
|---|---|---|
| Score cannot be forged / written by a student | `INSERT/UPDATE/DELETE` revoked on `exams`, `exam_answers`; score computed in `finalize_exam` from the key; request schemas are strict | `security-lockdown.test.ts` (writes → `permission denied`), `sessions.schemas.test.ts` (forged `is_correct`, `score_pct`… rejected), `exam-engine.test.ts` (server scoring) |
| Answer keys not exposed | `SELECT` on `correct_answer`, `rationale` revoked for client roles; explicit safe column lists; DTOs built field by field | `security-lockdown.test.ts` (`SELECT correct_answer/rationale/*` denied), `session.service.test.ts` / `catalog.service.test.ts` (serialised output contains no key), repository tests (selects contain no key columns) |
| Rationale not exposed before completion | Only `results()` and the mistake bank return it; `results()` refuses an in-progress session | `session.service.test.ts` (409 while running), `mistake.service.test.ts` (withheld for the running exam) |
| Tier cannot be self-upgraded; expiry / counters cannot be changed | `profiles` update limited to six onboarding columns | `security-lockdown.test.ts` (`tier`, `expiry_date`, `questions_today`, `last_question_date` → denied) |
| Daily and per-session limits cannot be bypassed | Enforced in `SessionService.start` on server data; the counter is written only by `start_exam_session`; students cannot edit it | `session.service.test.ts` (caps, expired tier, new day, scholar) + the privilege tests above |
| No access to another student's session | Every repository query filters by the token's user id; SQL functions take `_user_id` | `session.repository.test.ts`, `exam-engine.test.ts` (other student → `not_found` / `exam_not_found`), RLS select tests |
| No submit of another student's exam | `submit_exam_session(_user_id, _exam_id)` locks `WHERE user_id = _user_id` | `exam-engine.test.ts` ("refuses to submit another student's session") |
| Expired exams reject answers; completed exams cannot change | `save_exam_answer` checks status and deadline (+10 s grace) under `FOR SHARE` | `exam-engine.test.ts` (closed after grace, closed after submit) |
| Duplicate submission does not duplicate statistics | `finalize_exam` returns the stored result when already completed | `exam-engine.test.ts` ("is idempotent…", attempts stay 1) |
| One active session | Partial unique index + serialised start | `exam-engine.test.ts`, `legacy-backfill.test.ts` |
| Functions not callable by students | `EXECUTE` revoked from `anon`/`authenticated` | `exam-engine.test.ts` ("privileges") |
| Statistics and bookmarks/reports isolated | RLS select-own; no client writes | `exam-engine.test.ts`, `bookmarks-reports.test.ts` |

Manual checks from the security skill (grep): no `process.env` in new code outside `config.server.ts`,
no hard-coded secrets, no string-built queries or filters, no mass assignment, no `any`, no
`console` outside the error/config modules. All 16 functions use `requireSupabaseAuth` and take the user id only from it.

## Results (actual runs)

| Command | Result |
|---|---|
| `bun run test` | see "Final results" at the end of this document |
| `bun run typecheck` | **1 error**, `src/routes/__root.tsx:61` (error-component prop type). Not caused by this milestone; the file is untouched. |
| `bun run lint` | **Fails: 1,806 errors, 13 warnings** (baseline before this work 1,635 / 15). The 8 non-formatting errors and nearly all formatting errors are in files that were already unformatted. The increase is generated `types.ts`, which was already unformatted and now has more lines. The 64 files created in this milestone and `eslint.config.js` lint clean. |
| `bun run build` | **Pass**. The browser bundle contains no service-role code, no engine function names and no secrets (grep of `.output/public`). |

## Dev-skills audit (second pass)

After the first pass I checked how much of `Dev skills/` I had actually used and found I had read
about half. I then read the remainder that applies, ran the scanners the skills ship, and fixed what
they and the review checklist exposed.

| Skill material | First pass | Second pass |
|---|---|---|
| `nodejs-security-audit` (`scan.js`) | not run | run on `src/server` + `src/functions`: 0 critical, 0 real high. The 5 "high" findings are false positives (the pattern reads `session(` as `express-session`); the 3 header findings are about the Worker as a whole, not this code. |
| `clean-code` `check_boundaries.py` | not run | run against the declared layering `shared → service → repository → controller → function`: **PASS, every dependency points inward** (29 imports into generated Supabase files sit outside any layer). |
| `clean-code` `scan_repo.py` | not run | no sibling variants, junk drawers, debug output, skipped tests or TODOs. |
| `clean-code` review checklist (A1–A10, risk levels) | not read | applied; findings below. |
| `backend-architecture` (boundaries, repositories, types) | outline only | read; findings below. |
| `/security-review` | not run | run; no finding at confidence 8 or above (report in the session). |
| `express-web-security-spec` | not read | skimmed by topic; the Express-specific rules (cookies, CSRF, sessions, helmet) do not apply to a bearer-token server-function API. |

Findings and fixes:

1. **Stack traces reached the browser (security, fixed).** TanStack serialises thrown errors to the client with their stack, so `guard()` did not satisfy "never leak stack traces". `AppError` now carries no stack; checked with the framework's own serializer; test added. Validation failures leaked a zod stack the same way, so `validated()` (src/functions/validated.ts) turns them into a typed `ValidationError`.
2. **Documented behaviour I had not verified (fixed).** `docs/api` described HTTP statuses 400/404/409/429. The transport always answers 500; the typed `code` and `statusCode` travel on the error. Docs corrected.
3. **Casts instead of parsing at the repository boundary (fixed).** The architecture guide says to parse rows where the data enters. Catalog rows, the submit result, report reasons/status and confidence are now parsed with zod; the `as unknown as` casts are gone. This also strips any column a query returns by accident.
4. **Missing rollback note for a HIGH-risk change (fixed).** `supabase/rollback/20261006_milestones_1_to_3_rollback.sql`, with a test that rebuilds the schema and checks it matches the pre-milestone schema exactly (it caught that my first draft forgot the `anon` privileges). It re-opens the old holes by design and says so; some changes cannot be undone (see its header).
5. **Duplicated paging policy (fixed, A5).** Three services each had their own copy; now `src/server/pagination.ts`, tested once.
6. **Not changed, recorded:** `assertAdmin` exists twice (mine, and a private one inside the moved `custom-tests.functions.ts`); folding the legacy copy in would change unrelated code (A4). `SessionRepository`/`CatalogRepository` have one production implementation each; they stay because services are tested with fakes, as the backend skill requires.
7. **Skill rules I could not follow as written because they target Express:** `BaseController`, `asyncErrorWrapper`, Sentry, `unifiedConfig` from `config.ini`, pino request ids, Redis rate limiting. The routers say project conventions win. The equivalents here are `guard()`, `config.server.ts` and `console.error` in `toAppError`.

## Deliberate decisions and deviations

- **Server functions, not REST routes**, per the project's `AGENTS.md` and the single-client decision.
- **No per-answer correctness reveal** in practice modes and **no `hints_used` column**: the app has neither feature, so adding them would be speculative. `session_type` is stored so they can be added.
- **`confidence` is stored but nothing sends it yet**: the UI has no confidence control and visuals were out of scope. The endpoint and column are ready.
- **Offset pagination for per-student lists** (bounded by one student's activity, capped at 10,000); **keyset** for the shared question bank.
- **The 80% "submit unlocks" rule is still UI-only.** Enforcing it would add behaviour, and bypassing it gains nothing (an early submit only lowers the student's own score).
- **Legacy data**: correctness for statistics is recomputed from the key; old `is_correct` values and stored scores are left untouched, so historic scores and leaderboard entries written by the old client are **not verified**. Abandoned in-progress sessions are finalised at their deadline so the one-active-session index can exist.
- **`types.ts` was extended by hand** (generated file). Regenerate it after the migrations are applied and review the diff.
- **TDD note:** for the bookmark service the tests were written in the same step as the implementation and I did not watch them fail first; every other module was run red before implementation.
- **Rate limiting** is by business rule (one active session, daily caps, report/bookmark caps). There is no per-IP limiter; that needs a platform component.

## Rollback

`supabase/rollback/20261006_milestones_1_to_3_rollback.sql` (not in `migrations/`, never auto-applied). Order: deploy the pre-milestone frontend, then run the script. It restores the previous policies and privileges (and with them the old vulnerabilities). Irreversible: rows in `user_question_stats`, `bookmarks`, `question_reports` and the new columns are dropped; legacy abandoned sessions finalised by the migration stay completed. Verified by `src/server/testing/rollback.test.ts`.

## Unresolved / not verified

1. **Migrations are not applied.** Nothing in this milestone has run against the real Supabase project. They run cleanly on PGlite; the first apply on Lovable Cloud is the real test. After applying: regenerate types, then smoke-test start → answer → submit, a direct `supabase.from("exams").update(...)` from the console (must fail), and a self-update of `profiles.tier` (must fail).
2. **Server functions were not exercised end-to-end** (browser → TanStack runtime → live Supabase). They are covered by unit, schema and database-level tests only.
3. **Existing quirks left alone** (outside this milestone): `assign_user_tier` and `approve_receipt` are guarded by `is_any_admin`, i.e. any admin (its comment says central admin only); the `ask-ai` edge function trusts the correct answer sent by the client and has no rate limit; `.env` is tracked in git; repository-wide lint and one typecheck error predate this work.

> **Superseded by the fix pass (2026-10-09), `docs/audits/fix-pass.md`:** the `ask-ai` trust and rate-limit gaps are fixed, `assign_user_tier` and `approve_receipt` are now central-admin only (ADR-0008), `.env` is guarded by a test (ADR-0010), and question retirement has an admin screen.
4. **Question deletion** by admins is blocked by the foreign key from `exam_answers` once a question has been answered; retiring (`status = 'retired'`) is the safe path and is supported by the schema, but no admin UI for it exists yet (Milestone 3).
5. **Dependencies added**: `vitest`, `@electric-sql/pglite` (dev only).

## Final results (after the second pass; actual runs)

| Command | Result |
|---|---|
| `bun run test` | **244 passed, 25 files, 0 failed** |
| `bun run typecheck` | **1 error**, `src/routes/__root.tsx:61` (existing, file untouched) |
| `bun run lint` | **Fails: 1,806 errors, 13 warnings** (baseline 1,635 / 15); 8 non-formatting errors, all existing. The 70 files created in this milestone lint clean. |
| `bun run build` | **Pass**; browser bundle has no service-role code, engine function names or secrets |
| `check_boundaries.py` (declared layering) | **Pass** |
| `/security-review` | no finding at confidence 8 or above |
