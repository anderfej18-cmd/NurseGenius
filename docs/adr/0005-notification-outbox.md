# ADR-0005: Notifications are written by the database and delivered by the server

## Status

Accepted

## Date

2026-10-07

## Decision Drivers

- A notification must not be lost when the change it reports commits, and must not exist when the change rolls back.
- Telling a student must never make the friend or challenge action fail.
- The platform has no job runner, so delivery cannot rely on a scheduler (see ADR-0004).
- The roadmap asks for an outbox and a provider interface, so email or push can be added later.

## Considered Options

1. **Application code writes the notification** after each action: can be lost between the two writes.
2. **Triggers write an outbox row** in the same transaction; the server delivers later (chosen).
3. **Realtime or database webhooks** to an external sender: needs infrastructure that cannot be verified here.

## Decision Outcome

**Chosen option**: 2.

- AFTER triggers on `friendships` and `friend_challenges` insert into `notification_outbox`. The row exists exactly when the change does.
- `NotificationService.dispatch` claims a student's waiting rows (`SKIP LOCKED`, counted attempts, stale claims re-offered), gives each to every `NotificationProvider`, and marks only fully delivered rows. It runs on every read of the inbox (best effort), so no scheduler is needed; a later one can call the same method.
- `NotificationProvider` is a real seam because replacing or adding delivery is the stated requirement. There is one implementation, the in-app inbox, and no email or push stub.
- The inbox row reuses the outbox id, so delivering twice leaves one row.
- Students have no grants on either table; every read and write is a service-role function that names the student.

### Negative Consequences

- A notification appears on the student's next read, not instantly.
- Reading writes (the catch-up), so the read functions are `POST`.
- Rows given up on after `maxAttempts` stay in the outbox with their last error; nothing alerts anyone to them yet.

## Confirmation

`src/server/testing/notifications.test.ts` (triggers, claiming, staleness, privileges, cascade), `notification.service.test.ts` (all providers, partial failure, best-effort reads) and `notification.repository.test.ts`.
