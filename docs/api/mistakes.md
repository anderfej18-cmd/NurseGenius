# Mistake bank

Source: `src/functions/mistakes.functions.ts` → `src/server/mistakes/`. Data: `user_question_stats`
(one row per student and question, updated when a session is submitted). No question is copied.

## listMistakes

- **Authorization**: signed-in student; returns only the caller's mistakes
- **Request**: `{ view?: "all"|"most_repeated"|"recent"|"repeatedly_failed" (default all), examType?, topic?, limit?: 1–50, offset?: 0–10,000 }`
- **Response**: `{ items: [{ questionId, examType, topic, misses, attempts, correct, lastMissedAt, lastAnswer, unresolved, answerWithheld, question: { question_text, option_a..d, correct_answer|null, rationale|null } }], nextOffset: number|null }`
- **Business rules**
  - `all`: every missed question, most recently missed first. `most_repeated`: most misses first. `recent`: missed in the last 7 days. `repeatedly_failed`: missed at least 2 times **and** still unresolved, most misses first. (Thresholds: `src/server/mistakes/mistake.config.ts`.)
  - `unresolved` means no correct answer has followed the most recent miss.
  - Only answered questions count as attempts.
  - The key and rationale are included because the student has already submitted these questions, **except** for a question that is part of their running exam: it comes back with `answerWithheld: true` and `null` key/rationale.
