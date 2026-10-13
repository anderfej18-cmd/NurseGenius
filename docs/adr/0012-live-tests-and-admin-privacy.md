# ADR-0012: Live tests are scheduled and timed by the database; student data belongs to the central admin

## Status

Accepted

## Date

2026-10-12

## Decision Drivers

- Sub-admins were meant to manage questions and tests only, but the database still let any admin read every exam, payment, receipt and shared-test attempt (with its email). The screens hid it; the policies did not (ADR-0008 closed only tier grants and two directories).
- A shared test had no start time, so there was no pre-start state and its questions were readable as soon as the link existed. After the deadline anything was still scored, and answers lived only in the browser, so the timer was advisory.
- The bank workflow sent every eligible question, key included, to the browser and picked there; the pool could not be allocated per subcategory in one authoritative place.
- A guest attempt could use Ask AI with only the attempt key, and linking an attempt to an account trusted an email address.
- Imports could duplicate questions and left no record; questions could not be deleted for good.

## Decision Outcome

1. **Student data is the central admin's.** `exams`, `subscription_payments`, `payment_receipts` (read and update) and shared-test attempts and answers are readable by the owner of the row and the central admin only. Sub-admins keep question content, subtopics, their own live tests, and the username-and-tier directory (through a server function). The test owner reads results through the server, which masks emails for sub-admins; the central admin sees full addresses.
2. **Live tests extend the shared-test domain**; no second feature. `custom_tests` gains `starts_at` and `share_token` (the link, readable only by admin server functions); answers gain `flagged`. The window is `starts_at` to `expires_at` (10 minutes to 90 days); each candidate has `duration_minutes` from their own start.
3. **The database owns the clock and the draw.** `get_shared_test_state` says upcoming, live or closed by `now()`; `start_shared_attempt` refuses outside the window; `save_shared_answer` stores each answer as it is chosen and refuses after the deadline plus a 15 second grace; `submit_shared_attempt` scores the submitted answers before the deadline and only the saved ones after it; `get_shared_attempt` resumes an attempt and closes an overdue one from its saved answers. `create_live_test` draws `count` random questions per subcategory from active, complete questions and refuses a count above the pool, naming the subcategory. The questions are copied into the test, so later bank edits do not change it.
4. **Rankings after close only.** `list_test_attempts` returns finished attempts only for tests whose window has closed, and only to the owner or the central admin. Unsubmitted attempts past their time are closed and scored when the list is read, so they count.
5. **Account conversion.** `claimSharedTestAttempt` needs the attempt key (this device took the test), an account email the identity provider has confirmed (read with the admin API, never from the request), and that address equal to the one the test was taken with. Ask AI for a shared attempt works only once the attempt is linked to an account (`get_explainable_shared_question` requires `user_id`), so guests get none.
6. **Imports are explicit, de-duplicating and audited.** `import_live_test_questions` copies only uploaded (custom) questions, into an exam type and subcategory chosen at import time, skips text the bank already holds (ignoring case and spacing) and repeats within the test, and writes to `admin_audit_log`. Creation, republishing, imports and permanent deletes are audited.
7. **Permanent delete** (`admin_delete_question`) works only for a question no student has answered, with a full copy in the audit log; anything else is retired. The browser asks for the word DELETE first.

### Negative Consequences

- A migration that drops `create_custom_test`, `import_custom_test_to_bank` and `list_custom_test_summaries` needs the new application build in the same window (no zero-downtime order, as in `docs/deployment.md` section 2).
- A guest's answers are saved on the server before they have an account; their address is stored with the attempt as before.
- "Confirmed email" is only as strong as the project's Auth setting: if sign-up auto-confirms addresses, an unproven address counts as confirmed. The owner must check that email confirmation is on.
- The central admin can read every candidate's address and every student's payments; that is the point, and it should be a person the business trusts.

## Validation

`admin-privacy-and-question-audit.test.ts` (policies, sub-admin bypass attempts, delete and audit), `live-tests.test.ts` (schedule, allocation, snapshot, save and deadline, resume, scoring, lists, rankings, republish, import), the service, repository, controller and schema tests, `custom-test-form-limits.test.ts` (the form's limits equal the server's), and the rollback and types contract tests.
