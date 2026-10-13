# Control audit

Every interactive control in the application, traced from the screen to what it does: its handler, the
backend call it makes (a server function in `src/functions`, an Edge Function, or the browser Supabase
client under row-level security), and what the person sees on success and on failure.

Method: each file that holds a button, link, form or input was read (`grep -rlE "onClick=|onSubmit=|<Link|<Button"
src/routes src/components`, 85 files outside `components/ui/`), and each control's handler followed to its
call. Every server function named below is imported from `src/functions/*.functions.ts`, so `tsc` proves it
exists; the route and function map is in `docs/ROUTE_MAP.md`.

What this audit does **not** prove: nothing here was run against a real Supabase project, the Edge Functions
(`ai-insight`, `ask-ai`) are not deployed, Paystack was not called, and migrations `20261009100000`,
`…100600`, `…100700`, `20261012100000` and `20261012100100` are not applied. The harness (`visual/`)
shows how each control looks and which state it leads to with fixture data; it does not show that the
backend accepts the call. "Failure" below is the behaviour in the code, exercised in the harness where a
fixture-less call rejects with the server's safe message.

Legend: **SF** server function · **EF** Edge Function · **DB** browser Supabase client (RLS) · **nav** client
navigation only.

## Public pages

### Landing `/` (`routes/index.tsx`, `components/landing/*`)

| Control                                                                             | Handler                                                 | Backend               | Result                                                                                                                                                |
| ----------------------------------------------------------------------------------- | ------------------------------------------------------- | --------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| Brand link (nav, footer)                                                            | `<Link to="/">`                                         | nav                   | Top of the landing page                                                                                                                               |
| Section links (How it works, Practice, Progress, Plans, FAQ) in nav and phone sheet | `<a href="#id">`; the sheet closes through `SheetClose` | nav                   | Scrolls to `#how-it-works`, `#practice`, `#progress`, `#plans`, `#faq`; all five ids exist (`HowItWorks`, `Practice`, `Mastery`, `PlansTable`, `Faq`) |
| Footer explore links (8)                                                            | `<a href="#id">` from `FOOTER_LINKS`                    | nav                   | Eight anchors, the ids above plus `#pathways`, `#ai`, `#plan`; all exist                                                                              |
| Get started (nav, hero, final CTA, footer "Create account")                         | `<Link to="/auth" search={{mode:"signup"}}>`            | nav                   | `/auth` on the Create account tab                                                                                                                     |
| Sign in (nav, final CTA, footer, phone sheet)                                       | `<Link to="/auth">`                                     | nav                   | `/auth` on the Sign in tab                                                                                                                            |
| Explore features (hero)                                                             | `<a href="#how-it-works">`                              | nav                   | Scrolls to How it works                                                                                                                               |
| Go to dashboard (when signed in; nav, hero, final CTA, footer)                      | `<Link to="/dashboard">`                                | nav                   | `/dashboard`                                                                                                                                          |
| Open menu (below 1024px)                                                            | `Sheet` trigger                                         | none                  | Sheet with the section links                                                                                                                          |
| Plans table                                                                         | `listPublicPlans` on mount                              | SF (public by design) | Plans from the database; a failure shows the table's own error state, never invented prices                                                           |
| Skip to content                                                                     | `<a href="#main">`                                      | nav                   | Focus moves to `<main id="main">`                                                                                                                     |

A signed-in person with an unfinished profile is sent to `/onboarding` by an effect in `Index`.

### Sign in and sign up `/auth` (`routes/auth.tsx`)

