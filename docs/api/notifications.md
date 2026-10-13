# Notifications

Source: `src/functions/notifications.functions.ts` → `src/server/notifications/`. All functions are `POST`
(reads first deliver waiting notifications, ADR-0005), require a signed-in student, and act as **that
student** only: the user id comes from the verified token and schemas are strict, so no field can name
another student. Students cannot read or write the outbox or inbox tables. Rules: docs/formulas.md section 15.

## listNotifications

- **Request**: `{ unreadOnly?: boolean, limit?: 1–50 (default 20), offset?: 0–10,000 }`
- **Response**: `{ items: [{ id, kind, message, data, createdAt, readAt }], nextOffset: number | null }`, newest first. `kind` is one of `friend_request_received`, `friend_request_accepted`, `challenge_received`, `challenge_declined`; `data` holds the ids and usernames for that kind.
- **Errors**: 400 invalid input or offset out of range
- **Business rules**: waiting notifications are delivered first; if delivery fails the existing inbox is still returned. `message` carries usernames as plain text: escape it when displaying.

## getUnreadNotificationCount

- **Request**: `{}`
- **Response**: `{ unread: number }`
- **Business rules**: delivers waiting notifications first, as above.

## markNotificationsRead

- **Request**: `{ ids?: uuid[] (1–100) }`; no `ids` marks every unread notification
- **Response**: `{ marked: number }`
- **Errors**: 400 invalid input
- **Business rules**: ids that belong to another student, or are already read, are ignored and not counted.
