# Intelligence (deterministic learning engines)

Source: `src/functions/intelligence.functions.ts` → `src/server/intelligence/`. Every figure is a pure
function of the student's attempt history and a typed configuration (docs/formulas.md); nothing here
uses AI and nothing is stored except the review schedule, which is a cache rebuilt from the history
(docs/adr/0002). History analysed per request is capped at the latest 5,000 attempts.

All functions are `POST`, require a signed-in student, and read **only that student's** data: the user
id comes from the verified token and no request field can name another user (schemas are strict).
Question content in responses never includes `correct_answer` or `rationale`.

## listDueReviews
- **Request**: `{ examType?: "RN"|"RM", topic?: string, limit?: 1–50, offset?: 0–10000 }`
- **Response**: `{ items: [{ questionId, examType, topic, nextReviewAt, overdueDays, status, reviewCount, intervalDays, question: { question_text, option_a..d } }], nextOffset: number|null }`, most overdue first
- **Business rules**: questions whose `next_review_at` has passed. Stale schedules are recomputed from the history first (formulas section 3).

## getSimilarQuestions
- **Request**: `{ questionId: uuid, limit?: 1–20 }`
- **Response**: `{ source: { id, topic, subtopicId, difficulty }, items: [{ id, topic, subtopicId, difficulty, tags, year, score, reasons, attempted, question }] }`
- **Errors**: 404 when the student has not attempted the source question (same as a missing one)
- **Business rules**: from question metadata only (formulas section 7).

## getTopicMastery
- **Request**: `{}`
- **Response**: `{ topics: [{ topic, attempts, score, rawScore, evidence, level, trend, components, componentsUsed, penalties }], overall: { score, level, evidence, attempts } }`, weakest first
- **Business rules**: formulas section 1. Two correct answers are not mastery: scores stay near 50 until there is evidence; `mastered` needs at least 30 attempts.

## getConfidenceAnalytics
- **Request**: `{ periodDays?: 1–365 }` (whole history when omitted)
- **Response**: `{ overall, byTopic, byExamType, period: { since } }`; each matrix has the six cells `correctLow … wrongHigh`, `unrated`, `rated`, `highConfidenceErrorRate`, `lowConfidenceSuccessRate`, `falseConfidence`, `weakConfidence`
- **Business rules**: formulas section 2. The web UI does not yet collect confidence, so existing history is all `unrated`.

## getTimeAnalytics
- **Request**: `{ periodDays?: 1–365 }`
- **Response**: `{ timedAttempts, untimedAttempts, outlierAttempts, overall, correct, incorrect, byTopic, pace, patterns, insights, trend, slowestQuestions, period }`; `overall`/`correct`/`incorrect` are `{ count, averageMs, medianMs, minMs, maxMs }` or null
- **Business rules**: formulas section 5. Times are client-reported and advisory; missing or implausible times are counted and left out.

## getDailyRecommendation
- **Request**: `{ availableMinutes?: 10–240 }` (default 30)
- **Response**: `{ date, availableMinutes, totalQuestions, estimatedMinutes, urgency, daysToExam, limitReached, blocks, notes }`; each block is `{ kind: "due_reviews"|"mistake_review"|"topic_practice"|"mixed_practice"|"speed_practice", title, questions, reason, ... }` and `topic_practice` adds `topic` and `mastery`
- **Errors**: 400 time outside 10–240 · 404 no profile
- **Business rules**: formulas section 8. When today's tier allowance is used up the plan is empty with `limitReached: true`. The plan is advice: starting a session still goes through `startExamSession`, which enforces the limits.

## getExamReadiness
- **Request**: `{ examType?: "RN"|"RM" }` (defaults to the profile's exam preference)
- **Response**: `{ examType, readinessScore: number|null, band, attempts, attemptsToScore, completeness, components: { <name>: { value, weight, used } }, accuracy, mastery, speed, consistency, weakTopics, recommendations, exam: { date, daysToExam, urgency }, notice }`
- **Errors**: 400 no exam type given and the profile says Both or nothing · 404 no profile
- **Business rules**: formulas section 9. An internal preparation metric, **not a prediction**: `notice` says so, and the score is null until 30 attempts exist.

## getPerformanceAnalysis
- **Authorization**: signed-in student, own data only. **Request**: `{}`.
- **Response**: `{ attempts, sufficientEvidence, attemptsNeeded, accuracy, recent, earlier, topics[], weakest[], strongest[], repeatedMistakes: { total, questions[] }, revision: { revisited, correctedNext, rate }, pace, reviews: { due, unresolvedMistakes }, unverifiedExams, findings: [{ code, topic, message }] }`.
- **Business rules**: docs/formulas.md section 16. Below 30 answers no pattern is reported. Findings state measurements and patterns, never causes. Completed tests whose stored score is unverified are counted in `unverifiedExams` and not used.

## getExamReadiness: assessment history
The response also carries `history: { assessedAt, previous: { assessedAt, score } | null, change } | null` (docs/formulas.md section 9). `null` only when recording the assessment failed; the report is still returned.

## getSimilarQuestions: wording
`reasons` may now include `similar_wording` (docs/formulas.md section 7). `getSimilarQuestions` is used by the "Find similar questions" button on the results and mistakes screens; "Practise these" starts a session through `startExamSession` with `selection: "similar"`.
