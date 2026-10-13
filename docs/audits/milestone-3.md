# Milestone 3 audit: engagement, competition, notifications and content management

Scope: study plans, streaks and consistency, daily challenges, XP/levels/achievements, friends and friend
challenges, notifications (outbox, inbox, provider interface) and admin content management, with **no AI,
no seeded or invented content, and no score, XP or result ever written by a client**. This audit also
closes the project: it includes the final security, performance and architecture reviews.

This document was finished in a second session. The first session built everything except the last three
items of the checklist below and was closed mid-way (its last act was a red `notification.service.test.ts`);
the second session started by inspecting the repository, ran the suite (1 failing file, 1,170 passing tests)
and continued from there.

## Checklist

- [x] 1. Streaks and consistency (`formulas.md` §10)
- [x] 2. XP ledger, levels, achievements (§11, ADR-0004)
- [x] 3. Daily challenge (§12)
- [x] 4. Study plans (§13)
- [x] 5. Friends and friend challenges (§14)
- [x] 6. Notifications: outbox, inbox, `NotificationProvider` (§15, ADR-0005)
- [x] 7. Admin content management: question create/import/update/retire/restore, subtopics; browser writes closed
- [x] 8. Final security, performance and architecture audits (this document)
- [x] Docs: `formulas.md` §10–15, `docs/api/` (engagement, competition, notifications, questions), ADR-0004/0005, `ARCHITECTURE.md`
- [ ] **Not applied**: no migration from Milestone 1 on has been run on Lovable Cloud (see "Migration status")

Not built, deliberately: any **UI** for notifications, subtopic management, streaks, XP, plans or friends
(the brief says no redesign; the server functions are ready), and any email or push provider (there is one
`NotificationProvider` implementation, the in-app inbox).

## What was built in this session

| Component                         | Where                                                                                                    | Public surface                                                                                              |
| --------------------------------- | -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------- |
| Notification service              | `src/server/notifications/notification.service.ts`                                                       | `dispatch`, `list`, `unreadCount`, `markRead`; `NotificationProvider`                                       |
| Notification store and provider   | `notification.repository.server.ts`, `in-app.provider.server.ts`                                         | Supabase RPCs; idempotent inbox write                                                                       |
| Notification wiring               | `notification.container.server.ts`, `notification.controller.server.ts`, `src/functions/notifications.*` | `listNotifications`, `getUnreadNotificationCount`, `markNotificationsRead`                                  |
| Admin content service             | `src/server/questions/question-admin.service.ts` (+ repository, controller)                              | create, import (≤500, all or nothing), update, retire, restore; subtopic list/create/rename/delete          |
| Admin functions                   | `src/functions/questions.functions.ts` (`admin*`)                                                        | 9 functions, all admin-only                                                                                 |
| Migration                         | `20261006201100_admin_content_management.sql`                                                            | removes every client write on `questions`                                                                   |
| Input validation for custom tests | `src/functions/custom-tests.schemas.ts`                                                                  | zod for all 7 custom-test functions (was bare type casts)                                                   |
| Frontend                          | `src/routes/admin.tsx`                                                                                   | add, import, repair and "retire" now call the server; no visual change except the button label "Retire Row" |

Errors use the one existing system; no `any`, no `!`, no type assertions in production code (the test file
for the controller casts one empty client object).

## Tests

| Area                                                                                                                                | Tests                 |
| ----------------------------------------------------------------------------------------------------------------------------------- | --------------------- |
| Notification wording, service (dispatch, partial failure, best-effort reads, paging, mark read)                                     | 6 + 12                |
| Notification store and in-app provider (ownership in every call, malformed row, idempotent upsert)                                  | 10                    |
| Notification schemas                                                                                                                | 17                    |
| Notification database (triggers, claim/stale/skip-locked, privileges, cascade)                                                      | 21                    |
| Admin content: service                                                                                                              | 23                    |
| Admin content: store                                                                                                                | 10                    |
| Admin content: controller (non-admin refused before anything is touched, for all 9 operations)                                      | 11                    |
| Admin content: schemas (forged `created_by`/`status`, 501 rows, bad tags)                                                           | 22                    |
| Admin content: database (admin, student and anonymous clients denied insert, update, delete; service role allowed; reads unchanged) | 11                    |
| Custom-test schemas (public shared-test input)                                                                                      | 26                    |
| **Whole suite**                                                                                                                     | **1,312 in 98 files** |

