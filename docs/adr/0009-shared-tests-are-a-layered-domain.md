# ADR-0009: Shared tests become a layered domain with atomic database operations and rate limits

## Status

Accepted

## Date

2026-10-09

## Decision Drivers

- Audit finding S2: `custom-tests.functions.ts` (400 lines) mixed validation, business rules and queries in the handlers, threw `new Error(error.message)` with raw database text on three public endpoints, kept its own copy of the admin check, and let anyone create unlimited attempts.
- Submitting a shared test wrote answers and then completed the attempt in separate statements, and the scoring happened in the Worker.
- Admins could still write the test tables from the browser, bypassing validation, as they could write `questions` (ADR for admin content, migration `20261006201100`).

## Decision Outcome

- **Layers** as for every other domain (ADR-0001): `src/functions/custom-tests.functions.ts` (auth middleware, zod, one dynamic import) → `custom-tests.controller.server.ts` (admin gate through the shared `assertAdmin`, `guard`) → `CustomTestService` (rules, limits) → `SupabaseCustomTestStore` (queries and RPCs). Errors are the typed `AppError`s; unexpected failures become a generic message.
- **Atomic operations in the database**: `create_custom_test`, `submit_shared_attempt` and `import_custom_test_to_bank` are one transaction each, take the actor explicitly (the service role has no `auth.uid()`), and raise named exceptions that `mapDbError` turns into typed errors. Submitting locks the attempt row, scores from the stored key, enforces the 80%-before-deadline rule, and refuses a second submission.
- **Abuse limits** use the database limiter (ADR-0007): per caller address (20 starts an hour, 30 submits an hour, 60 views a minute) and per email and test (5 starts a day). Exceeding one is a 429 that says how long to wait.
- **No browser write path**: `INSERT/UPDATE/DELETE` on `custom_tests` and `custom_test_questions` is revoked from client roles.
- The attempt key is hashed (SHA-256) before it is stored or compared; the key itself is never persisted.

### Negative Consequences

- Public shared-test pages now cost a database round trip for the limiter on each view and start.
- Callers behind one shared address (a school network) share the address limits; the per-email limit is the one a single taker meets first.
- The legacy browser-facing SQL functions (`start_custom_test_attempt` and friends) remain in the schema, revoked and unused.

## Validation

`custom-tests.service.test.ts`, `custom-tests.repository.test.ts`, `custom-tests.controller.test.ts` and the PGlite suite `src/server/testing/custom-tests.test.ts` (atomic create, forged answers, double submit, the 80% rule, wrong key, privileges).
