# Feature inventory

Taken from the code on 2026-10-09 (routes, components, server functions, migrations), not from memory or
earlier plans. If a feature is not listed here it was not found. Companion documents:
[ROUTE_MAP.md](ROUTE_MAP.md) (every page, who may open it, what data it needs and which function supplies it)
and [audits/backend-finalization.md](audits/backend-finalization.md) (what was and was not verified).

## How to read the status

Nothing in this project has been run against a live Supabase project, Edge Function, Paystack account, AI
gateway or browser. "Working" therefore only ever means "working in the local test setup".

| Status | Meaning |
|---|---|
| **Working locally** | The server side is covered by automated tests (unit tests, or the real migrations replayed on PGlite) and the screen is wired to it and builds. Not seen in a browser. |
| **Partial** | Some of what a user would expect is missing; the missing part is named. |
| **Blocked (live)** | Cannot work, or cannot be verified, until something outside this repository exists: an applied migration, a deployed Edge Function, a key, a configured provider. |
| **Unverified** | The code exists but no automated check covers its behaviour. |

| Kind | Meaning |
|---|---|
| **Feature** | A user can reach and use it from a screen. |
| **Contextual** | Real, but appears inside another screen; it has no page of its own on purpose. |
| **API-only** | A server function exists and no screen calls it (listed in `src/functions/ui-coverage.test.ts` with the reason). |
| **Placeholder** | Reserved in the database or types; nothing creates or shows it. |

Every item below that touches the database needs the migrations in `supabase/migrations/` applied. The newest
two, `20261009100600_ai_insights.sql` and `20261009100700_selection_reasons.sql`, and the edit to
`20261009100000_rate_limits_and_ai_access.sql` have **not** been applied anywhere.

---

## 1. Authentication and account

| Feature | Page | Main code | Backend | Database | Kind / status | Notes |
|---|---|---|---|---|---|---|
| Sign up and sign in (email and password) | `/auth` | `routes/auth.tsx` | Supabase Auth, called from the browser | `auth.users`; `handle_new_user` creates the profile and role | Feature / **Unverified** | No test covers the screen. Live Supabase Auth needed. There is no password-reset or email-change screen. |
| Sign in with Google | `/auth` | `routes/auth.tsx` | Supabase Auth OAuth, returns to `/onboarding` | `auth.users` | Feature / **Blocked (live)** | Needs the Google provider configured in the Supabase project. |
| Sign out | header | `components/AppHeader.tsx` | Supabase Auth | – | Feature / **Unverified** | |
| Session, profile and role loading; lapsed plans expire | every page | `hooks/use-auth.tsx` | direct reads of own `profiles` and `user_roles`; `check_expire_tier` | `profiles`, `user_roles` | Feature / **Working locally** | Reads are limited to the person's own rows by row-level security (tested in `direct-browser-access.test.ts`). |
| First-run setup (names, username, exam date, RN/RM/Both) | `/onboarding` | `routes/onboarding.tsx` | direct update of own `profiles` row; then `claimSharedTestAttempt` if a shared test was taken first | `profiles` | Feature / **Working locally** | The database lets a student change only these columns, never plan or usage (tested). Username must begin with "Nurse". |

## 2. Dashboard and daily study

| Feature | Page | Main code | Backend | Database | Kind / status | Notes |
|---|---|---|---|---|---|---|
| Dashboard: plan, daily allowance, average score, strong and weak topics, recent tests | `/dashboard` | `routes/dashboard.tsx` | `listExamHistory` (new; the average is computed on the server), `getTopicMastery` | `exams`, `user_question_stats` | Feature / **Working locally** | Allowance is shown from the profile and the shared tier rules; the database enforces it. A live counter listens to changes of the person's own profile row. |
| Study Today: what to study today and why | `/today` | `components/progress/TodayPanel.tsx` | `getDailyRecommendation`, `getAiInsight` (kind `recommendation`) | `exams`, `user_question_stats`, `ai_insights` | Feature / **Working locally**; the AI wording is **Blocked (live)** | Without the deployed `ai-insight` function the page shows the computed summary, labelled as such. |
| Study streak | `/today` | `TodayPanel.tsx` | `getStudyStreak` | `get_study_days` | Feature / **Working locally** | |
| Daily challenge | `/today` | `TodayPanel.tsx` | `getDailyChallenge`, `startDailyChallenge` | `create_daily_challenge`, `get_daily_challenge_view`, `start_challenge_session` | Feature / **Working locally** | |

## 3. Question bank and topic browsing