Defects found by the tests: `createSubtopic` threw synchronously instead of returning a rejected promise
(service test); the rollback script did not restore `anon`'s legacy write grants on `questions` (the
rollback fingerprint test); the Prettier-unformatted notification database test failed lint.

**Test-first, stated plainly.** The red phase was _observed_ (run, failed for the expected reason: module
not found) for the notification service and the admin content service. For the other new modules (store,
provider, controller, schemas) the test and the code were written in the same step and run together, so I
did not watch those fail first. Their tests do assert behaviour that the code could get wrong (ownership
arguments, malformed rows, refusing non-admins, forged fields), but this is a deviation from the Three Laws
of TDD in the skill and is recorded here rather than hidden.

## Security review (final)

Method: the `nodejs-security-audit` scanner, `check_boundaries.py`, a client-bundle grep of the fresh
build, and a manual review of every Milestone 3 function and table against the skills' checklists.

| Check                | Result                                                                                                                                                                                                                                                                                                   |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Authentication       | Every student function uses `requireSupabaseAuth` (enforced by `architecture.test.ts`); the only unauthenticated functions are the shared-test links, listed by name.                                                                                                                                    |
| Identity / IDOR      | The user id comes from the verified token. All schemas are `.strict()` and tests reject `userId`. Every repository call names the student; tests assert it. Other students appear only as a username.                                                                                                    |
| Privileges           | Clients hold no grants on `notification_outbox`, `notifications`, XP, achievements, plans, friends or challenges, and cannot call their functions (each is `SECURITY DEFINER`, `service_role` only; tested for notifications). **New:** no client role, admins included, can write `questions` (tested). |
| Answer key           | No Milestone 3 response contains `correct_answer` or `rationale`. In the bundle the words appear only as field names in the results page, the admin screen and the shared-test page, which receive keys after submission or from the admin-only function.                                                |
| Notification content | Messages are built from stored facts; usernames are plain text and must be escaped by whoever renders them (documented; tested with `<b>x</b>`). A student can only trigger a notification to a friend or a challenged friend.                                                                           |
| Idempotency          | XP: unique ledger key. Notifications: inbox row reuses the outbox id; marking delivered is guarded (`WHERE dispatched_at IS NULL`). Admin retire/restore are repeatable.                                                                                                                                 |
| Error leakage        | Everything new runs in `guard()`: unexpected errors become a generic message (tested for the admin controller).                                                                                                                                                                                          |
| Client bundle        | `.output/public` contains none of: `service_role`, the service-role key name, `supabaseAdmin`, any Milestone 2 or 3 RPC name, the notification or admin store/service class names, `notification_outbox`, `xp_events`.                                                                                   |
| Scanner output       | 22 findings, none real: 11 "LLM API" hits on files with no LLM code, six "express-session" hits on the word _session_, one ImageMagick hit on a regex flag, the shadcn chart component's static CSS (`chart.tsx`), and three Express header notes (this is not Express).                                 |

**Fixed in this milestone**

1. Admins could write, rewrite and (until a foreign key stopped them) delete questions straight from the browser. Now only the server can, behind `is_any_admin`, with validation; "delete" became **retire**, so history stays valid.
2. The seven custom-test functions, three of them public, trusted their input type with no runtime check. They now go through zod (shape and size limits); their existing business checks and messages are unchanged.

**Open findings (not fixed here; need the owner or a larger change)**

1. **Custom-test functions leak database text and use plain `Error`.**> **Superseded by the fix pass (2026-10-09):** see `docs/audits/fix-pass.md`. Rewritten into the `custom-tests/` domain. `src/functions/custom-tests.functions.ts` predates the layered design: it throws `new Error(error.message)` from Supabase on public endpoints, and has its own copy of the admin check. Fix: move it into a `custom-tests/` domain (controller, service, store, `AppError`s). Not done because it is a rewrite of a feature outside the spec, with no tests of its own.
2. **`supabase/functions/ask-ai`**> **Superseded by the fix pass (2026-10-09):** see `docs/audits/fix-pass.md`. Hardened (ADR-0006). Original finding: answers with `Access-Control-Allow-Origin: *` and trusts the correct answer sent by the client (carried from Milestones 1 and 2). It is a Deno function outside the test harness.
3. **`.env` is tracked in git.** The values need rotating and the file untracking by the owner.
   > **Superseded by the fix pass (2026-10-09):** see `docs/audits/fix-pass.md`. The file holds public settings only; a test guards it. Rotation is no longer claimed to be needed for those values.
