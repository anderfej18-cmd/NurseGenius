# ADR-0007: Rate limiting uses a fixed-window counter in Postgres

## Status

Accepted

## Date

2026-10-09

## Decision Drivers

- Expensive or abusable operations need a limit: AI explanations, public shared-test attempts, and (for payments) verification calls.
- The app runs as stateless Worker instances and Edge Function instances. An in-memory counter resets on deploy and is not shared across instances, so it would be a pretence of a control (backend skill: rate limiting needs a shared store).
- No Redis or gateway is part of the stack, and the platform's own limiter cannot be configured or verified from this repository.

## Considered Options

1. In-memory counters in each instance.
2. Cloudflare's Workers rate-limiting binding in `wrangler.jsonc`.
3. A fixed-window counter table with one atomic SQL function (chosen).

## Decision Outcome

**Chosen option**: 3. `app_private.rate_limit_hits (bucket, window_start, hits)` with `public.consume_rate_limit(_bucket, _limit, _window_seconds)`: one `INSERT … ON CONFLICT DO UPDATE … RETURNING` per call, so concurrent callers are counted exactly and an exceeded limit is the same for every instance. It is callable by `service_role` only, so a client cannot reset or read a counter.

- Callers choose the bucket name (for example `ai:user:<id>` or `shared-start:<tokenHash>:<ip>`) and the limit in a typed config next to the feature. A window is at most 7 days; expired windows are deleted a few at a time when a new window starts.
- A rejected call still counts, so hammering an exhausted limit does not become cheaper.
- IP buckets use `cf-connecting-ip`, which Cloudflare sets and overwrites; if the header is absent the request falls back to a bucket shared by all such requests, which is stricter, never looser.

### Negative Consequences

- One database round trip per limited call (acceptable for the few operations that use it).
- A fixed window allows a burst of up to twice the limit across a boundary; the AI function therefore adds a short burst window on top of the daily one.
- Option 2 would be cheaper per call. It is not used because `wrangler.jsonc` may not be what the deployment platform reads, which cannot be checked from here; a later ADR can add it in front of this one.

## Validation

`src/server/testing/rate-limit-and-ai-access.test.ts`: counts exactly under concurrency, resets in the next window, isolates buckets, rejects invalid parameters, and is not executable by `anon` or `authenticated`.