| Control                       | Handler                                                     | Backend       | Result                                                                                                                                       |
| ----------------------------- | ----------------------------------------------------------- | ------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign in / Create account tabs | `Tabs defaultValue={mode ?? "signin"}`                      | none          | Switches the form; `?mode=signup` preselects                                                                                                 |
| Email, Password fields        | controlled `useState`; `validateCredentials`                | none          | Field errors with the first invalid field focused; nothing is sent while invalid                                                             |
| Show / Hide password          | `PasswordInput` toggles `type`, `aria-pressed`              | none          | Reveals the text; paste is never blocked                                                                                                     |
| Sign in (submit)              | `supabase.auth.signInWithPassword`                          | Supabase Auth | Success: the effect in `AuthPage` sends the person to `/admin`, `/dashboard` or `/onboarding`. Failure: `describeAuthError` text in an Alert |
| Create account (submit)       | `supabase.auth.signUp` with `emailRedirectTo: /onboarding`  | Supabase Auth | Success Alert "Account created…"; failure Alert                                                                                              |
| Continue with Google          | `supabase.auth.signInWithOAuth` (`redirectTo: /onboarding`) | Supabase Auth | Redirects to Google; a failure Alert and the button re-enabled                                                                               |
| Shared-test email notice      | reads `sessionStorage` `ng.sharedTestAttempt`               | none          | Prefills the email and shows the Alert; a parse failure clears it                                                                            |

### First-run profile `/onboarding` (`routes/onboarding.tsx`)

| Control                          | Handler                       | Backend                                                                                                    | Result                                                                                                                                                                   |
| -------------------------------- | ----------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| First, Last, Username, Exam date | controlled; `validateProfile` | none                                                                                                       | Field errors; the first invalid field is focused                                                                                                                         |
| Exam preference (RN / RM / Both) | `RadioGroup onValueChange`    | none                                                                                                       | Sets `pref`                                                                                                                                                              |
| Save and continue                | `submit`                      | DB: `profiles.update(...).eq("id", user.id)`; then SF `claimSharedTestAttempt` if a shared test is pending | Success: `refresh()`, toast, `/dashboard`. Username taken: field error `USERNAME_TAKEN`. Other failure: Alert. A claim failure still saves the profile and shows a toast |
| Already onboarded                | effect                        | SF `claimSharedTestAttempt` (if pending)                                                                   | Claims, then `/dashboard`                                                                                                                                                |
| Signed out                       | effect                        | none                                                                                                       | `/auth`                                                                                                                                                                  |

### Shared test `/test/$token` (`routes/test.$token.tsx`, `components/shared-test/*`)

| Control                                            | Handler                                                       | Backend                                | Result                                                                         |
| -------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------- | ------------------------------------------------------------------------------ |
| Page load                                          | SHA-256 of the token in the browser, then `getSharedTest`     | SF (public, token hash only)           | States `live`, `upcoming` (countdown), `closed`; a failure toast and the shell |
| Resume                                             | `getSharedAttempt` with the stored attempt key                | SF (public, key checked on the server) | Resumes in progress, or shows the stored result                                |
| Email + Start the test                             | `TestGate.submit`; `createShareToken`, then `startSharedTest` | SF                                     | Starts the attempt on the server clock; failure toast and the gate stays       |
| Countdown reaching zero (upcoming)                 | `onArrive`                                                    | SF `getSharedTest`                     | Reloads the state and opens the gate                                           |
| Option rows, Flag, Previous, Next, Questions sheet | `TestRunner` state                                            | SF `saveSharedAnswer` per change       | Saved; a failed save shows one toast and the final submit resends everything   |
| Review and submit, confirm                         | `handIn`                                                      | SF `submitSharedTest`                  | Score and review; failure toast, then the page asks the server what it holds   |
| Time reaches zero                                  | effect calls `handIn` once                                    | SF `submitSharedTest`                  | Hands in by itself                                                             |
| AI help on a finished question                     | `QuestionHelp`                                                | EF `ask-ai`                            | Explanation, or the function's safe message                                    |
| Complete profile (signed in, not onboarded)        | `saveForSignIn`, then `/onboarding`                           | none                                   | Stores the attempt key for the claim                                           |
| Complete profile (signed out)                      | `<Link to="/auth" onClick={saveForSignIn}>`                   | none                                   | Sign in, then the claim                                                        |
| Claim on sign-in                                   | effect                                                        | SF `claimSharedTestAttempt`            | Linked, or a plain message (different or unconfirmed email, or already owned)  |

### 404 and error pages (`components/StatusPages.tsx`)