| Feature | Page | Main code | Backend | Database | Kind / status | Notes |
|---|---|---|---|---|---|---|
| Topics: every topic with its question count, your level, and a Practise button | `/topics` (new) | `routes/topics.tsx`, `hooks/topic-data.ts` | `getTopicCounts`, `getTopicMastery` | `get_question_topic_counts` | Feature / **Working locally** | Counts active questions only. |
| Topic and area choice when starting a test | `/exam/start` | `routes/exam.start.tsx` | `getTopicCounts` through `hooks/topic-data.ts` (was a paged direct read) | same | Feature / **Working locally** | |
| Browsing individual questions | none | – | `listQuestions` | `questions` (answer key never granted to students) | **API-only** | Product decision recorded in `ui-coverage.test.ts`: students do not browse the bank; sessions choose questions on the server. |
| Subtopics | admin only | `components/admin/SubtopicManager.tsx` | `adminListSubtopics`, `adminCreateSubtopic`, `adminRenameSubtopic`, `adminDeleteSubtopic` | `subtopics` | Feature (admin) / **Working locally** | Students are not shown subtopics. |

## 4. Exams, practice and adaptive selection

| Feature | Page | Main code | Backend | Database | Kind / status | Notes |
|---|---|---|---|---|---|---|
| Start a test (RN/RM, area, size, minutes, how questions are chosen: random, adaptive, mistakes, revision due) | `/exam/start` | `routes/exam.start.tsx`, `lib/session-modes.ts`, `lib/start-search.ts` | `startExamSession` | `start_exam_session` (tier quotas enforced in SQL) | Feature / **Working locally** | Also opened with presets from other screens (topic, mode, "similar to this question"). |
| Adaptive selection with a reason per question | same | `AdaptiveSelectionService` | `startExamSession` | `record_selection_reasons`, `exam_answers.selection_reason` | Feature / **Working locally** | Needs migration `…100700` applied. Not AI-ranked: deterministic by design. |
| Taking a test: timer from the server, flag, confidence, auto-submit at the deadline | `/exam/$examId` | `routes/exam.$examId.index.tsx`, `ConfidencePicker.tsx` | `getExamSession`, `saveExamAnswer`, `submitExamSession` | `save_exam_answer`, `submit_exam_session` | Feature / **Working locally** | "Submit unlocks at 80% answered or 80% of the time" is a **screen rule only**; the server does not enforce it (documented in `docs/api/sessions.md`). |
| Shared tests taken without an account | `/test/$token` | `routes/test.$token.tsx` | `getSharedTest`, `startSharedTest`, `submitSharedTest`, `claimSharedTestAttempt` | `custom_tests`, `custom_test_attempts`, `submit_shared_attempt` | Feature / **Working locally** | Result can be linked to an account afterwards. |
| Hints during a test | none | – | `saveExamAnswer` accepts a hint event | `hints_used` | **Placeholder** | By decision no mode allows live hints; help is after submission only. |
| Session types `practice`, `mock_exam`, `timed_exam` | none | `lib/session-modes.ts` | – | `exams.session_type` | **Placeholder** | Reserved in the database; nothing creates them. |

## 5. Results, rationales and review

| Feature | Page | Main code | Backend | Database | Kind / status | Notes |
|---|---|---|---|---|---|---|
| Results with correct answers and rationales (released only after submission) | `/exam/$examId/results` | `routes/exam.$examId.results.tsx` | `getExamResults` | `exam_answers`, `questions` | Feature / **Working locally** | Answer-reveal rule is enforced on the server. |
| Why each question was chosen | same | same | `getExamResults` (`selection_reason`) | `exam_answers.selection_reason` | Contextual / **Working locally** | Empty for tests started before the column existed. |
| Test history: every finished test, with the verified average | `/history` (new) | `routes/history.tsx`, `lib/history-view.ts` | `listExamHistory` (new) | `exams` | Feature / **Working locally** | Latest 50. Tests whose score was never checked against the answer key show "Not verified" and are left out of the average. |
| Copy a question | results | `exam.$examId.results.tsx` | – | – | Contextual / **Unverified** | Browser clipboard. |

## 6. Progress, mastery, readiness and performance

