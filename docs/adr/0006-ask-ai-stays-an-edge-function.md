# ADR-0006: `ask-ai` stays a Supabase Edge Function, but authorises and reads question data itself

## Status

Accepted

## Date

2026-10-09

## Decision Drivers

- The audit found `supabase/functions/ask-ai/index.ts` open to anyone holding the (public) anon key: wildcard CORS, no per-user limit, no token cap, raw error messages, and a prompt built from client-supplied `question`, `options`, `correct` and `topic` (free LLM use, prompt injection, a client "telling" the model which answer is correct).
- The gateway key `LOVABLE_API_KEY` lives in the Edge Function's secret store. The Worker has no such secret; moving the call into a server function would silently disable the feature until the owner copies the secret across.
- The feature is used from two places: signed-in students on their results page, and shared-test takers who are not signed in (the attempt key is their credential).

## Considered Options

1. Delete the Edge Function and call the gateway from a TanStack server function (same-origin, no CORS).
2. Harden the Edge Function in place (chosen).
3. Leave it, relying on the platform's `verify_jwt`.

## Decision Outcome

**Chosen option**: 2. Option 1 is cleaner but needs a new Worker secret that only the owner can create, so shipping it would break the feature on deploy; option 3 is no protection, because the anon key is a valid JWT.

- **The client names a question, never its content.** The request is `{ kind: "exam", examId, questionId }` or `{ kind: "shared", attemptId, accessKey, questionId }`. There is no client text in the prompt, so there is nothing to inject and no way to assert a false "correct" answer.
- **Authority is in SQL.** `get_explainable_question` (signed-in student, own completed exam) and `get_explainable_shared_question` (completed attempt, matching key hash) return the question and its key only when the caller may see them; both are `service_role`-only. A question still in progress cannot be explained, so the answer key stays protected until the result is shown.
- **Identity.** For `exam`, the function verifies the bearer token with `auth.getUser()`; the anon key has no user and is refused. For `shared`, the attempt key is checked by the SQL function.
- **Abuse limits** use the database limiter of ADR-0007: a burst limit and a daily limit per student, a per-attempt limit for shared tests, plus a model output cap and a request timeout.
- **CORS** is an allowlist (`ALLOWED_ORIGINS` secret, with the Lovable-hosted and local development origins as the default). A disallowed origin gets no CORS headers and a 403. Authentication is by bearer token, so CORS is defence in depth, not the access control.
- **Errors** are mapped to a short list of public messages; the original is logged server-side only.
- The pure logic (origin check, request schema, prompt, error mapping) lives in plain TypeScript modules next to `index.ts`, so Vitest tests it without Deno.

### Positive Consequences

- Works with the secret that already exists; no deploy-time outage.
- The model can only explain a question the student has already been shown the answer to.

### Negative Consequences

- Edge Function code sits outside `src/` and outside the layered server tree; the only shared pieces are the SQL functions.
- It needs the owner to set `ALLOWED_ORIGINS` if the app is served from a domain other than the defaults.
- Not exercised against the live gateway here (no key, no network): see `docs/audits/fix-pass.md`.

## Validation

`supabase/functions/ask-ai/policy.test.ts` (request schema, origin allowlist, prompt contents, error mapping), `src/server/testing/rate-limit-and-ai-access.test.ts` (SQL authority and limiter on PGlite), and a fitness test that fails if `index.ts` reads any prompt field from the request body.