| Control                 | Handler                   | Backend | Result                                                       |
| ----------------------- | ------------------------- | ------- | ------------------------------------------------------------ |
| Go to the home page     | `<Link to="/">`           | nav     | Landing page                                                 |
| Go to your dashboard    | `<Link to="/dashboard">`  | nav     | Dashboard; a signed-out visitor is sent to `/auth` by `_app` |
| Try again (route error) | `onRetry` from the router | none    | Re-renders the route                                         |

## Application shell (`routes/_app.tsx`, `components/app/*`)

| Control                                           | Handler                                                                                       | Backend                          | Result                                                                                          |
| ------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------- | ----------------------------------------------------------------------------------------------- |
| Sidebar links, phone menu links, bottom bar items | `NavLink` from `navigationFor()` (`lib/navigation.ts`)                                        | nav                              | Each item points at a registered route (`navigation.test.ts`); the phone sheet closes on choice |
| More (bottom bar), menu button (top bar)          | `onOpenMenu`                                                                                  | none                             | Opens the menu sheet                                                                            |
| Brand link (top bar, phone only)                  | `<Link to="/">`                                                                               | nav                              | Landing page                                                                                    |
| Notification bell                                 | `<Link to="/notifications">`; count from `getUnreadNotificationCount` every 60s while visible | SF                               | Badge with the count; a failed count is simply not shown                                        |
| Account menu: Profile, Upgrade                    | `<Link>` and `setOpen(false)`                                                                 | nav                              | `/profile`, `/payments`                                                                         |
| Account menu: Light / Dark / System               | `ThemeControl` → `useTheme().setPreference`                                                   | none (`localStorage` `ng.theme`) | Applies at once; pressing the chosen option again keeps it                                      |
| Account menu: Sign out                            | `signOut()` then `navigate("/")`                                                              | Supabase Auth                    | Signed out and sent to the landing page                                                         |
| Signed out on any `_app` page                     | effect                                                                                        | none                             | `/auth`                                                                                         |
| Not onboarded (non-admin)                         | effect                                                                                        | none                             | `/onboarding`                                                                                   |

## Student pages

### Dashboard `/dashboard`

| Control                              | Handler                                                                                                                                        | Backend     | Result                                                                         |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------- | ------------------------------------------------------------------------------ |
| Take a test                          | `<Link to="/exam/start">`                                                                                                                      | nav         | Start flow                                                                     |
| Today's recommendation: start        | `<Link to="/exam/start" search={planBlockSearch(block)}>`                                                                                      | nav         | Start flow with the block preset                                               |
| Start practising (no plan)           | `<Link to="/exam/start">`                                                                                                                      | nav         | Start flow                                                                     |
| View Study Today / History / Mastery | `<Link>`                                                                                                                                       | nav         | `/today`, `/history`, `/mastery`                                               |
| A recent test row                    | `<Link to="/exam/$examId/results">`                                                                                                            | nav         | Results                                                                        |
| Data                                 | `getDailyRecommendation`, `listExamHistory`, `getExamReadiness`, `getTopicMastery`, `getStudyPlan`, `getStudyStreak`, `getGamificationSummary` | SF          | Each section has loading, empty and error states (`LoadFailed` with Try again) |
| Live profile refresh                 | `supabase.channel(...)` on `profiles`                                                                                                          | DB realtime | Refreshes the profile; the channel is removed on unmount                       |

### Take a test `/exam/start`