| Feature | Page | Main code | Backend | Database | Kind / status | Notes |
|---|---|---|---|---|---|---|
| Mastery by topic | `/mastery` (was a tab of `/progress`) | `progress/MasteryPanel.tsx` | `getTopicMastery` | `get_student_attempts` | Feature / **Working locally** | |
| Exam readiness estimate, with time assessed and change | `/mastery` | `MasteryPanel.tsx` | `getExamReadiness`, `getAiInsight` (kind `readiness`) | `readiness_snapshots`, `record_readiness_snapshot` | Feature / **Working locally**; AI wording **Blocked (live)** | Needs migration `…100600`. Says "not enough data" rather than a number when evidence is thin. |
| Confidence and pace | `/mastery` | `MasteryPanel.tsx` | `getConfidenceAnalytics`, `getTimeAnalytics` | `exam_answers` | Feature / **Working locally** | |
| Performance analysis: trends, repeated mistakes, overdue reviews, pace | `/analysis` (new page; was the Analysis tab) | `progress/AnalysisPanel.tsx` | `getPerformanceAnalysis`, `getAiInsight` (kind `performance`) | `get_student_attempts`, `ai_insights` | Feature / **Working locally**; AI wording **Blocked (live)** | |

## 7. AI study recommendations (explanations of measured facts)

| Feature | Page | Main code | Backend | Database | Kind / status | Notes |
|---|---|---|---|---|---|---|
| AI-assisted explanation card for four kinds: recommendation, readiness, plan, performance | `/today`, `/mastery`, `/plan`, `/analysis` | `components/InsightCard.tsx`, `lib/insight-view.ts` | `getAiInsight` → Worker computes facts → Edge Function `ai-insight` → grounding check | `ai_insights` (one row per student and kind) | Contextual / **Working locally** with fake model output; **Blocked (live)** | The card says "AI-assisted" only when the model's text passed the grounding check; otherwise "Computed summary". Per-student limits 3 a minute and 40 a day. Design: ADR-0011. |

## 8. AI question assistance

