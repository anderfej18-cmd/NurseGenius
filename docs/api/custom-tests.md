# Shared tests (custom tests)

Source: `src/functions/custom-tests.functions.ts` → `src/server/custom-tests/`. Admin-built tests that anyone with the link
can take. ADR-0009. Strict schemas everywhere (`src/functions/custom-tests.schemas.ts`).

## Admin functions (`POST`, admin only, 403 otherwise)
| Function | Request | Response | Rules |
|---|---|---|---|
| `createCustomTest` | `{ title ≤200, description ≤2000, examType, sourceMode: "existing"\|"upload", durationMinutes 10–180, expiresAt (future), tokenHash (SHA-256 hex of the link token), questions[1–250] }` | `{ id }` | Every question needs text, four options and an answer A–D (`questionIssues`). The test and its questions are stored in one transaction. The link token itself never reaches the server: only its hash. |
| `listCustomTests` | `{}` | the admin's tests, each with `question_count`, `analytics { participant_count, pass_count, fail_count, pass_pct, average_score }` and its best 100 finished `attempts` | Three queries however many tests there are. Pass mark 50%. |
| `republishCustomTest` | `{ testId, tokenHash, expiresAt (future) }` | `{ ok: true }` | 404 for a test the admin does not own. |
| `importCustomTestQuestions` | `{ testId, topic }` | `{ count }` | Copies each question into the bank once, for the test's owner, atomically. 404 if not the owner's. |

## Public functions (`POST`, no sign-in; the link token and the attempt key are the credentials)
| Function | Request | Response | Rules and errors |
|---|---|---|---|
| `getSharedTest` | `{ tokenHash }` | `{ expired: false, test, questions }` or `{ expired: true, test: null, questions: [] }` | Questions carry **no** answer key or rationale. 60 views a minute per address. |
| `startSharedTest` | `{ tokenHash, email, accessKey (32–256) }` | `{ attemptId, durationMinutes, totalQuestions, startedAt, accessKey }` | 20 starts an hour per address and 5 a day per email and test, else **429** with the wait. 400 bad email/link/key, 404 expired link. Only the SHA-256 of the key is stored. |
| `submitSharedTest` | `{ attemptId, accessKey, answers: [{ question_id, user_answer: A–D\|null }] ≤250 }` | `{ score, correct, total, results[] }` | Scored in the database from the stored key; a claimed score or correctness is not an input. Before the deadline at least 80% must be answered (400 says how many); after it anything is accepted. 409 if already submitted, 404 wrong key or attempt, 400 an answer for a question not in the test or repeated. 30 submits an hour per address. |

## Signed-in student
| Function | Request | Response | Rules |
|---|---|---|---|
| `claimSharedTestAttempt` | `{ attemptId, accessKey }` | `{ claimed: boolean }` | Links the attempt to the account whose email matches the one used; 404 wrong key, 403 other email or an attempt already linked to another account. |

Errors never contain database text: unexpected failures answer `Something went wrong. Please try again.`