| Control                      | Handler                                     | Backend                           | Result                                                                                                                                                                                                                                                        |
| ---------------------------- | ------------------------------------------- | --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Programme (RN / RM)          | `ProgrammeStep` → `changeProgramme`         | none                              | Resets the topic; counts load per programme                                                                                                                                                                                                                   |
| Topic list and search        | `TopicStep` (`onValueChange`, `setQuery`)   | SF `getTopicCounts` per programme | A topic with no questions falls back to all areas with a note; Try again on a failed load                                                                                                                                                                     |
| How questions are chosen     | `SelectionStep`                             | none                              | Sets `selection`; fixed to "similar" when opened from a question                                                                                                                                                                                              |
| Number of questions, minutes | `Slider`s → `changeCount` / `changeMinutes` | none                              | Count clamped to the plan's limit (`sessionLimitFor`); minutes follow the count until chosen                                                                                                                                                                  |
| Start the test               | `start()`                                   | SF `startExamSession`             | Success: `/exam/$examId`; fewer questions than asked shows an info toast. Failure: message and code in the summary panel (the upgrade link shows for plan-limit errors). Disabled with a visible reason while loading, on a failed load, or with no questions |
| Upgrade link in the summary  | `<Link to="/payments">`                     | nav                               | Payments                                                                                                                                                                                                                                                      |

### Test in progress `/exam/$examId`

| Control                                             | Handler                                                       | Backend                | Result                                                                                         |
| --------------------------------------------------- | ------------------------------------------------------------- | ---------------------- | ---------------------------------------------------------------------------------------------- |
| Load                                                | `getExamSession`                                              | SF                     | A finished test redirects to its results; failure shows an empty state with a dashboard button |
| Option rows A to D (and keys A to D)                | `setAnswer`                                                   | SF `saveExamAnswer`    | Saved; a failed save shows an Alert with Try saving again, and the failed input is kept        |
| Confidence                                          | `setConfidence`                                               | SF `saveExamAnswer`    | Same                                                                                           |
| Flag for review (and key F)                         | `toggleFlag`                                                  | SF `saveExamAnswer`    | Same                                                                                           |
| Previous, Next (and arrow keys)                     | `goTo`                                                        | none                   | Records time on the question, scrolls to the top                                               |
| Question navigator (side panel, bottom sheet)       | `goTo`                                                        | none                   | Jumps to the question                                                                          |
| Submit (header) / Review and submit (last question) | `setConfirming(true)`; enabled by `submitUnlocked` (80% rule) | none                   | Opens the confirmation dialog                                                                  |
| Confirm submit                                      | `submit()`                                                    | SF `submitExamSession` | `/exam/$examId/results`; failure toast and the dialog stays                                    |
| Time reaches zero                                   | effect calls `submit()`                                       | SF `submitExamSession` | Hands in by itself, whatever the 80% rule says (a deadline is not a choice)                    |
| Keyboard                                            | `keydown` ignored while typing, in a dialog or submitting     |                        | Documented in the footer text on wide screens                                                  |

### Results `/exam/$examId/results`

| Control                                                     | Handler                                                                    | Backend     | Result                                                                                             |
| ----------------------------------------------------------- | -------------------------------------------------------------------------- | ----------- | -------------------------------------------------------------------------------------------------- |
| Load                                                        | `getExamResults`                                                           | SF          | Failure shows Try again and Test history                                                           |
| Filter (all / wrong / flagged)                              | `setFilter`                                                                | none        | Filters the list; a filter with no rows offers "Show all"                                          |
| Take another test                                           | `<Link to="/exam/start" search={{examType}}>`                              | nav         | Start flow                                                                                         |
| Test history                                                | `<Link to="/history">`                                                     | nav         | History                                                                                            |
| Practise a weak topic                                       | `<Link to="/exam/start" search={{examType, topic, selection:"adaptive"}}>` | nav         | Start flow preset                                                                                  |
| Practise my mistakes                                        | `<Link … selection:"mistakes">`                                            | nav         | Start flow preset                                                                                  |
| Bookmark                                                    | `addBookmark`                                                              | SF          | Toast; the button disables once saved                                                              |
| Report a problem                                            | dialog → `createQuestionReport`                                            | SF          | Toast; failure toast                                                                               |
| Explain / Simplify / Compare / Why was I wrong? / follow-up | `QuestionHelp.ask`                                                         | EF `ask-ai` | The answer appended on screen (not stored); the official rationale shows when the AI cannot answer |
| Ask AI (toggle) / Similar questions (toggle)                | `toggle("ai" \| "similar")`                                                | none        | Shows `QuestionHelp` or `SimilarQuestions`                                                         |
| Similar questions                                           | `getSimilarQuestions` when opened                                          | SF          | List with reasons, a link to practise them; Try again on failure                                   |
| Copy question                                               | `navigator.clipboard.writeText`                                            | none        | Toast; a failure toast says to copy by hand                                                        |

