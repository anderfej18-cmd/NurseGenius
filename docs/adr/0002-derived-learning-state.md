# ADR-0002: Learning state is derived from attempt history, not accumulated

## Status

Accepted

## Date

2026-10-06

## Decision Drivers

- Milestone 2 must produce mastery, confidence, review schedules, time analytics and readiness that are deterministic, explainable and configurable.
- Formulas will be tuned. State that was accumulated by an old formula cannot be re-explained or corrected.
- Milestone 1 already records every answered attempt (`exam_answers`) and a per-question summary (`user_question_stats`).
- Existing questions have no `difficulty` and no attempt has `confidence`; nothing may be invented.

## Considered Options

1. **Derive**: engines are pure functions of the attempt history; any stored value is a cache that can be recomputed.
2. **Accumulate**: update running totals or ratings on every submit.
3. **Materialise** per-topic aggregates in new tables kept up to date by triggers.

## Decision Outcome

**Chosen option**: 1.

- Pure engines take `(attempts, config, now)` and return explainable results, including the components behind each number.
- The review schedule is **replayed** from the ordered attempt history by the scheduler; `user_question_stats` review columns are a cache. A formula change is a recompute, and recomputing is idempotent (no double-applied updates).
- Signals that are missing (no confidence, no difficulty, no exam date) exclude their component and renormalise the remaining weights; the result states which components were used. Empirical difficulty comes from cross-student attempt aggregates and is "unknown" below a minimum sample.
- Attempts analysed per request are capped (`MAX_ATTEMPTS_ANALYSED`), keeping cost per request bounded as the user base grows.

### Positive Consequences

- Every number can be reproduced from stored attempts and a config.
- Legacy data is covered by the same code path (no separate backfill logic).
- Tests use fixed fixtures and plain data; no database is needed for formulas.

### Negative Consequences

- Each read recomputes from up to the cap of attempts.
- Cross-student difficulty needs an aggregate query.

## Validation

- Unit tests per engine with fixed fixtures (empty, tiny, large samples, improving, declining).
- Revisit when a student's analysed history regularly exceeds the cap, or p95 latency of the intelligence functions exceeds 500 ms: then materialise per-topic aggregates (option 3) behind the same service interfaces.
