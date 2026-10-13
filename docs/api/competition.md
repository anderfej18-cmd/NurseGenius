# Competition (friends and friend challenges)

Source: `src/functions/competition.functions.ts` → `src/server/competition/`. All functions are `POST`,
require a signed-in student, and act as **that student** only: the user id comes from the verified token
and no request field can name another student (schemas are strict). Other students appear only as a
username. Students cannot read or write the underlying tables; every call goes through the server.
Rules: docs/formulas.md section 14.

## requestFriend

- **Request**: `{ username: string (1–50) }`
- **Response**: `{ friendshipId, status: "pending" | "accepted" }` (`accepted` when that student had already asked you)
- **Errors**: 400 empty or over-long username, or your own · 404 no student has that username · 409 already friends, or a request is already waiting · 429 friend limit or too many requests waiting

## respondToFriendRequest

- **Request**: `{ friendshipId: uuid, accept: boolean }`
- **Response**: `{ outcome: "accepted" | "declined" }`
- **Errors**: 404 no such waiting request addressed to you (a request made by you, someone else's, or one already answered all look the same) · 429 friend limit (yours or theirs)

## removeFriend

- **Request**: `{ friendshipId: uuid }`
- **Response**: `{ removed: true }`
- **Errors**: 404 not a friendship or request of yours
- **Business rules**: ends a friendship, or withdraws a request you made. Challenges already set are not cancelled.

## listFriends

- **Request**: `{ kind: "friends" | "incoming" | "outgoing", limit?: 1–50, offset?: 0–10000 }`
- **Response**: `{ items: [{ friendshipId, username, since }], nextOffset: number | null }`, newest first. `incoming` are requests waiting for you, `outgoing` requests you made.

## createFriendChallenge

- **Request**: `{ friendshipId: uuid, examType?: "RN" | "RM" }` (defaults to the profile's preference)
- **Response**: `{ challengeId }`
- **Errors**: 400 exam type undecided (profile says Both or nothing), or no questions available · 404 not an accepted friendship of yours · 429 too many challenges waiting
- **Business rules**: the server draws the questions; the opponent is the other student in the friendship; it closes after 7 days.

## declineFriendChallenge

- **Request**: `{ challengeId: uuid }`
- **Response**: `{ declined: true }`
- **Errors**: 404 not a challenge made to you, or already started or declined

## startFriendChallenge

- **Request**: `{ challengeId: uuid }`
- **Response**: `{ examId, totalQuestions }`; the session is then taken with the ordinary session functions (`getExamSession`, `saveExamAnswer`, `submitExamSession`)
- **Errors**: 404 not your challenge · 409 you already finished it, it was declined or expired, or you have another exam in progress · 429 your tier's allowance for today is used up
- **Business rules**: asking again returns the session already running.

## getFriendChallenge

- **Request**: `{ challengeId: uuid }`
- **Response**: `{ id, role: "challenger" | "opponent", opponentUsername, examType, totalQuestions, createdAt, expiresAt, examId: string | null, state }` where `state` is one of `{ status: "not_started" | "in_progress" | "waiting_for_opponent" | "declined" | "expired" }` or `{ status: "completed", winner: "you" | "opponent" | "draw", you: { correct, scorePct }, opponent: { correct, scorePct } }`
- **Errors**: 404 not your challenge
- **Business rules**: the opponent's result is returned only once you have finished your own session.

## listFriendChallenges

- **Request**: `{ limit?: 1–50, offset?: 0–10000 }`
- **Response**: `{ items: [<same shape as getFriendChallenge>], nextOffset: number | null }`, newest first