### Study Today `/today`, Study Plan `/plan`, Mastery `/mastery`, Analysis `/analysis`

| Control                                           | Handler                                                   | Backend                                                | Result                                                                                 |
| ------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------ | -------------------------------------------------------------------------------------- |
| Minutes available (Select)                        | `setMinutes`                                              | none                                                   | Reloads the recommendation for that length                                             |
| Plan block: Practise                              | `<Link to="/exam/start" search={planBlockSearch(block)}>` | nav                                                    | Start flow preset                                                                      |
| Upgrade link (daily limit reached)                | `<Link to="/payments">`                                   | nav                                                    | Payments                                                                               |
| Daily challenge: Start / Continue / View result   | `go()`                                                    | SF `startDailyChallenge`, or nav to results            | `/exam/$examId` or the result; failure toast                                           |
| Save exam date                                    | `saveDate`                                                | SF `setExamDate`, then `plan.reload()` and `refresh()` | Toast; failure toast                                                                   |
| Plan form: programme, daily minutes, days, target | `validatePlanSettings`; submit `savePlan`                 | SF `createStudyPlan`                                   | Toast "created / updated"; field errors with focus; disabled until an exam date exists |
| Plan week blocks: Practise                        | `<Link to="/exam/start" search={…}>`                      | nav                                                    | Start flow preset                                                                      |
| Mastery RN / RM tabs                              | `Tabs onValueChange`                                      | SF `getTopicMastery` (shared cache)                    | Switches the list                                                                      |
| Analysis: Start practising                        | `<Link to="/exam/start">`                                 | nav                                                    | Start flow                                                                             |
| Insight cards                                     | `getAiInsight`; Refresh button `insight.reload()`         | SF → EF `ai-insight`                                   | AI-assisted or computed summary, labelled; "unavailable" is shown plainly              |

### Topics `/topics`, History `/history`, Mistake Bank `/mistakes`, Bookmarks `/bookmarks`

| Control                          | Handler                                                                    | Backend                                | Result                         |
| -------------------------------- | -------------------------------------------------------------------------- | -------------------------------------- | ------------------------------ |
| Topics RN / RM tabs              | `setExamType`                                                              | SF `getTopicCounts`, `getTopicMastery` | Switches the list              |
| Practise this topic              | `<Link to="/exam/start" search={{examType, topic, selection:"adaptive"}}>` | nav                                    | Start flow preset              |
| History row                      | `<Link to="/exam/$examId/results">`                                        | nav                                    | Results                        |
| History Try again, Take a test   | `history.reload()`, `<Link>`                                               | SF `listExamHistory`, nav              | Reload; start flow             |
| Mistakes tabs (all / unresolved) | `setView`                                                                  | SF `listMistakes`                      | Re-lists                       |
| Practise my mistakes             | `<Link to="/exam/start" search={{selection:"mistakes"}}>`                  | nav                                    | Start flow preset              |
| Load more                        | `list.loadMore()`                                                          | SF (offset paging)                     | Appends the next page          |
| Bookmark a mistake               | `addBookmark`                                                              | SF                                     | Toast; button disables         |
| Similar questions (toggle)       | `setShowSimilar`                                                           | SF `getSimilarQuestions`               | As above                       |
| Bookmark note: Save              | `addBookmark({ questionId, note })`                                        | SF                                     | Toast "Note saved"             |
| Remove bookmark                  | `removeBookmark`                                                           | SF                                     | Removes the row; failure toast |
| Open the Mistake Bank            | `<Link to="/mistakes">`                                                    | nav                                    | Mistakes                       |

### Friends `/friends`, Leaderboard `/leaderboard`, Notifications `/notifications`, Achievements `/achievements`

