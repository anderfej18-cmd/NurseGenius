# getAiInsight (AI explanation of measured facts)

Source: `src/functions/ai-insights.functions.ts` → `src/server/ai-insights/`. Design: ADR-0011; rules: docs/formulas.md section 18.

- **Method**: `POST` server function `getAiInsight` (a first view may write the explanation).
- **Authorization**: signed-in student; the facts are always the signed-in student's own.
- **Request** (strict): `{ kind: "recommendation" | "readiness" | "performance" | "plan", availableMinutes?: 10–240 (recommendation), examType?: "RN" | "RM" (readiness) }`. No student id, figure, fact or text is accepted.
- **Response**: `{ kind, source: "ai" | "computed", status: "ok" | "insufficient_data" | "ai_unavailable" | "rate_limited", narrative: { summary, points: [{ topic | null, text }], nextAction }, facts: string[], generatedAt: string | null }`.
  - `source: "ai"` only when the text came from the model and passed every check; `facts` lists the measured statements it rests on.
  - Anything else is a **computed summary** built from the same facts. This function does not fail because the AI is unavailable.
- **Errors**: 401 not signed in · 400 invalid request · 404 no profile · 500 generic.
- **Limits**: model calls 3 per minute and 40 per day per student; a stored explanation for unchanged facts is returned without a call and without counting.
- **Storage**: one row per student and kind in `ai_insights` (digest of the facts, narrative, model, prompt version, token counts). No conversation is stored.

## Edge Function `ai-insight`

`supabase/functions/ai-insight/`. Called only by the Worker with the service-role key (checked in constant time before anything else). No CORS headers. Request: `{ kind, facts: string[1–40, ≤240 chars], topics: string[≤40] }`, strict. Response: `{ narrative, model, promptVersion, usage }`. Secrets: `LOVABLE_API_KEY` (existing) and the platform's `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`. Function-wide budget 1,000 calls an hour; model output 600 tokens; gateway wait 20 s.
