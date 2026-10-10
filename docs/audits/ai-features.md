# AI learning features: implementation report, 2026-10-09

Design: `docs/adr/0011-ai-explains-measured-facts.md`. Rules and formulas: `docs/formulas.md` sections 7, 9, 13, 16–18.
Everything below was verified **locally** (Vitest, PGlite, typecheck, build). No live database, Edge Function,
Cloudflare Worker, browser or AI provider was used, and no migration was applied.

## Verification (this run)

| Check | Result |
|---|---|
| `bun run test` | exit 0: 148 files, 2,003 tests passed, 0 failed |
| `bun run lint` | exit 0: 0 errors, 11 warnings (pre-existing style) |
| `bun run typecheck` | exit 0 |
| `bun run build` | exit 0 |
| Dependency-boundary check | PASS |
| `scan_repo.py` | no markers; every area has tests |
| Architecture validator | 0 errors, 19 warnings (files over 300 lines, e.g. `performance.ts` 369) |
| Security scanner (`scan.js`) | 31 findings (19 critical, 12 high). The new ones are heuristic matches on words such as "generate"/"narrate" in Worker code that makes no model call (the call is in the Edge Function, which has `max_tokens`, a timeout, authentication and limits); the browser wrapper `src/lib/ask-ai.ts` is the same finding as before |
| Client-bundle grep | none of: service-role key name, Paystack secret, `LOVABLE_API_KEY`, gateway address, the new RPC/table names |

## What exists for each feature

| # | Feature | Status | Where AI is used | Where it is deliberately not |
|---|---|---|---|---|
| 1 | Study recommendations | Implemented locally | Plain-words explanation of the day's plan (`InsightCard`, kind `recommendation`) | The plan itself (`DeterministicRecommendationStrategy`); "Practise this" links preset topic and selection |
| 2 | Adaptive learning | Implemented locally | none | Scoring and ranking stay deterministic; each question stores *why* it was chosen and the results page shows it |
| 3 | Exam readiness | Implemented locally | Explanation (kind `readiness`) | The estimate; assessments are kept (`readiness_snapshots`) with time and change |
| 4 | Study plans | Implemented locally | Explanation (kind `plan`) | The schedule; edit exam date, update keeps earlier weeks, reasons per item, "Practise" links |
| 5 | Question assistance | Implemented locally | `ask-ai`: explain, simplify, compare options, why wrong, follow-up | Reveal rules (SQL), eligibility, rate limits |
| 6 | Performance analysis | Implemented locally | Explanation (kind `performance`) | All figures (`analyzePerformance`) |
| 7 | Similar questions | Implemented locally | none | Ranking by metadata + wording overlap; "Practise these" starts a server-chosen session |

"Implemented locally" means the code, schema, tests and screens exist and pass; it is not verified live.

## Files and migrations

Migrations (unapplied): `20261009100600_ai_insights.sql`, `20261009100700_selection_reasons.sql`; `20261009100000_rate_limits_and_ai_access.sql`
was edited in place (it was never applied) so the two `get_explainable_*` functions also return `rationale`. All have rollback
entries; `rollback.test.ts` passes.

New server code: `src/server/ai-insights/` (service, grounding, facts builders, Edge narrator, repository, container, controller),
`src/server/intelligence/performance/`, `src/server/intelligence/similar/wording.ts`; changed: readiness service/repository
(history), study-plan engine/service/repository (mastery per item, carry-over, attention, exam date), session service/repository/types
(reasons, similar mode), adaptive selector/service (reason), `supabase/functions/ask-ai/{policy,handler}.ts`.
New Edge Function: `supabase/functions/ai-insight/`. Server functions: `getAiInsight`, `getPerformanceAnalysis`, `setExamDate`.
Screens: `InsightCard`, `AnalysisPanel` (an Analysis tab when written; it is now the Performance Analysis page, see docs/ROUTE_MAP.md), `QuestionHelp`, `SimilarQuestions`; changed `TodayPanel`, `MasteryPanel`,
`PlanPanel`, `mistakes`, `exam.$examId.results`, `test.$token`, `exam.start`.

## Tests added or extended (about 950 tests in the touched areas, all passing)

