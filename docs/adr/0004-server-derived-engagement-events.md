# ADR-0004: XP, achievements and challenges are paid by the server from recorded facts

## Status

Accepted

## Date

2026-10-06

## Decision Drivers

- Milestone 3 requires that XP "come from server-generated events" and that no client can post an amount.
- A student must not be able to farm XP by repeating questions or sessions, and processing the same session twice must not pay twice.
- The submit path must stay fast and must not fail because a bonus could not be calculated (the exam is already scored and committed).
- The platform has no job runner (the app is a Cloudflare Worker over Supabase; scheduled jobs would need `pg_cron` or a Worker cron, neither of which can be verified here).

## Considered Options

1. **Event handlers on submit**: `submit` calls a handler per rule and pays inline.
2. **Database triggers** that write XP when `exams.status` becomes `completed`.
3. **Idempotent catch-up** (chosen): the ledger has a unique key per source; a `sync` finds finished sessions that have no ledger entry, pays them, and evaluates achievements. It runs after a session is scored and whenever the summary is read.

## Decision Outcome

**Chosen option**: 3, for the same reason the review schedule is derived (ADR-0002): the stored state is a cache of facts that were already recorded, so a missed or failed run loses nothing; the next run pays what is due.

- The ledger `xp_events` has `UNIQUE (user_id, source_type, source_id)` and a `CHECK` on both fields. `source_type`/`source_id` name what was paid for: a session id, a UTC date (daily bonuses), an achievement code, a challenge id. Paying the same source twice is a no-op in the database, not a rule in the application.
- A session is "processed" when its `session` entry exists, even at 0 XP.
- Clients have no write grants on any engagement table (RLS select-own only). Every write goes through a `SECURITY DEFINER` function executable by `service_role` only.
- Amounts are computed in pure TypeScript from database **facts** (answers, first-correct counts, counters) with thresholds passed in from the typed config, so no rule lives in two places.
- Anti-farming is structural: per-question XP is paid only for the first correct answer a student has ever given to that question, so the total is bounded by the size of the bank; the other bonuses are keyed by UTC date and so are paid once a day.
- The post-scoring hook (`SessionService.afterScoring`) runs the catch-up inside `bestEffort`. Failure is logged and never fails the submit.

### Positive Consequences

- Idempotent and repeatable: safe to run any number of times, concurrently or not.
- No job runner is needed; a later scheduler can call the same `sync`.
- Rule changes are recomputations of facts, not migrations of accumulated totals (existing ledger rows stay as paid).

### Negative Consequences

- A student's XP and achievements can lag until the next submit or summary read if a catch-up failed.
- Reading the summary writes (it runs the catch-up); those functions are `POST` for that reason.
- Changing an XP amount does not re-pay past sessions: the ledger records what was paid.

## Confirmation

`src/server/testing/xp-ledger.test.ts` (idempotency, first-correct facts, privileges, row isolation) and `gamification.service.test.ts` (catch-up is repeatable; achievements are reported once). Revisit when a scheduler exists: move the catch-up there and keep the read path read-only.
