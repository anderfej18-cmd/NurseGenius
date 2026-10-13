# Question reports

Source: `src/functions/reports.functions.ts` → `src/server/reports/`. Table `question_reports`.
Reasons: `incorrect_answer`, `bad_question`, `duplicate`, `unclear`, `wrong_topic`, `typo`, `other`
(`src/lib/report-reasons.ts`).

## createQuestionReport

- **Authorization**: signed-in student
- **Request**: `{ questionId: uuid, reason, details?: string ≤ 1000 }`
- **Response**: `{ ok: true }`
- **Errors**: 404 unknown question · 409 you already have an open report with this reason for this question · 429 more than 20 reports today (UTC)
- **Business rules**: the reporter is always the caller; `status` starts `open` and cannot be supplied.

## listMyQuestionReports

- **Request**: `{ limit?: 1–50, offset? }` → **Response**: `{ items: [{ id, questionId, reason, details, status, resolutionNote, createdAt, resolvedAt, question: { question_text } }], nextOffset }` (own reports, newest first; no key, no reporter ids)

## adminListQuestionReports

- **Authorization**: admin
- **Request**: `{ status?: "open"|"resolved"|"dismissed", limit?, offset? }`
- **Response**: the report fields plus `reporterId` and the full question including `correct_answer` and `rationale`, newest first.

## resolveQuestionReport

- **Authorization**: admin
- **Request**: `{ reportId: uuid, status: "resolved"|"dismissed", note?: string ≤ 1000 }`
- **Response**: `{ ok: true }`
- **Errors**: 404 unknown report · 409 already handled
- **Business rules**: one guarded update (`WHERE status = 'open'`) records `resolved_by` and `resolved_at`, so two admins cannot both resolve the same report.
