# Sessions (exam engine)

Source: `src/functions/sessions.functions.ts` → `src/server/sessions/`. Tier limits come from
`src/lib/exam-rules.ts`; the database functions are in `supabase/migrations/20261006200100_exam_session_engine.sql`.

The browser can no longer insert or update `exams`, `exam_answers` or the daily counters: the only
writer is the service role, called through the four functions below.

## startExamSession
- **Method / path**: `POST` server function `startExamSession`
- **Authorization**: signed-in student
- **Request**: `{ examType: "RN"|"RM", category: string, count: int, minutes: int, selection?: "random"|"adaptive"|"mistakes"|"due"|"similar", similarTo?: uuid }` (`category` is a topic or `"All Areas"`; `selection` defaults to `"random"`)
- **Validation**: `count` 1–250, `minutes` 5–180, `category` 1–200 chars, no other keys (a client-chosen question list, score or tier is rejected)
- **Response**: `{ examId: string, totalQuestions: number }`
- **Errors** (`code` → meaning; the transport status is always 500): VALIDATION_ERROR empty pool (no complete questions for the selection) · 404 no profile · 409 an exam is already in progress · 429 over the per-session cap, daily cap exhausted or "only N left today"
- **Business rules**
  - The effective tier is `novice` when the subscription has expired.
  - Caps: novice 50/session & 50/day, erudite 150 & 500, scholar 250 & unlimited. The day is the UTC date.
  - Questions are chosen on the server from active, **complete** questions (`isCompleteQuestion`): by an unbiased shuffle (`random`), by what the student most needs to practise (`adaptive`, docs/formulas.md section 6), from the questions the student missed and has not since got right (`mistakes`, stored as session type `mistake_review`), or from those whose review date has arrived (`due`, session type `revision`). Without a topic the session type is `mixed`, with one `topic_practice`. `similar` needs `similarTo` (a question the student has already answered) and is the only mode that takes it: the session is the questions most like that one (docs/formulas.md section 7, at most 20), session type `mixed` or `topic_practice`. The request names a mode, never questions. The modes and their reveal rules live in `src/lib/session-modes.ts`; every mode reveals answers only once the session is completed. If fewer than `count` exist the session is smaller and `totalQuestions` says so.
  - One active session per student (partial unique index). A session past its deadline is finalised first.
  - The deadline is `now() + minutes` on the database clock. The daily counter is increased in the same transaction.
  - The tier limits are checked twice: by the service, for a precise message, and again inside `start_exam_session` under the student's row lock (`session_limit_exceeded`, `daily_limit_reached`, both 429), so a stale read cannot overrun them. The daily-challenge and friend-challenge sessions start through the same function and share the rule.

## Why a question was chosen
`getExamResults` items carry `selection_reason` (`random`, `weak_topic`, `due_review`, `previous_mistake`, `new_question`, `recent_weakness`, `similar`, or `null` for a session started before reasons were kept). It is set by the server when the session starts (docs/formulas.md section 17), is shown only on the results page, and affects neither the answer nor the score. `getExamSession` never returns it.

## getExamSession
- **Authorization**: signed-in student, own session only (others → 404)
- **Request**: `{ examId: uuid }`
- **Response**: `{ session: { id, examType, category, status, startedAt, deadlineAt, serverNow, timeLimitMinutes, totalQuestions }, items: [{ answerId, questionId, position, userAnswer, flagged, confidence, question: { id, topic, question_text, option_a..d } }] }`
- **Business rules**: no answer key, rationale or correctness is ever returned. If the deadline has passed the session is finalised and returned with `status: "completed"` and no items. Use `deadlineAt` and `serverNow` for the countdown. (POST because reading can finalise.)

## saveExamAnswer
- **Request**: `{ examId: uuid, questionId: uuid, answer?: "A"|"B"|"C"|"D", confidence?: "low"|"medium"|"high", flagged?: boolean, hintUsed?: true, timeSpentMs?: int }` — at least one optional field
- **Validation**: strict; `is_correct`, `score`, `score_pct`, `status`, `user_id` and every other unknown key are rejected; `timeSpentMs` 0–3,600,000
- **Response**: `{ ok: true }`
- **Errors**: 400 nothing to save · 404 session or question not found for this student · 409 `SESSION_CLOSED`
- **Business rules**: accepted only while the session is in progress and before `deadline + 10 s` (network grace). Records `first_answer`, increments `answer_changes` when a given answer is replaced, stamps `answered_at`. `timeSpentMs` is advisory (client-reported, never lowers the stored value, clamped to the session's age). Omitted fields are left unchanged. `hintUsed: true` reports that a hint was shown: the database adds one to `hints_used` per report (ceiling 10), so the client cannot choose the number. It changes neither the answer nor the score. No screen shows hints yet; this is the recording capability only.

## submitExamSession
- **Request**: `{ examId: uuid }`
- **Response**: `{ examId, alreadyCompleted, correctCount, totalQuestions, scorePct, autoSubmitted }`
- **Errors**: 404 not found / not the caller's
- **Business rules**: scoring happens inside one database transaction from the answer key; unanswered questions are wrong; `scorePct` is `correct / total` to 2 decimals. Completion time is `min(now, deadline)`; `autoSubmitted` is true when submitted after the deadline. Per-question statistics (`user_question_stats`) are updated in the same transaction. **Idempotent:** a second call returns the stored result and changes nothing. The "80% answered or 80% of the time" unlock is a UI rule only and is not enforced here.

## getExamResults
- **Request**: `{ examId: uuid }`
- **Response**: `{ exam: { score_pct, correct_count, total_questions, exam_type }, items: [{ user_answer, is_correct, flagged, position, questions: { id, question_text, correct_answer, rationale, topic, option_a..d } }] }`
- **Errors**: 404 not found · 409 results are only available after submission
- **Business rules**: the answer key and rationale are released only for a completed session owned by the caller; an expired session is finalised first.

## listExamHistory
- **Request**: `{ limit?: 1–50 (default 50) }` (strict: any other field, such as a user id, is rejected)
- **Response**: `{ exams: [{ id, examType, category, sessionType, completedAt, totalQuestions, correctCount, scorePct, scoreVerified, autoSubmitted }], verifiedCount, unverifiedCount, averageScorePct: number | null }`, newest first.
- **Errors**: 400 invalid input · 401 not signed in
- **Business rules**: only the caller's finished tests (`user_id` and `status = 'completed'` in the query). `averageScorePct` is the mean of `scorePct` over the returned tests whose `scoreVerified` is true, rounded to one decimal; `null` (never 0) when there is none. Tests whose score was never recomputed from the answer key (`unverifiedCount`) are listed but left out of the average. The dashboard and the Test History page both show this average; neither computes one.