4. **The Sub-Admin user directory is probably broken.** Migration `20260906051951` revoked `execute` on `get_subadmin_user_directory()` from `authenticated`, but `admin.tsx` still calls it from the browser. Unverified (no live database here); the roadmap lists this feature as unfinished.
   > **Superseded by the fix pass (2026-10-09):** see `docs/audits/fix-pass.md`. Confirmed by the fix pass: the call was broken. It now goes through a server function and `list_user_directory`.
5. **Admin screens for plans, roles and tiers still write from the browser**, protected by RLS (`central admin manages plans/roles`) and the `assign_user_tier` check (`is_any_admin`, so a sub-admin can assign tiers too: confirm that is intended). I reviewed the policies; they hold, but they are not behind the server layer.
6. **No rate limiting**> **Superseded by the fix pass (2026-10-09):** see `docs/audits/fix-pass.md`. A shared limiter now covers `ask-ai`, shared tests and payments (ADR-0007). Original finding: on the public shared-test endpoints or any other function; limits are business rules and caps. It needs a platform component (Worker rules).
7. **Notifications given up after five attempts** stay in the outbox with their last error and nothing alerts anyone.

## Performance review (final)

All timings are reasoned from the query shapes, not benchmarked: there is no populated database here.

| Function                                              | Database round trips                                                                                                  | Bound                                                                                                                                                           |
| ----------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listNotifications`, `getUnreadNotificationCount`     | 1 claim RPC, then (only if something waits) one inbox upsert per notification and one mark call; then 1 list or count | claim ≤ 50 rows (`batchSize`); list ≤ 50 rows, offset ≤ 10,000; indexes `idx_notification_outbox_pending`, `idx_notifications_user`, `idx_notifications_unread` |
| `markNotificationsRead`                               | 1 RPC                                                                                                                 | ≤ 100 ids                                                                                                                                                       |
| `getGamificationSummary` and the post-submit catch-up | 4 batches at most of 50 sessions/challenges, 3 achievement rounds at most                                             | `GAMIFICATION_SYNC`; the rest carries to the next request; failure never fails a submit                                                                         |
| `getStudyStreak`                                      | 1 RPC                                                                                                                 | last 366 days                                                                                                                                                   |
| `getStudyPlan`                                        | profile + plan + attempt counts                                                                                       | derived on read; nothing stored but the plan                                                                                                                    |
| Friends / challenges                                  | 1 RPC per action; lists paged (≤ 50)                                                                                  | the challenge draw reads the active bank like session start (Milestone 2 limitation 12)                                                                         |
| Admin writes                                          | 1 statement each (import: 1 insert, ≤ 500 rows); subtopic list ≤ 500 rows                                             |                                                                                                                                                                 |

- **In-app delivery is one upsert per notification** (N+1) in the worst case, up to 50 on the first read after a burst. In steady state a student has zero to a few waiting. If volume grows, batch the provider (it is a seam, so the change is local).
- Reads write (the catch-up), so they are `POST` and cannot be cached by HTTP caches; acceptable for per-student data.
- No unbounded query was added; every list has a limit.

## Architecture review (final)

| Check                                    | Result                                                                                                                                                                                                                                                                                                 |
| ---------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `check_boundaries.py`                    | **PASS: every source dependency points inward** (shared 14, backend 207, functions 35, frontend 63 files)                                                                                                                                                                                              |
| `architecture.test.ts` fitness functions | pass: engines and services import no Supabase or framework code and read no clock, randomness or environment; function modules load server code only through a dynamic import; every function is authenticated except the three shared-test links; exactly one `RecommendationStrategy` implementation |
| `scan_repo.py`                           | no sibling variants, junk drawers, debug output, skipped tests, TODOs or comment blocks; one "commented-out code" hit, which is prose in the rollback script                                                                                                                                           |
| `architecture_validator.py`              | 0 errors, 13 file-length warnings (tests, generated code, and `custom-tests.functions.ts` at 400 lines, which is open finding 1)                                                                                                                                                                       |
| Interfaces                               | Only the ones with a reason to vary exist: `ReviewScheduler`, `RecommendationStrategy`, `NotificationProvider` (ADR-0003, ADR-0005). Stores are declared next to their one consumer.                                                                                                                   |
| Largest file                             | `src/routes/admin.tsx`, 2,054 lines, a pre-existing screen; this milestone only changed four calls in it                                                                                                                                                                                               |

## Known limitations

1. Nothing is delivered until the student next reads (no scheduler); email or push would need one.
2. Notifications are not removed once read, and none exist for XP, achievements or streaks.
3. Subtopics have an admin API but **no screen**, and no question has one (none are invented).
4. The admin question form still has no fields for difficulty, tags, source or subtopic; the API supports them.
5. A TXT import of more than 500 questions is sent in chunks of 500; each chunk is all-or-nothing, the whole file is not.
6. `adminUpdateQuestion` with `content` replaces the whole question; the rationale is kept only if sent (the repair form sends the stored one).
7. All weights, thresholds and limits are starting values (carried from Milestone 2).
8. The server functions were not exercised end to end (browser → TanStack runtime → live Supabase), only by unit, schema and database tests.
9. Times and confidence are client-reported and advisory (carried).

## Migration status

- Milestone 3 migrations: `…200400_study_days`, `…200500_gamification`, `…200600_daily_challenges`, `…200700_study_plans`, `…200800_friends`, `…200900_friend_challenges`, `…201000_notifications`, **`…201100_admin_content_management`** (new in this session).
- **None of them, nor the three from Milestone 1 and the one from Milestone 2, has been applied anywhere.** Lovable Cloud applies migrations and I cannot reach it. Apply all twelve in filename order (`20261006200000` to `20261006201100`).
- They replay cleanly on PGlite on top of the legacy schema, and `supabase/rollback/20261006_milestones_1_to_3_rollback.sql` removes them; `rollback.test.ts` proves the schema returns to its pre-milestone shape (including the restored admin write policies).
- `src/integrations/supabase/types.ts` was extended **by hand** for the new tables and functions. After applying, regenerate it and review the diff.
- After applying, smoke-test in order: start a session, answer, submit; `getGamificationSummary`; send a friend request to a second account, then `getUnreadNotificationCount` (expect 1), `listNotifications`, `markNotificationsRead`; as an admin, create, import, retire and restore a question on the admin page; then, in the browser console as an admin, `supabase.from("questions").insert(...)`, which must now fail; finally a self-update of `profiles.tier`, which must fail.

## Verification results (actual runs, after the last change)

| Command                              | Result                                                                                                                                                               |
| ------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `bun run test`                       | **exit 0: 98 files, 1,312 tests passed, 0 failed**                                                                                                                   |
| `bun run lint`                       | **exit 0: 0 errors, 11 warnings** (all in existing UI components, `use-auth.tsx`, `admin.tsx` and `onboarding.tsx`, none in code from the engines or this milestone) |
| `bun run typecheck` (`tsc --noEmit`) | **exit 0, no errors**                                                                                                                                                |
| `bun run build`                      | **exit 0**                                                                                                                                                           |

I ran the four commands after each of the three parts of this session (notifications, admin content,
custom-test validation); they passed before the next part began. Before the session's first change the suite
had one failing file (the red notification service test).

## How the Dev skills were applied, and where they were not

- **Three Laws of TDD**: see "Test-first, stated plainly" above.
- **Minimalist**: one provider, no email/push stub; no screen built that was not asked for; the existing `bestEffort`, `guard`, `assertAdmin`, `offsetBounds`, `questionIssues` and `createFakeSupabase` were reused instead of new helpers; no new dependency.
- **Backend skills**: controller → service → store layering, validated input at the edge, explicit columns, zod-parsed rows, ownership in every query, typed errors, idempotent delivery, a guarded multi-write only where the database already provides it.
- **Clean-code**: a new domain per folder, nothing in a `utils` or `helpers` drawer, no sibling variants, the dependency rule checked by script.
- **Not applicable as written (Express-specific)**: `BaseController`, Sentry, pino request ids, Redis rate limiting, cookies/CSRF/helmet. Their equivalents are `guard()`, `config.server.ts` and bearer-token server functions.
- **Violation found and recorded, not fixed**: `custom-tests.functions.ts` breaks the layering and error rules (open finding 1). It predates this work.

## Decisions worth challenging

- Admins lose direct write access to `questions` entirely; a sub-admin who could add questions from the console before now needs the screen. This is deliberate (validation and history) but it is a behaviour change to confirm.
- Questions are **retired, never deleted**. An admin who wants a question gone for good has no way to do it from the app.
- Delivery on read (ADR-0005) trades instant notifications for needing no job runner.
- An import is all-or-nothing per 500 questions, so one bad question in a file blocks the batch it is in, with a message naming it.