| Feature | Page | Main code | Backend | Database | Kind / status | Notes |
|---|---|---|---|---|---|---|
| Explain, simplify, compare options, "why was I wrong", bounded follow-up | inside results and shared-test review | `components/QuestionHelp.tsx`, `lib/ask-ai.ts` | Edge Function `ask-ai` (called by the browser with the student's session) | `get_explainable_exam_question`, `get_explainable_shared_question` | Contextual / **Working locally** (policy and handler tests); **Blocked (live)** | After submission only (SQL-enforced). No page of its own, deliberately: help needs a finished test. Not offered on the Mistake Bank screen (it does not carry the exam id). |

## 9. Study plans

| Feature | Page | Main code | Backend | Database | Kind / status | Notes |
|---|---|---|---|---|---|---|
| Create or update a weekly plan; items show why they are there; weeks already done are kept | `/plan` (new page; was a tab) | `progress/PlanPanel.tsx` | `getStudyPlan`, `createStudyPlan`, `getAiInsight` (kind `plan`) | `study_plans` | Feature / **Working locally**; AI wording **Blocked (live)** | Completion comes from verified answers; there is no manual tick. |
| Edit the exam date | `/plan` | `PlanPanel.tsx` | `setExamDate` | `profiles.exam_date` | Feature / **Working locally** | Must be in the future and within two years. |

## 10. Similar questions

| Feature | Page | Main code | Backend | Database | Kind / status | Notes |
|---|---|---|---|---|---|---|
| Questions like one you answered, and "Practise these" | inside results and the Mistake Bank | `components/SimilarQuestions.tsx`, `lib/similar-view.ts` | `getSimilarQuestions`, then `startExamSession` in `similar` mode | `questions`, `user_question_stats` | Contextual / **Working locally** | Ranked by metadata and wording overlap, not embeddings. Needs a question as its starting point, so it has no page of its own. |

## 11. Mistake Bank and bookmarks

| Feature | Page | Main code | Backend | Database | Kind / status | Notes |
|---|---|---|---|---|---|---|
| Questions you got wrong and have not since answered correctly | `/mistakes` | `routes/mistakes.tsx`, `QuestionPreview.tsx` | `listMistakes`, `addBookmark` | `exam_answers`, `user_question_stats` | Feature / **Working locally** | Filters by tab. Practise-similar from each item. |
| Due-review questions | `/today`, `/exam/start` ("Revision due today") | `TodayPanel.tsx`, `exam.start.tsx` | `getDailyRecommendation`, `startExamSession` | `apply_review_states` | Contextual / **Working locally** | `listDueReviews` has no screen of its own (**API-only**). |
| Bookmarks with notes | `/bookmarks` | `routes/bookmarks.tsx` | `listBookmarks`, `addBookmark`, `removeBookmark` | `bookmarks` | Feature / **Working locally** | |

## 12. Streaks, challenges, achievements and leaderboards

| Feature | Page | Main code | Backend | Database | Kind / status | Notes |
|---|---|---|---|---|---|---|
| Level, XP and achievements | `/achievements` (new page; was a tab) | `progress/AchievementsPanel.tsx` | `getGamificationSummary` | `xp_events`, `user_achievements` | Feature / **Working locally** | `listXpHistory` (full ledger) has no screen (**API-only**). |
| Friends: add by username, accept, decline, remove | `/friends` | `routes/friends.tsx` | `requestFriend`, `respondToFriendRequest`, `removeFriend`, `listFriends` | `request_friend`, `respond_friend_request`, `list_friendships`, `remove_friendship` | Feature / **Working locally** | |
| Friend challenges: send, accept (starts the test), decline | `/friends` | `friends.tsx` | `createFriendChallenge`, `startFriendChallenge`, `declineFriendChallenge`, `listFriendChallenges` | `friend_challenges` functions | Feature / **Working locally** | `getFriendChallenge` (one challenge) is **API-only**. |
| Daily leaderboard | `/leaderboard` | `routes/leaderboard.tsx`, `LeaderboardTable.tsx` | `getLeaderboard` (daily) | `get_daily_leaderboard` | Feature / **Working locally** | Qualifies after 100 questions attempted that day. Students see the daily board only; the weekly board exists in the admin Leaderboards tab. |

## 13. Notifications and reminders

| Feature | Page | Main code | Backend | Database | Kind / status | Notes |
|---|---|---|---|---|---|---|
| In-app notifications: friend request received or accepted, challenge received or declined | `/notifications` and the bell in the header | `routes/notifications.tsx`, `NotificationBell.tsx` | `listNotifications`, `markNotificationsRead`, `getUnreadNotificationCount` | `notifications`, `notification_outbox` | Feature / **Working locally** | These four events are the only ones that create notifications. |
| Study reminders, email or push delivery | none | – | – | – | **Not present** | The earlier wording "reminders" does not describe anything in the code. |

## 14. Profile and preferences

| Feature | Page | Main code | Backend | Database | Kind / status | Notes |
|---|---|---|---|---|---|---|
| View profile, plan, today's use and limits | `/profile` (new) | `routes/profile.tsx`, `lib/profile-view.ts` | none beyond the signed-in profile (`useAuth`) | `profiles` | Feature / **Working locally** | Read-only. |
| Change exam date | `/plan` | `PlanPanel.tsx` | `setExamDate` | `profiles` | Feature / **Working locally** | |
| Change name, username, exam preference after onboarding | none | – | – | – | **Partial** | No function or screen edits them. The only preference stored beyond those is the plan's minutes a day, days a week and target. |

## 15. Admin dashboard and content

All admin tabs live on `/admin?tab=<id>` and are listed in the header's Admin menu (`lib/navigation.ts`). The
screen is for admins only; every action is also checked on the server.

| Tab (id) | Who | Main code | Backend | Database | Status | Notes |
|---|---|---|---|---|---|---|
| Add Questions (`questions`) | admin | `routes/admin.tsx` `QuestionsTab` | `adminCreateQuestion`, `adminImportQuestions`; direct count of questions | `questions` | **Working locally** | Text import parser is in the screen. |
| Question Bank (`bank`) | admin | `components/admin/QuestionBankTab.tsx` | `adminListQuestions`, `adminUpdateQuestion`, `adminRetireQuestion`, `adminRestoreQuestion` and the subtopic functions | `questions`, `subtopics` | **Working locally** | |
| Question Reports (`reports`) | admin | `components/admin/ReportsTab.tsx` | `adminListQuestionReports`, `resolveQuestionReport` | `question_reports` | **Working locally** | |
| Create a Test (`custom-tests`) | admin | `admin.tsx` `CustomTestsTab` | `createCustomTest`, `listCustomTests`, `republishCustomTest`, `importCustomTestQuestions` | `custom_tests`, `create_custom_test`, `import_custom_test_to_bank` | **Working locally** | Produces the `/test/$token` link. |
| Broken Questions (`audit`) | admin | `admin.tsx` `BrokenQuestionsTab` | `adminListQuestions` | `questions` | **Working locally** | Finds incomplete questions using `lib/questions.ts`. |
| Leaderboards (`leaderboards`) | admin | `admin.tsx` `LeaderboardsTab` | `getLeaderboard` | `get_weekly_leaderboard` | **Working locally** | |

## 16. Roles, permissions and user management

Roles are `central_admin`, `admin` and `user` (ADR-0008). The header shows the Admin group only to admins and
resolves the tabs by role (`adminTabsFor`).

| Tab (id) | Who | Backend | Status | Notes |
|---|---|---|---|---|
| Users (`users`) | central admin | direct reads of `profiles`, `exams`; `assign_user_tier` (SQL checks the caller) | **Working locally** | Direct from the browser; the database enforces who may do it (tested). To move to a server function. |
| Assign Admin (`admin-access`) | central admin | direct `user_roles` insert and delete | **Working locally** | Direct from the browser; row-level security allows only the central admin (tested). To move to a server function with an audit trail. |
| Users (`sub-users`) | admin who is not central | `getUserDirectory` | **Working locally** | Usernames and tiers with totals; no email, name, expiry or usage. |

## 17. Reports and resolution

| Feature | Page | Main code | Backend | Database | Kind / status | Notes |
|---|---|---|---|---|---|---|
| Report a question (reason and details) | results | `components/QuestionActions.tsx` | `createQuestionReport` | `question_reports` | Contextual / **Working locally** | Only on the results screen. |
| Your own reports | none | – | `listMyQuestionReports` | `question_reports` | **API-only** | No history screen. |
| Admin resolution | `/admin?tab=reports` | `ReportsTab.tsx` | `adminListQuestionReports`, `resolveQuestionReport` | `question_reports` | Feature / **Working locally** | |

## 18. Billing, subscriptions and payments

| Feature | Page | Main code | Backend | Database | Kind / status | Notes |
|---|---|---|---|---|---|---|
| Plans and prices; pay with Paystack; plan starts when the payment is verified | `/payments` ("Upgrade") | `routes/payments.tsx`, `lib/paystack.ts`, `lib/plan-view.ts` | direct read of `plans` and the person's own `subscription_payments`; checkout in the browser; verification by the Worker route `/api/public/paystack-verify` | `plans`, `subscription_payments`, `activate_verified_subscription` | Feature / **Working locally** (verification logic); checkout **Blocked (live)** | Needs `VITE_PAYSTACK_PUBLIC_KEY` in the browser and `PAYSTACK_SECRET_KEY` in the Worker. The plan's limits shown are read from the shared tier rules. |
| Payments list, prices, assigning a tier | `/admin?tab=payments`, `pricing`, `users` | `admin.tsx` | direct reads and writes limited by row-level security; `assign_user_tier` | `subscription_payments`, `plans` | **Working locally** | Central admin only (tested). |

## 19. Everything else

| Feature | Page | Main code | Notes |
|---|---|---|---|
| Landing page | `/` | `routes/index.tsx` | Public. Copy corrected on 2026-10-09: it had claimed an "80% completion guard" (a screen rule only), "weekly Top 10", Opay payment and "Gemini". |
| Not-found and error pages | any | `routes/__root.tsx` | |
| Rate limiter, response headers, environment checks | server | `src/server/rate-limit`, ADR-0007, ADR-0010 | Not user-facing. |

---

## Totals

- Pages a user can open from the navigation: 16 student pages plus 11 admin tabs (an ordinary admin sees 7 of them, the central admin 10).
- API-only functions with no screen: `getFriendChallenge`, `listDueReviews`, `listMyQuestionReports`, `listQuestions`, `listXpHistory`.
- Placeholders: live hints, session types `practice`, `mock_exam`, `timed_exam`.
- Not present: password reset, editing name or username, study reminders, email or push notifications, a student weekly leaderboard.

## Direct database calls still made by the browser

These are protected by row-level security and column grants rather than by a server function. They are listed in
`src/lib/route-access.test.ts`, which fails if a new one appears, and attacked in
`src/server/testing/direct-browser-access.test.ts`.

| File | Touches | Why it stays for now |
|---|---|---|
| `hooks/use-auth.tsx` | own `profiles` and `user_roles`; `check_expire_tier` | Loaded on every page before any server call. |
| `routes/onboarding.tsx` | own `profiles` (six columns) | Column grant limits what can be written. |
| `routes/payments.tsx` | `plans`, own `subscription_payments` | Read-only. |
| `routes/admin.tsx` | `exams`, `plans`, `profiles`, `questions`, `subscription_payments`, `user_roles`; `assign_user_tier` | Central-admin tabs. Candidates to move to server functions. |
| `routes/dashboard.tsx` | realtime on own `profiles` row | Refreshes the daily counter. |
