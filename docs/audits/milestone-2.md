# Milestone 2 audit: deterministic intelligence engines

Scope: turn recorded attempts into measurements and advice (mastery, confidence, spaced review, time,
adaptive selection, similar questions, a daily plan, exam readiness) with **no AI, no frontend work, no
invented or seeded data and no placeholder AI strategy**. Every number is a pure function of a
student's attempt history, the clock and a typed configuration (`docs/formulas.md`).

## Checklist

- [x] 1. Mastery (`MasteryService`): formula in `docs/formulas.md` §1; 2 of 2 correct is not mastered
- [x] 2. Confidence analytics: the six cells by student, topic, exam type and period; false- and weak-confidence flags (§2)
- [x] 3. Spaced review: `ReviewScheduler` interface, `Sm2ReviewScheduler`, schedule fields updated on submit (§3)
- [x] 4. Time analytics (§5) and empirical difficulty (§4)
- [x] 5. Adaptive question selection, integrated into `SessionService.start()` (§6)
- [x] 6. Similar questions from metadata only (§7)
- [x] 7. Daily recommendation: `RecommendationService` + `RecommendationStrategy` + `DeterministicRecommendationStrategy` only (§8)
- [x] 8. Exam readiness, labelled an internal preparation metric and not a prediction (§9)
- [x] Docs: `docs/formulas.md` (9 sections), `docs/api/intelligence.md`, `docs/adr/0001-0003`, `docs/ARCHITECTURE.md`
- [ ] **Not applied**: the Milestone 2 migration has not been run on Lovable Cloud (see "Migration status")

## What was built

| Component                 | Where                      | Public surface                                                                                                                   |
| ------------------------- | -------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Learning history (shared) | `src/server/intelligence/` | `LearningHistoryService.load`; attempts recomputed from the answer key by `get_student_attempts`, empirical difficulty filled in |
| Mastery                   | `mastery/`                 | `getTopicMastery`                                                                                                                |
| Confidence analytics      | `confidence/`              | `getConfidenceAnalytics`                                                                                                         |
| Spaced review             | `review/`                  | `listDueReviews`; schedule written when a session is first scored                                                                |
| Time analytics            | `time/`                    | `getTimeAnalytics`                                                                                                               |
| Adaptive selection        | `selection/`               | `startExamSession({ selection: "adaptive" })`                                                                                    |
| Similar questions         | `similar/`                 | `getSimilarQuestions`                                                                                                            |
| Daily recommendation      | `recommendation/`          | `getDailyRecommendation`                                                                                                         |
| Exam readiness            | `readiness/`               | `getExamReadiness`                                                                                                               |