Grounding (12) · fact builders (20) · insight service (19: cache, new facts, limits, provider down, malformed output, ungrounded numbers/topics,
promises, save failure, concurrent requests) · Edge narrator (12) · insight store (5) · controller (4) · AI-layer fitness tests (7) ·
`ai-insight` Edge policy/handler/architecture (53) · `ask-ai` intents, follow-ups, rationale, links, applicability (policy 52, handler 23) ·
performance engine (18), service (3), store (2) · readiness history (service +4, store +3) · plan engine/service/store (mastery, carry-over,
attention, exam date) · wording similarity (6) and ranking (+3) · session service (reasons, similar mode) · selector reasons (+6) ·
PGlite: `ai-insights.test.ts` (11, ownership and 30-snapshot trimming), `selection-reasons.test.ts` (8), rationale in the explainable functions ·
schemas, wording helpers, link parsing, UI-reachability (`ui-coverage`).

**Test-first honesty.** Most tests were written and watched failing before the code. In a few small places the test and a thin
implementation were written in the same step and first run together (the performance service and store, the insight store, the selection-reasons
migration and its test), so there is no recorded red run for those. Failures I did see and fix included: a fallback sentence
that used a number not in its facts (caught by the grounding check run over the fallback), and several test-data mistakes.

## Security and authorization

- All figures are computed in the Worker from the signed-in student's own records; no request accepts a student id, score, fact or text (strict schemas).
- The Edge Function accepts only the service-role key (constant-time compare, before reading the body), sends no CORS headers, validates a strict request, and has a function-wide budget. It never receives a student id.
- Model output is parsed against a schema and checked for ungrounded numbers/topics, promises about the exam, and links; anything else is discarded in favour of the computed summary. Insufficient history never reaches the model.
- `ai_insights` and `readiness_snapshots` have RLS enabled and no client grant; only the service role reads or writes them. `exam_answers.selection_reason` is writable only through a service-role function that checks the session belongs to the student.
- Question help still works only for finished tests; the follow-up is bounded, wrapped as data, and counts against the same limits.

## Retention

Per student and kind only the latest explanation is kept (digest of facts, narrative, model, prompt version, token counts). No conversation or
follow-up text is stored. Readiness snapshots: the latest 30 per student and exam type. Account deletion removes both (cascade).

## Unresolved issues and limits

1. **Nothing was verified live**: migrations, both Edge Functions, the Worker's call to `ai-insight`, the gateway's JSON output, and all screens in a browser. Grounding thresholds and prompts were tested only against fake model output.
2. **Real model behaviour is unknown.** A real model may often produce text that fails the grounding check (for example a rounded number); the student then sees the computed summary. Watch the `ai-insight discarded` log lines after deployment and tune the prompt (bump `promptVersion` in both places).
3. **Mistakes screen has no "Ask AI" button**: question help needs a finished test id, and the mistake list does not carry the last exam id. Help is available on the results and shared-test screens.
4. **No live hints.** By decision, help works only after submission; the existing hint recording (`hints_used`) has no screen and no mode permits hints.
5. **Student preferences**: only exam date, minutes a day, days a week and target are stored; weekdays and other preferences were not added.
6. **Plan completion is derived from answers** (verified attempts); there is no manual tick, deliberately.
7. **Adaptive selection is not AI-ranked** (documented choice). Difficulty fit uses admin-set or empirical difficulty where it exists; no question has an admin-set one yet.
8. **Similar questions use wording overlap, not embeddings.** No vector search exists in this infrastructure.
9. The hand-extended `types.ts` must be regenerated after the migrations are applied.
10. No browser or end-to-end tests exist; UI states are tested through pure helpers and the reachability test.
11. Lint still reports 11 pre-existing warnings; `performance.ts` is over the 300-line guideline.
12. A cost ceiling exists (3/min and 40/day per student, 1,000/hour overall, 600 output tokens) but no spend dashboard.

## Next steps to make this live

1. Apply migrations `…100600` and `…100700` (and the edited `…100000` if not yet applied) in filename order; regenerate `types.ts`; rerun the four checks.
2. Deploy `ai-insight` and the updated `ask-ai` (docs/deployment.md, section 3b); no new secret is needed.
3. Run the smoke steps 12–16 in `docs/deployment.md`.
4. Review discard logs for a week; adjust prompt/grounding; decide on mistakes-screen help and live hints.
