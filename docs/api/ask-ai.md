# ask-ai (Supabase Edge Function)

Source: `supabase/functions/ask-ai/` (`index.ts` wiring, `handler.ts` request flow, `policy.ts` rules). Called from the
browser by `src/lib/ask-ai.ts` through `supabase.functions.invoke("ask-ai", { body })`. Design: ADR-0006; limiter: ADR-0007.

It is **not** a TanStack server function, because the gateway key lives in the Edge Function's secrets.

## Request

`POST`, JSON, at most 2 KB, strict (any other field is refused with 400).

| `kind`   | Body                                                                                                    | Who may call                                                                                                                                                               |
| -------- | ------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `exam`   | `{ kind: "exam", examId: uuid, questionId: uuid, intent?, followUp? }`                                  | A signed-in student, for a question of their **own finished** exam. The bearer token is verified with `auth.getUser()`; the public anon key is not a student and gets 401. |
| `shared` | `{ kind: "shared", attemptId: uuid, accessKey: string (32–256), questionId: uuid, intent?, followUp? }` | A shared-test taker holding the attempt key, for a question of their **finished** attempt. The function hashes the key (SHA-256) and the database checks it.               |

The client never sends question text, options, the correct answer or a topic. They are read from the database by
`get_explainable_question` / `get_explainable_shared_question`, so a caller cannot make the model explain a made-up
question or "teach" it a false correct answer, and a question cannot be explained before its result is shown.

## Kinds of help

| Field                        | Values                                                  |
| ---------------------------- | ------------------------------------------------------- |
| `intent` (default `explain`) | `explain`, `simplify`, `compare_options`, `why_wrong`   |
| `followUp`                   | a short question of the student's own, 3–300 characters |

`why_wrong` is refused with 400 `That kind of help does not apply to this question.` for a question answered correctly or not at all. The prompt carries the stored question, the stored key, the **official rationale** (or says none exists, and the model is told not to invent one) and the student's own answer. The follow-up is wrapped as data. Help works only on a **finished** test, as before; no mode allows a hint during a test. Answers that contain a link are discarded. The screen (`QuestionHelp`) shows the official explanation when the AI cannot answer.

## Response

- `200 { explanation: string }`: at most 2,000 characters.
- Errors are `{ error: string }` with one of: 400 `That request is not valid.` · 401 `Sign in to continue.` · 403 `Origin not allowed.` · 404 `That question cannot be explained.` (also: still running, not yours, wrong key) · 405 · 413 · 429 `Too many requests…` with `Retry-After` · 500 `Something went wrong…` · 502 `The AI tutor could not answer…` · 503 `The AI tutor is unavailable right now.`

Database and gateway error text is logged on the server only.

## Limits (`AI_CONFIG` in `policy.ts`)

| Scope                               | Limit                         |
| ----------------------------------- | ----------------------------- |
| Student, burst                      | 5 per minute                  |
| Student, daily                      | 30 per day                    |
| Shared-test attempt                 | 10 per day                    |
| Caller address (`cf-connecting-ip`) | 20 per minute                 |
| Model output                        | 400 tokens; gateway wait 20 s |

## CORS

An allowlist, never `*`. Set the `ALLOWED_ORIGINS` secret to a comma-separated list (`https://app.example.com`,
`https://*.staging.example.com`, where `*` is exactly one host label). If it is unset the defaults are `https://*.lovable.app`,
`https://*.lovableproject.com` and the local development origins. **If the app is served from any other domain, set
`ALLOWED_ORIGINS` or the browser will block the call.** A disallowed origin receives 403 and no CORS headers.

## Environment

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY` (provided by the platform), `LOVABLE_API_KEY` (the existing
secret), `ALLOWED_ORIGINS` (optional). A missing required variable stops the function at start-up with the variable's name,
never its value.
