# ADR-0001: Server functions, controllers, services and repositories

## Status

Accepted (records the decisions taken in Milestones 0 and 1)

## Date

2026-10-06

## Decision Drivers

- The app is one TanStack Start Worker with a single client (the web app); `AGENTS.md` requires privileged code to stay out of client-safe `*.functions.ts` modules.
- TanStack's import protection denies any `**/server/**` path in the client build.
- Students must never be able to write scores or read answer keys; the browser is untrusted.
- The Dev skills require layered code (route → controller → service → repository), schema validation at the edge, typed errors, and tests at each layer.

## Considered Options

1. Hand-written REST routes under `src/routes/api/`.
2. Server functions with services and repositories under `src/server/`, client-safe function modules under `src/functions/`.
3. Keep database calls in React routes behind RLS only.

## Decision Outcome

**Chosen option**: 2, because it matches the project convention in `AGENTS.md`, keeps one typed call path from the browser, and keeps all privileged code behind a dynamic import inside each handler.

```
src/functions/*.functions.ts   auth middleware + zod validation + one dynamic import
src/server/<domain>/*.controller.server.ts   composition and error mapping (guard)
src/server/<domain>/*.service.ts             business rules, no Supabase or HTTP types
src/server/<domain>/*.repository.server.ts   all database access
supabase/migrations                          RLS, column privileges, transactional functions
```

### Positive Consequences

- Services are unit-testable with fakes; SQL is tested on PGlite.
- One place per rule; the boundary is enforced by import protection and ESLint.

### Negative Consequences

- More files per domain than REST routes would need.
- HTTP statuses are not available to the browser (the transport answers 500); typed `code` and `statusCode` travel on the error instead.

## Validation

- `check_boundaries.py` with the declared layering `shared → service → repository → controller → function` passes.
- The ESLint rule forbids frontend imports of `@/server/**`.
- The client bundle contains no service-role code (checked after every build).
