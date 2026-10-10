# Question catalog

Source: `src/functions/questions.functions.ts` → `src/server/questions/`. Schema:
`supabase/migrations/20261006200000_question_catalog_and_profile_lockdown.sql`.

Students can no longer read `correct_answer` or `rationale` from the database at all (column
privileges), so these functions are the only way to read questions with metadata filters.

## listQuestions
- **Authorization**: signed-in student
- **Request**: `{ examType, topics?: string[≤50], subtopicIds?: uuid[≤50], yearFrom?, yearTo?, difficulty?: ("easy"|"medium"|"hard")[], limit?: 1–50 (default 20), cursor?: uuid }`
- **Validation**: strict; years 1900–2100 and `yearFrom ≤ yearTo` (else 400); `status` and any answer-key switch are not accepted
- **Response**: `{ items: [{ id, exam_type, topic, subtopic_id, year, difficulty, tags, status, source, updated_at, question_text, option_a..d }], nextCursor: uuid|null }`
- **Business rules**: active questions only, ordered by id (keyset pagination, one extra row fetched to detect the next page), explicit column list without the key. Filters combine with AND. The list is the raw bank: sessions additionally exclude incomplete questions.

## getTopicCounts
- **Request**: `{ examType }` → **Response**: `{ [topic]: count }` of active questions, from one grouped query.

## adminListQuestions
- **Authorization**: admin (`is_any_admin`), otherwise 403
- **Request**: as `listQuestions` plus `status?: "active"|"retired"|"all"` (default active) and `limit` up to 500
- **Response**: `{ items: [... same fields plus correct_answer, rationale], nextCursor }`
- **Business rules**: the only path that returns the answer key; used by the admin screens for the question picker, available-count and broken-question inspector.

## Admin content management

Source: `src/server/questions/question-admin.*`. Migration
`supabase/migrations/20261006201100_admin_content_management.sql` removes every client write on
`questions` (table grants and the three admin RLS write policies), so these functions are the only way to
add or change a question, for admins and sub-admins alike. Every function: **Authorization**: admin
(`is_any_admin`) else 403, checked before anything else; strict schemas; the admin's id comes from the token
and is stored as `created_by`. Question content is validated with the same rules the app uses everywhere
(`questionIssues`): a stem that is only a number, a blank option or an answer outside A–D is refused. Blank
content passes the schema on purpose so the answer can say *which* part of *which* question is missing.

| Function | Request | Response | Errors / rules |
|---|---|---|---|
| `adminCreateQuestion` | `{ examType, topic, content }` | `{ created: 1 }` | 400 incomplete question or blank topic |
| `adminImportQuestions` | `{ examType, topic, questions: content[1–500] }` | `{ created: n }` | 400 names up to five problems (`Question 7 is missing: OPTION C.`); **all or nothing**, one insert |
| `adminUpdateQuestion` | `{ questionId, content?, difficulty?: easy\|medium\|hard\|null, tags?: string[≤10, each ≤40], source?: string≤200\|null, subtopicId?: uuid\|null }` | `{ updated: true }` | 400 nothing to change, incomplete content, or a subtopic of another exam type or topic · 404 question or subtopic not found. `content` is the whole question (the rationale is kept only if sent) |
| `adminRetireQuestion` | `{ questionId }` | `{ status: "retired" }` | 404. Students no longer receive it; past attempts stay valid |
| `adminRestoreQuestion` | `{ questionId }` | `{ status: "active" }` | 404 |
| `adminListSubtopics` | `{ examType, topic? }` | `[{ id, examType, topic, name }]` (≤500) | |
| `adminCreateSubtopic` | `{ examType, topic, name (1–120) }` | the subtopic | 400 blank or long name · 409 the name exists under that exam type and topic |
| `adminRenameSubtopic` | `{ subtopicId, name }` | `{ renamed: true }` | 404 · 409 name taken |
| `adminDeleteSubtopic` | `{ subtopicId }` | `{ deleted: true }` | 404. Its questions stay and lose the link |

There is **no function that deletes a question**: retiring keeps every attempt, bookmark and report valid.
No subtopic is created for the admin; the table stays empty until an admin adds one.
