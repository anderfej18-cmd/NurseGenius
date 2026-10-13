# Integration map: admin management, live tests and the public CBT (2026-10-12)

Inspected before any change: the redesign plan, `FEATURE_INVENTORY.md`, `ROUTE_MAP.md`, `docs/api/custom-tests.md`,
ADR-0008 and ADR-0009, all 40 migrations (replayed in the PGlite harness to read the effective policies and
grants), the shared-test service, repository, controller and SQL, `/test/$token`, the claim flow in `/auth` and
`/onboarding`, and the admin tabs. Migration status: `docs/deployment.md` records that nothing from
`20261006200000` on has been applied to the live database by this project. There is no access to the live
database from here, so that record was not re-checked; new migrations are additive and come after the last file.

## What exists and is reused

| Brief item                                                                 | Already there                                                                                                                     |
| -------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------- |
| Users tab with totals and Novice / Erudite / Scholar groups                | `UsersTab` (central) and `SubAdminUsersTab` (usernames only, through `getUserDirectory`)                                          |
| Only the central admin assigns or revokes tiers                            | `assign_user_tier` checks `central_admin` in SQL (ADR-0008, PGlite test)                                                          |
| Assign Admin with username search and admin count                          | `AdminAccessTab`; `user_roles` writes are central-admin only by policy                                                            |
| Sub-admins open the panel and the shared bank                              | `ADMIN_TABS` access levels; `adminListQuestions` checks `is_any_admin`                                                            |
| Detect missing text, options, answer key                                   | `questionIssues` (also the server's create and update check) and the Broken Questions tab                                         |
| Edit a question                                                            | `adminUpdateQuestion`                                                                                                             |
| Bank or TXT source, 250 cap, 10 to 180 minutes, snapshot of questions      | `create_custom_test` copies every question into `custom_test_questions`, so later bank edits do not change a test                 |
| Unique link, expiry, rate limits, email to start, scoring in SQL, 50% pass | `custom_tests.token_hash`, `submit_shared_attempt`, `list_custom_test_summaries`                                                  |
| Results with rationales, AI help only for signed-in onboarded students     | `SharedTestResult`                                                                                                                |
| Guest attempt joined to an account                                         | `claimSharedTestAttempt`: needs the attempt key held by the device that took the test and a signed-in account with the same email |
| Republish, Add to Question Bank (once per question), participant counts    | `republishCustomTest`, `import_custom_test_to_bank`, summaries                                                                    |

## Gaps found

1. **Sub-admin privacy in the database.** Policies still let any admin read `exams`, `subscription_payments`,
   `payment_receipts` (and update receipts) and every `custom_test_attempts` row with its email. The screens
   hide these from sub-admins; the database does not.
2. **Shared-test timer.** After the deadline, `submit_shared_attempt` scores whatever answers are sent, so a
   late submission gets unlimited time. Answers live only in the browser until submit.
3. **No schedule.** A test is live from creation until expiry; there is no start time, so no pre-start state,
   and the questions are readable as soon as the link exists.
4. **Questions chosen in the browser.** The bank workflow downloads every eligible question with its key and
   picks in the browser; there is no per-subcategory count.
5. **Links cannot be shown again.** Only the hash is stored, so an admin cannot see a test's link later.
6. **Imports can duplicate.** `import_custom_test_to_bank` also copies questions that came from the bank, and
   does not skip text already in the bank. Nothing is audited.
7. **No permanent delete, no malformed-record checks** beyond missing fields.
8. **Claim trusts an unconfirmed email.** The attempt key is required, but the account's email is not checked
   as confirmed.
9. **Analytics are owner-only and rankings show while a test is still open.** Attempts abandoned before submit
   never count.

## Decisions (where the brief leaves a choice)

- **One feature, not two.** "Create a Test" becomes "Create Live Test"; the existing domain, tables and
  public page are extended, not duplicated.
- **Permanent delete** only for a question no student has answered (`exam_answers` keeps history and has no
  cascade). A used question can only be retired; the dialog says so. Every delete is written to a new
  `admin_audit_log` with a full copy of the deleted row.
- **Links are stored** (`custom_tests.share_token`), readable only through admin server functions, so the list
  can show every test's link. The link is the credential candidates are given anyway; the hash stays the lookup.
- **Schedule:** start time, live window (10 minutes to 90 days) and exam duration (10 to 180 minutes). A
  candidate may start only inside the window; each attempt then has the full duration. Questions are not sent
  before the start.
- **Server-side answers:** each answer is saved as it is chosen and refused after the attempt's deadline
  (15 seconds of grace for the network). A submission after the deadline is scored from saved answers only.
  Unsubmitted attempts past their deadline are closed and scored when analytics are read.
- **Selection in SQL:** the bank workflow sends `{ topic, count }` per subcategory; the database picks at random
  from active, complete questions and refuses a count larger than the pool. A TXT file with more than 250 valid
  questions is sampled to 250 at random in the browser before upload (the server still caps at 250).
- **Visibility:** the central admin sees every test and full participant emails; a sub-admin sees their own
  tests with participant emails masked (`a•••@example.com`), enforced in the service.
- **Rankings** are shown once a test's window has closed; while live, only counts.
- **Import** is for TXT questions only, to an exam type and a subcategory chosen at import time; questions whose
  text already exists in that exam type's bank are skipped and reported; each import is audited.

## Phases and where each change lands

| Phase | Database (new migration)                                                                                | Server                                                                         | Interface                                                      |
| ----- | ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------------------------- |
| 1     | `…_admin_privacy_and_question_audit`: central-only policies, `admin_audit_log`, `admin_delete_question` | `adminDeleteQuestion`; emails masked for sub-admins                            | Audit & Fix tab (malformed checks, delete), typed confirmation |
| 2     | `…_live_tests`: `starts_at`, `share_token`, `create_live_test` (allocations), republish with schedule   | `createCustomTest` takes a schedule and allocations; token made on server      | Create Live Test form                                          |
| 3     | `save_shared_answer`, deadline-aware submit, attempt read-back, finaliser                               | `getSharedTest` states, `saveSharedAnswer`, `getSharedAttempt`, verified claim | Public CBT: countdown, navigator, flags, resume                |
| 4     | all-tests summaries for the central admin, audited, de-duplicating import                               | list for central and owners, rankings after close                              | Analytics, republish, import dialog                            |
| 5     | PGlite tests for every rule                                                                             | service and controller tests                                                   | four checks, scanners, screenshots                             |

Nothing here is applied, deployed or committed. Applying the migrations and deploying need the owner.
