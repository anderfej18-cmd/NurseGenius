# Leaderboard and user directory

Source: `src/functions/leaderboard.functions.ts`, `src/functions/user-directory.functions.ts` →
`src/server/leaderboard/`, `src/server/user-directory/`. Both are `POST`, require a signed-in user, and read through SQL
functions only the service role can execute (ADR-0008).

## getLeaderboard

- **Authorization**: any signed-in student.
- **Request**: `{ period: "daily" | "weekly" }` (strict).
- **Response**: `{ period, entries: [{ rank, username, avgScore, attempted, correct, activeDays: number | null, isYou }] }`. At most 50 (daily) or 100 (weekly) entries, ranked by the database. **No user ids**: `isYou` marks the caller's row. A student without a username is shown as `Anonymous`.
- **Rules**: daily needs 100 or more answers today (UTC); weekly needs 100 or more on at least 4 of 7 days. Legacy scores written by the old browser client age out of both windows within a week of deployment (see `docs/audits/fix-pass.md`, historical scores).
- **Errors**: 400 invalid input · 401 not signed in.

## getUserDirectory

- **Authorization**: admin (`is_any_admin`), otherwise 403.
- **Request**: `{ limit?: 1–50 (default 20), offset?: 0–10,000 }`.
- **Response**: `{ users: [{ username, tier }], nextOffset: number | null, totals: { novice, erudite, scholar, all } }`.
- **Rules**: a username and a tier only: no email, name, id, expiry or usage. Ordered by lower-case username, then id.
- **Errors**: 400 invalid input or offset out of range · 403 not an admin.
