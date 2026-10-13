# Public plans

Source: `src/functions/plans.functions.ts` → `src/server/plans/` (controller, service, repository). Shared shape:
`src/lib/plans.ts`. Added with the landing page redesign (2026-10-11).

## Public function (`POST`, no sign-in)

| Function          | Request                              | Response                                                           | Rules                                                                                                                                                                                                                                                                                                             |
| ----------------- | ------------------------------------ | ------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `listPublicPlans` | `{}` (strict: any field is rejected) | `PublicPlan[]`: `{ name, priceNgn, durationDays }`, cheapest first | Active plans only. Explicit columns (`name, price_ngn, duration_days`), never `*`. A row that cannot be a real offer (negative or non-finite price, length under one day or not a whole number) is left out. An empty table gives `[]`, not an error. A failure answers `Something went wrong. Please try again.` |

**Why it is public.** The landing page shows what each plan costs to visitors who have no account. The database
already lets an anonymous visitor read these rows (policy `anyone reads active plans`,
`20260813023337_*.sql`), so the function exposes nothing new; it exists so the browser does not call the
database itself (`src/lib/route-access.test.ts`: "anything new belongs in a server function"). No rate limit is
applied: nothing private is read and the response is a handful of rows. If that changes, add the limiter used by
the shared-test functions (ADR-0007).

**Who uses it.** `components/landing/PlansTable.tsx`. The Upgrade page (`/payments`) still reads `plans`
directly with the signed-in session (listed in `route-access.test.ts`) because it also needs each plan's id for
checkout.

**What the page does when it fails.** The price and access cells say "Shown after you sign in"; the limits
(which come from `src/lib/exam-rules.ts`, not the database) are always shown. The Novice plan reads "Free" in
every case.

Tests: `plans.service.test.ts` (ordering, filtering, empty, failure) and `plans.repository.test.ts` (columns,
filter, order, mapping, bad rows, database errors).