| Control                      | Handler                                         | Backend                    | Result                                                                     |
| ---------------------------- | ----------------------------------------------- | -------------------------- | -------------------------------------------------------------------------- |
| Add friend (username)        | `requestFriend`                                 | SF                         | Toast "Request sent" or "You are now friends"; lists reload; failure toast |
| Accept / Decline request     | `respondToFriendRequest`                        | SF                         | Lists reload; failure toast                                                |
| Withdraw request             | `removeFriend`                                  | SF                         | Lists reload                                                               |
| Challenge a friend           | `createFriendChallenge`                         | SF                         | Toast "Challenge sent"                                                     |
| Remove friend (confirmed)    | `ConfirmDialog` → `removeFriend`                | SF                         | Lists reload                                                               |
| Challenge: Start / Continue  | `startFriendChallenge`, then `/exam/$examId`    | SF                         | Opens the shared question set; failure toast                               |
| Challenge: Decline           | `declineFriendChallenge`                        | SF                         | Lists reload                                                               |
| Challenge: View my result    | `<Link to="/exam/$examId/results">`             | nav                        | Results                                                                    |
| Leaderboard period           | `setPeriod`; `getLeaderboard`                   | SF                         | Reloads; Try again on failure                                              |
| Notifications: Mark all read | `markRead()`                                    | SF `markNotificationsRead` | List and bell update; failure toast                                        |
| Notification: Open friends   | `<Link to="/friends" onClick={markRead([id])}>` | SF, nav                    | Marks that one read, opens Friends                                         |
| Notifications: Load more     | `list.loadMore()`                               | SF                         | Appends                                                                    |
| Achievements                 | read only (`getGamificationSummary`)            | SF                         | No actions; Try again on failure                                           |

### Profile `/profile`, Payments `/payments`

| Control                   | Handler                                               | Backend                                                                                          | Result                                                                                                                                                                  |
| ------------------------- | ----------------------------------------------------- | ------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Change exam date          | `<Link to="/plan">`                                   | nav                                                                                              | Plan page                                                                                                                                                               |
| See plans and payments    | `<Link to="/payments">`                               | nav                                                                                              | Payments                                                                                                                                                                |
| Theme (account menu)      | see Application shell                                 | none                                                                                             |                                                                                                                                                                         |
| Pay with Paystack         | `pay(plan)`: `loadPaystack()` then the Paystack popup | Paystack inline script; on success `fetch("/api/public/paystack-verify")` with the session token | Verified server-side; toast with the access end date; `refresh()` and the payment history reload. No public key: toast "Payments are not configured yet". Failure toast |
| Payment history           | `supabase.from("subscription_payments")`              | DB (RLS: own rows)                                                                               | Table, or an error state                                                                                                                                                |
| Telegram and e-mail links | `<a href="https://t.me/nursegenius">`, `mailto:`      | external                                                                                         | Opens the contact channel                                                                                                                                               |

## Admin `/admin?tab=…` (`routes/_app/admin.tsx`, `components/admin/*`)

The page itself has no controls: the shell sidebar and phone menu list the tabs; a tab the person may not
open falls back to the first one they may (`resolveAdminTab`). The server and RLS check every action again.