Seven new server functions (23 in total with Milestone 1's 16), all in `src/functions/intelligence.functions.ts`.
Errors use the one existing system (`src/lib/app-errors.ts`, `src/server/errors.ts`); no `any`, no `!` and no
type assertions in production code (checked by grep).

Shared rules extracted once each (clean-code A5): `group-by`, `attempt-order`, `statistics`,
`repeated-mistakes` (mastery and readiness agree on what a repeated mistake is), `exam-urgency` (daily plan
and readiness share the 14/30/60-day levels, `EXAM_URGENCY_DAYS`), `utc-days`, `sessions/quota`.

Only two interfaces exist, because only they have a reason to vary (ADR-0003): `ReviewScheduler` and
`RecommendationStrategy`. There is no AI strategy, fake or otherwise; `architecture.test.ts` fails if a second
`RecommendationStrategy` implementation appears.

## Formulas

All in `docs/formulas.md`, each with weights, thresholds, a worked example and its limits:

1. **Mastery**: weighted accuracy (30-day half-life), recency window, consistency across sessions, difficulty-adjusted accuracy, confidence calibration, minus a repeated-mistake penalty, then shrunk toward 50 by `evidence = n / (n + 10)`. 2/2 gives 58.3; `mastered` needs score ≥ 85 and ≥ 30 attempts.
2. **Confidence**: six cells, `highConfidenceErrorRate`, `lowConfidenceSuccessRate`, false and weak confidence.
3. **SM-2**: grade from correctness and confidence, ease floor 1.3, intervals 1, 6, then `interval × ease`; a miss resets.
4. **Empirical difficulty**: from all students' results on a question, only with 20 or more attempts.
5. **Time**: average, median, min, max, by topic, correct vs incorrect, trend, fast/slow × right/wrong patterns, outliers excluded.
6. **Adaptive selection**: six weighted signals (weak topic .30, due review .20, previous mistake .20, low exposure .10, recent weakness .10, difficulty fit .10), a 60% cap per topic, seeded tie-break so a request is repeatable.
7. **Similar questions**: topic 3, subtopic 2, difficulty 1 or 0.5, tags 0.5 each (max 2), over 7.
8. **Daily plan**: budget from available minutes and the student's own pace, capped by the tier's remaining allowance; blocks for due reviews, mistakes, weak topics, speed; every block carries its reason.
9. **Readiness**: eight weighted components (mastery .25, accuracy .10, recent .15, mock exam .15, consistency .10, speed .05, coverage .10, repeated mistakes .10), missing components dropped and the rest renormalised; no score below 30 attempts; the exam date reports urgency and does not change the score.

## Tests

| Area                                                        | Tests               |
| ----------------------------------------------------------- | ------------------- |
| Mastery                                                     | 29                  |
| Confidence                                                  | 16                  |
| Spaced review (SM-2, due, service, store)                   | 43                  |
| Time analytics                                              | 24                  |
| Adaptive selection                                          | 37                  |
| Similar questions                                           | 31                  |
| Daily recommendation (strategy, service, store)             | 56                  |
| Exam readiness (formula, service, store)                    | 43                  |
| Whole intelligence layer + function schemas                 | 375                 |
| Database (PGlite replaying every migration, incl. rollback) | 60                  |
| **Whole suite**                                             | **655 in 56 files** |

Expected values were worked out by hand from the formulas (the arithmetic is in the test comments), not
copied from program output. Properties covered: determinism and input-order independence, missing-data
renormalisation, 2/2 is not mastered, boundaries (29 vs 30 attempts, exactly 14 days, 19 vs 20 timed
attempts), strict schemas rejecting `userId` and unknown keys, ownership in every query.

Defects found by tests written first (red, then fixed): topic blocks below the 5-question minimum
(`[28, 2]` instead of `[24, 6]`); an even split needed when every topic priority is 0 (`[NaN, NaN]`); a
`mean` fragment and a typo that Prettier had hidden from my own patches. Several of my own expected
values were wrong arithmetic (20 perfect attempts score 83.3, not 85); the tests were corrected, not the
engine.

**Fitness functions** (`src/server/intelligence/architecture.test.ts`, run with the unit tests; each was
shown to fail on a deliberate violation): engines and services import no Supabase, TanStack, `.server` or
testing code; none reads the clock, `Math.random` or `process.env`; the calculation engines contain no
`async`, `await`, `Promise` or `fetch`; the deterministic strategy is the only `RecommendationStrategy`;
function modules load server code only through a dynamic import; every server function is authenticated
except the three shared-test-link functions, listed by name.

## Security review

Method: the `nodejs-security-audit` scanner, the clean-code and architect scanners, the client-bundle grep,
and a manual review of the seven new functions and three new database functions against the skills'
checklists. The built-in `/security-review` command works on a git diff; the clone carries all of this work
uncommitted (nothing has been committed or pushed, as instructed), so I reviewed the files directly instead.

| Check                           | Result                                                                                                                                                                                                                                                                                      |
| ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication                  | All seven functions use `requireSupabaseAuth`; enforced by a test, not by convention.                                                                                                                                                                                                       |
| Identity / IDOR                 | The user id comes only from the verified token. Schemas are `.strict()` (tests reject `userId`, `nextReviewAt`, `questions`). Every repository query names the student; tests assert it.                                                                                                    |
| Database privileges             | `get_student_attempts`, `get_question_difficulty_stats`, `apply_review_states` are `SECURITY DEFINER`, executable by `service_role` only (`EXECUTE` revoked from `PUBLIC`, `anon`, `authenticated`; tested). Their `_user_id` parameter is trusted only because nothing else can call them. |
| Answer-key exposure             | None of the responses contains `correct_answer` or `rationale`; correctness is recomputed from the key inside the database, never read from a stored flag (a forged legacy `is_correct` is ignored; tested).                                                                                |
| Enumeration                     | `getSimilarQuestions` requires the student to have attempted the source question; others get the same 404 as a missing id.                                                                                                                                                                  |
| Input bounds                    | `periodDays` 1–365, `availableMinutes` 10–240, `limit` ≤ 50 (≤ 20 similar), `offset` ≤ 10,000, at most 5,000 attempts analysed per request.                                                                                                                                                 |
| Error leakage                   | Everything runs in `guard()`; unexpected errors become a generic message, no stack or database text reaches the browser.                                                                                                                                                                    |
| Client bundle                   | `.output/public` contains none of: service-role key name, `service_role`, the three new RPC names, `supabaseAdmin`, the scheduler or strategy class names, `assessReadiness`.                                                                                                               |
| Trust in client-reported values | Time spent and confidence are advisory. They can only change the student's **own** analytics, plan and selection; they never affect scoring, tiers, quotas or leaderboards.                                                                                                                 |
| Scanner output                  | `scan.js`: 53 findings, none real: generated `.output/` bundles, the word "session" read as `express-session`, "LLM API" matched in files with no LLM code, the scoped-package/lockfile rules (the lockfile is `bun.lock`), a regex flag read as ImageMagick.                               |

Found but **not** in Milestone 2 code, recorded for the Milestone 3 security audit:

1. `getSharedTest`, `startSharedTest` and `submitSharedTest` (public by design, token as credential) use a bare type-cast `inputValidator` with no runtime validation, and run with the service role. They predate this work.
2. `supabase/functions/ask-ai` answers with `Access-Control-Allow-Origin: *` and trusts the correct answer sent by the client (already listed in the Milestone 1 audit).
3. `.env` is tracked in git. Key names only were inspected; the values need rotating and the file needs untracking by the owner.

> **Superseded by the fix pass (2026-10-09), `docs/audits/fix-pass.md`:** items 1 and 2 are fixed (zod validation and the rewritten `custom-tests/` domain; the hardened `ask-ai`). For item 3, the tracked file holds public settings only and a test guards it (ADR-0010).

## Performance review

| Function                                                        | Database round trips                                                                  | Bound                                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| `getTopicMastery`, `getConfidenceAnalytics`, `getTimeAnalytics` | 1 attempts RPC (+ 1 difficulty-statistics RPC for questions with no admin difficulty) | 5,000 attempts, then O(n log n) in memory                                                                   |
| `getDailyRecommendation`                                        | history (1–2) + due count + unresolved count + profile, run in parallel               | as above                                                                                                    |
| `getExamReadiness`                                              | profile, history (1–2), topic counts, run in parallel                                 | as above                                                                                                    |
| `listDueReviews`                                                | one page query                                                                        | `limit` ≤ 50                                                                                                |
| `startExamSession` (adaptive)                                   | pool (paged, 1,000 rows a page), progress, history                                    | the pool is **the whole active bank** for the exam type and topic, not the session size (see limitation 12) |

- No N+1: statistics are written by one `apply_review_states` call per batch of 200 questions, read by one RPC per request.
- The review schedule is a cache of `f(history)`. A new partial index (`idx_stats_user_review_stale`, on a generated `review_stale` column) finds stale rows without a scan. A first request after deployment may recompute up to 5 rounds × 200 questions; the rest carries over to the next request (ADR-0002).
- Every other access path uses an index that already exists (Milestone 1).
- Not measured: all timings are reasoned, not benchmarked, because there is no populated database here. The revisit trigger is in ADR-0002 (move aggregates into the database once per-student history regularly exceeds the 5,000 cap).
- There is no per-IP rate limit on these reads (needs a platform component); each is bounded by the caps above.

## Known limitations

1. **Difficulty is unknown for every existing question** (no admin has set one), so `difficultyFit` is neutral and the mastery difficulty component is absent until it is set or enough students have answered.
2. **Confidence is never collected by the current UI.** The six-cell analytics, calibration and false-confidence flags report `unrated` until a control exists (out of scope: no frontend).
3. **No `mock_exam`/`timed_exam` sessions are created by the current screens.** Legacy sessions were backfilled as `mock_exam`, so the readiness mock component exists only for old data and will be absent for new students until the app creates timed exams.
4. **No "question type" column exists**, so tags stand in for it in similarity.
5. **The weights, thresholds and targets are starting values**, not validated against real outcomes. Readiness in particular has never been compared with an actual exam result, which is exactly why it is documented as an internal preparation metric.
6. **Only the newest 5,000 attempts are analysed per request.** Older history is ignored (documented, and the response does not currently say it was truncated).
7. **Times are client-reported.**
8. **Adaptive selection reads only admin-set difficulty for candidates** (reading learned difficulty for the whole bank on every start would be costly).
9. **Readiness for a student whose profile says "Both"** needs an explicit `examType`; there is no automatic choice.
10. **Server functions were not exercised end to end** (browser → TanStack runtime → live Supabase), only by unit, schema and database tests.
11. **`docs/**/\*.md`and`src/styles.css` are not Prettier-formatted\*\* (tables); all TypeScript is.
12. **Starting a session reads every complete question for the selection** (question text, options and answer key, 1,000 rows per round trip) before choosing, for random and adaptive alike. This is the Milestone 1 design; adaptive selection inherits it and adds the difficulty column. It is fine for a bank of a few thousand questions and becomes many round trips for tens of thousands. The fix is to select candidates by id, topic and difficulty in the database (or sample there) and read content only for the chosen questions; I have not made it because it changes the start procedure and has no measurements behind it yet.

## Migration status

- One new migration: `supabase/migrations/20261006200300_intelligence_support.sql` (three functions, one generated column, one partial index).
- **It has not been applied anywhere.** Neither have the three Milestone 1 migrations it builds on; Lovable Cloud applies migrations, and I cannot reach it. Apply all four in filename order.
- It replays cleanly on PGlite on top of every earlier migration (60 database tests), and `supabase/rollback/20261006_milestones_1_to_3_rollback.sql` removes it; `rollback.test.ts` proves the schema returns to its pre-milestone shape.
- `src/integrations/supabase/types.ts` was extended **by hand** for the new functions and column. After applying, regenerate it and review the diff.
- After applying, smoke-test in order: start a session, answer, submit (a schedule row should appear), call `listDueReviews`, then each analytics function.

## Verification results (actual runs, after the last change)

| Command                                                           | Result                                                                                                                                                                                                                                                                         |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `bun run test`                                                    | **exit 0: 56 files, 655 tests passed, 0 failed**                                                                                                                                                                                                                               |
| `bun run lint`                                                    | **exit 0: 0 errors, 11 warnings** (all in existing UI components, `use-auth.tsx`, `admin.tsx` and `onboarding.tsx`, none in code written for the engines; the Milestone 1 audit's 1,806 errors were cleared by ignoring the generated Supabase types and fixing the real ones) |
| `bun run typecheck` (`tsc --noEmit`)                              | **exit 0, no errors** (Milestone 1's `__root.tsx` error is fixed)                                                                                                                                                                                                              |
| `bun run build`                                                   | **exit 0**                                                                                                                                                                                                                                                                     |
| `check_boundaries.py` (layers declared in `docs/ARCHITECTURE.md`) | **PASS: every source dependency points inward**; shown to fail on a deliberate violation                                                                                                                                                                                       |
| `scan_repo.py`                                                    | no sibling variants, junk drawers, debug output, skipped tests or TODOs; one "commented-out code" hit, which is prose in the rollback script                                                                                                                                   |
| `architecture_validator.py`                                       | 0 errors; 10 file-length warnings, mostly large test files and generated code (`session.service.test.ts` is the longest at 548 lines)                                                                                                                                          |

After each of the eight components I ran the same four commands and they passed before the next began; the
one lint and one type failure along the way were fixed immediately, not carried forward.

## How the Dev skills were applied, and where they were not

- **Three Laws of TDD**: every engine and service was written test first and watched failing. Exceptions, stated plainly: the shared helpers `exam-urgency`, `repeated-mistakes` and `utc-days` were extracted from behaviour already pinned by existing tests, and their own tests were written in the same step as the code, so I did not watch those fail first. The Milestone 1 bookmark service has the same exception.
- **TypeScript pack**: readonly data, `satisfies` on configs, discriminated unions for plan blocks, no `any`, no `!`, no type assertions, strict equality (one `== null` left in the selector was found in this review and fixed).
- **One rule, one place**: seven duplications removed (list above); readiness and mastery now read the same repeated-mistake threshold from `intelligence.config.ts`.
- **Backend skills**: controller → service → repository layering, validated input at the edge, explicit selected columns, zod-parsed rows, ownership in every query, typed errors, tests for failure paths.
- **Not applicable as written (Express-specific)**: `BaseController`, `asyncErrorWrapper`, Sentry, `unifiedConfig` from `config.ini`, pino request ids, Redis rate limiting, cookies/CSRF/helmet. The equivalents here are `guard()`, `config.server.ts`, `console.error` in `toAppError` and bearer-token server functions; the skills' own routers say project conventions win.

## Decisions worth challenging

- Readiness **does not use the exam date in the score**. Folding in "days left" would make the number look like a verdict on whether the student will pass.
- A score is withheld below 30 attempts rather than shown with a caveat, because a number invites trust.
- The daily plan is **advice**: it does not create a session; `startExamSession` still enforces every limit.
- The plan's budget uses the student's own average pace, clamped to 15–300 seconds a question, so one outlier cannot make a day absurd.
