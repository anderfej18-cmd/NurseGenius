# ADR-0008: Privileged reads go through server functions; paid tiers are granted by the central admin only

## Status

Accepted

## Date

2026-10-09

## Decision Drivers

- Audit finding S3: the leaderboards and the sub-admin directory still worked in the code but not in the database. A security migration (2026-09-06) revoked `EXECUTE` on them from browser roles; the browser kept calling them, so both screens fail with "permission denied".
- Audit finding S4: `assign_user_tier` (and the unused `approve_receipt`) accepted any admin, though its own comment says "central_admin only".
- The leaderboard functions return other students' ids; the directory must show a username and a tier only.

## Evidence for the role model

- `20260718221639`: the function is commented "Assign tier (central_admin only)".
- `reset_user_to_novice` (`20260715104135`), the sibling tier function, already requires `central_admin`.
- Every other privileged table (`profiles` updates, `user_roles`, `plans`, `app_settings`, `admin_codes`) is `central_admin` only.
- `admin.tsx` shows the tier controls (the "Users" and "Upgrades" tabs) only when `isCentralAdmin`; sub-admins get the read-only "Users" tab.
- The roadmap describes the sub-admin view as a "username-only tier breakdown".

## Decision Outcome

1. **Tier grants** require `central_admin` in the database (`assign_user_tier`, `approve_receipt`). Sub-admins keep question management, shared tests and the read-only directory.
2. **Browser reads of privileged data go through server functions.** `getLeaderboard` and `getUserDirectory` call SQL functions that only `service_role` can execute. The leaderboard response replaces every user id with `isYou`; the directory returns `{ username, tier }` and per-tier totals, a page at a time, behind `assertAdmin`.
3. **Fitness test** `src/server/testing/browser-rpc-grants.test.ts` replays all migrations and fails if browser code calls a database function by a dynamic name or one that a signed-in student cannot execute. This is the root-cause guard for S3.
4. The live-update Realtime subscription on `exams` is dropped: since Milestone 1 a student can only see their own exam rows, so it no longer refreshed anyone's board. The board refreshes every 30 seconds while the page is visible.

### Negative Consequences

- A sub-admin who relied on assigning tiers can no longer do so; this is deliberate and matches the UI that never offered it.
- The old `get_subadmin_user_directory` is dropped (no caller can use it).

## Validation

`admin-access-and-directories.test.ts` (sub-admin refused, central admin allowed, leaderboard and directory not callable by browser roles), `browser-rpc-grants.test.ts`, and the service, repository and schema tests of the two functions.