| Tab             | Control                                                               | Handler                                        | Backend                                                                | Result                                                                                                    |
| --------------- | --------------------------------------------------------------------- | ---------------------------------------------- | ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| Questions       | Counts Try again                                                      | `counts.reload()`                              | SF `getTopicCounts`                                                    | Reload                                                                                                    |
| Questions       | Add one question                                                      | `AddQuestionForm.submit`                       | SF `adminCreateQuestion`                                               | Toast; "Choose or name a subcategory first" blocks an empty destination                                   |
| Questions       | Import file                                                           | `ImportQuestionsSection`                       | SF `adminImportQuestions`                                              | Toast with the count; a file with no complete questions says so; a partial failure reports what was saved |
| Questions       | Subcategories: add, rename, delete (confirmed)                        | `SubtopicManager`                              | SF `adminCreateSubtopic`, `adminRenameSubtopic`, `adminDeleteSubtopic` | List reloads; failure toast                                                                               |
| Question bank   | Filters, Load more                                                    | `adminListQuestions` (cursor)                  | SF                                                                     | Pages in                                                                                                  |
| Question bank   | Edit, Save                                                            | `adminUpdateQuestion`                          | SF                                                                     | Toast "Saved"                                                                                             |
| Question bank   | Retire (confirmed) / Restore                                          | `adminRetireQuestion` / `adminRestoreQuestion` | SF                                                                     | Toast; row updates                                                                                        |
| Reports         | Status tabs, Resolve, Dismiss                                         | `decide()` → `resolveQuestionReport`           | SF                                                                     | Toast; row leaves the list                                                                                |
| Live tests      | Create (form: title, programme, topics and counts, minutes, schedule) | `CreateTestForm` → `createCustomTest`          | SF                                                                     | Toast "The test is live"; the link appears; validation blocks submit                                      |
| Live tests      | Copy link                                                             | `ShareLink.copy`                               | none (clipboard)                                                       | Toast, or a plain failure note                                                                            |
| Live tests      | Republish (dialog)                                                    | `republishCustomTest`                          | SF                                                                     | New link and schedule                                                                                     |
| Live tests      | Add questions (dialog)                                                | `importCustomTestQuestions`                    | SF                                                                     | Toast with added and skipped counts                                                                       |
| Live tests      | Try again                                                             | `tests.reload()`                               | SF `listCustomTests`                                                   | Reload                                                                                                    |
| Audit           | Scan again                                                            | `scan.reload()`                                | SF                                                                     | Reload                                                                                                    |
| Audit           | Fix (dialog)                                                          | `BrokenQuestionDialog` → `adminUpdateQuestion` | SF                                                                     | Toast "Question repaired"                                                                                 |
| Audit           | Retire / Delete (both confirmed)                                      | `adminRetireQuestion`, `adminDeleteQuestion`   | SF                                                                     | Toast; row leaves. Delete is refused by the database for a question that has been used                    |
| Leaderboards    | Period                                                                | `LeaderboardTable`                             | SF `getLeaderboard`                                                    | Reloads                                                                                                   |
| Payments        | Try again                                                             | `payments.reload()`                            | DB `subscription_payments` + `profiles`                                | Reload (central admin only; sub-admins lost this read in migration `20261012100000`)                      |
| Pricing         | Edit price and days, Save                                             | `PricingTab.onSubmit`                          | DB `plans.update`                                                      | Toast; Save disabled until something changed                                                              |
| Users           | Assign tier (dialog)                                                  | `AssignTierDialog`                             | DB `rpc("assign_user_tier")`                                           | Toast; days validated first                                                                               |
| Users           | Reset to Novice (confirmed)                                           | `UsersTab`                                     | DB `rpc("assign_user_tier")`                                           | Toast                                                                                                     |
| Admin access    | Grant / Revoke (confirmed)                                            | `AdminAccessTab`                               | DB `user_roles.insert` / `.delete`                                     | Toast; list reloads                                                                                       |
| Sub-admin users | Load more                                                             | `list.loadMore()`                              | SF `getUserDirectory` (masked emails)                                  | Appends                                                                                                   |

## Findings

- **No dead controls found.** Every button, link and form above reaches a handler and from there either
  navigation to a registered route or a call that is imported and type-checked. The navigation and
  route-access tests already fail if a menu item or an admin component points at nothing.
- **Direct browser Supabase calls remain** in `UsersTab`, `AssignTierDialog`, `AdminAccessTab`,
  `PaymentsTab`, `PricingTab`, onboarding and the payment history. They rely on row-level security and the
  `assign_user_tier` function, are listed in `route-access.test.ts`, and are recorded as an open decision
  (audited server functions for role and tier changes) in the progress notes and ADR list.
- **Not verifiable here:** the AI calls (`ask-ai`, `ai-insight`), Paystack, and every call that needs the
  unapplied migrations. Their failure states were seen in the harness; their success paths were not seen
  against a real backend.
