# ADR-0011: AI phrases measured facts; it never measures, scores or decides

## Status

Accepted

## Date

2026-10-09

## Decision Drivers

- The seven learning features need personalised wording (recommendations, readiness, plans, performance, question help), but every number a student sees must stay a function of their own recorded answers (ADR-0002, `docs/formulas.md`).
- The gateway key exists only as an Edge Function secret (ADR-0006). The owner chose to keep it there; the Worker must not hold it.
- The engines that measure the student are TypeScript running in the Worker. Rewriting them as SQL, or trusting figures sent by the browser, would duplicate or weaken them.
- A language model can invent numbers, topics, clinical claims and promises about the exam. Its output must be checked, and a failure must never leave the student without an answer.
- Cost and abuse: every model call costs money and can be hammered.

## Considered Options

1. Call the gateway from the Worker with a new `LOVABLE_API_KEY` Worker secret.
2. Extend `ask-ai` with new request kinds that carry figures from the browser.
3. A new Edge Function `ai-insight` that only the Worker can call (service-role bearer), which phrases facts the Worker measured. The Worker validates and caches the result.

## Decision Outcome

**Chosen option**: 3.

```
browser → server function → Worker measures the facts with the existing engines → facts_hash
        → stored explanation for this hash? return it (no model call)
        → rate limit (3/min, 40/day per student) → Edge Function `ai-insight` → gateway
        → Worker validates the schema and the grounding → stores it → returns it
        any failure → the computed summary, built from the same facts by deterministic code
```

- **AI never calculates.** The model receives measured statements and the topic names they mention (nothing else: no student id, no email, no raw answers) and returns JSON with a summary, up to five points and one next step.
- **Grounding** (`src/server/ai-insights/grounding.ts`, pure): every topic named must be in the facts, every number must appear in the facts, no promise or prediction about the exam, no links. A narrative that fails is discarded.
- **Fallback is part of the contract**: `source: "computed"` with a reason (`insufficient_data`, `ai_unavailable`, `rate_limited`). The UI labels AI text "AI-assisted" and everything else "Computed summary".
- **Insufficient history never reaches the model**: no personalised wording is generated for a student with too little data.
- **The seam is `InsightNarrator`**, not `RecommendationStrategy`. The deterministic strategy stays the only implementation (ADR-0003's test still holds); AI rephrases its plan rather than replacing its rules.
- **Question help** (`ask-ai`) stays as it was designed in ADR-0006 and gains four intents and a bounded follow-up. It is still after-submission only: no mode permits a live hint, so the model never sees an unfinished question (enforced in SQL by `get_explainable_*`).
- **Storage**: one row per student and kind (`ai_insights`: digest of the facts, validated narrative, model, prompt version, token counts). No conversation is stored. Readiness assessments are kept as `readiness_snapshots` (latest 30).

### Positive Consequences

- The gateway key stays in one place. No browser or Worker code can reach it (a fitness test greps for it).
- Reproducible: the same facts and prompt version give the same cached text; a changed fact or prompt regenerates it.
- The provider can be replaced by writing another `InsightNarrator`.
- A cache hit costs nothing; only changed facts reach the model, and only within per-student limits.

### Negative Consequences

- One more Edge Function to deploy and a service-role call from the Worker.
- The prompt version is repeated in two places (a test keeps them equal).
- Grounding is a check on numbers and topics, not a proof that every sentence is true; text that stays inside the facts can still be awkward. The disclaimer and the "what this is based on" list are shown beside it.

## Pros and Cons of the Options

### 1. Worker secret

- Good, because one fewer hop.
- Bad, because the gateway key would live in two places and the owner decided against it.

### 2. Extend `ask-ai` with browser-supplied figures

- Bad, because it trusts the client for the facts (ADR-0006 forbids it).

### 3. `ai-insight`

- Good, because the facts are trusted (computed by the Worker) and the key stays put.
- Bad, because of the extra function.

## Validation

- `src/server/ai-insights/architecture.test.ts`: pure modules, one outbound call, no gateway key outside the Edge Function, no second `RecommendationStrategy`.
- `supabase/functions/ai-insight/architecture.test.ts`: no CORS, service key checked first, strict request, function-wide budget, prompt version equals the Worker's.
- Service tests cover: cache hit, new facts, limits, provider failure, malformed output, ungrounded numbers/topics, promises, and storage failure.
