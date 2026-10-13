# Architecture Decision Records

Format: MADR (see the architect skill's `adr-guide.md`). Never delete an ADR; supersede it with a new one.

| ADR                                               | Title                                                                                          | Status   | Date       |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------- | -------- | ---------- |
| [0001](0001-server-function-layering.md)          | Server functions, controllers, services and repositories                                       | Accepted | 2026-10-06 |
| [0002](0002-derived-learning-state.md)            | Learning state is derived from attempt history, not accumulated                                | Accepted | 2026-10-06 |
| [0003](0003-intelligence-seams.md)                | Where the intelligence engines have seams, and where they do not                               | Accepted | 2026-10-06 |
| [0004](0004-server-derived-engagement-events.md)  | XP, achievements and challenges are paid by the server from recorded facts                     | Accepted | 2026-10-06 |
| [0005](0005-notification-outbox.md)               | Notifications are written by the database and delivered by the server                          | Accepted | 2026-10-07 |
| [0006](0006-ask-ai-stays-an-edge-function.md)     | `ask-ai` stays a Supabase Edge Function, but authorises and reads question data itself         | Accepted | 2026-10-09 |
| [0007](0007-database-rate-limiter.md)             | Rate limiting uses a fixed-window counter in Postgres                                          | Accepted | 2026-10-09 |
| [0008](0008-privileged-reads-and-tier-grants.md)  | Privileged reads go through server functions; paid tiers are granted by the central admin only | Accepted | 2026-10-09 |
| [0009](0009-shared-tests-are-a-layered-domain.md) | Shared tests become a layered domain with atomic database operations and rate limits           | Accepted | 2026-10-09 |
| [0010](0010-response-headers-and-tracked-env.md)  | The Worker sets its own security headers; `.env` stays tracked but is guarded                  | Accepted | 2026-10-09 |
| [0011](0011-ai-explains-measured-facts.md)        | AI phrases measured facts; it never measures, scores or decides                                | Accepted | 2026-10-09 |
| [0012](0012-live-tests-and-admin-privacy.md)      | Live tests are scheduled and timed by the database; student data belongs to the central admin  | Accepted | 2026-10-12 |
