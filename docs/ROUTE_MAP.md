# Route and page map

Every page of the site, who may open it, how a person reaches it, and what data it needs from which
backend function. Built from the route files in `src/routes/` on 2026-10-09. The navigation itself is one list,
`src/lib/navigation.ts`; tests in `src/lib/navigation.test.ts` and `src/lib/route-access.test.ts` keep this
map, the buttons and the route files in step. For what each feature is and how far it works, see
[FEATURE_INVENTORY.md](FEATURE_INVENTORY.md).

## Access levels

| Level | Meaning |
|---|---|
| Public | Anyone, signed in or not. |
| Signed in | Redirects a visitor to `/auth`. A student who has not finished onboarding is sent to `/onboarding` (pages using `SignedInPage`, and the dashboard). |
| Admin | `isAdmin` (role `admin` or `central_admin`); anyone else is sent to `/dashboard`. Tabs marked central need `central_admin`. |

The screen only decides what to show. Every server function checks the caller again (`requireSupabaseAuth`, and
`is_any_admin` / role checks for admin actions), so a hand-typed address or a forged request gets nothing.

## Pages

| Path | Page | Access | Navigation button | Data it needs | Supplied by |
|---|---|---|---|---|---|
| `/` | Landing | Public | logo | whether signed in | `useAuth` |
| `/auth` | Sign in / sign up | Public | "Sign In" (signed out) | – | Supabase Auth (browser) |
| `/onboarding` | First-run profile | Signed in | none (automatic) | own profile; a pending shared-test attempt | `useAuth`; saves with a direct own-row update; `claimSharedTestAttempt` |
| `/dashboard` | Dashboard | Signed in | Learn ▸ Dashboard | plan, allowance; recent tests and verified average; topic levels | `useAuth` profile; `listExamHistory`; `getTopicMastery` |
| `/today` | Study Today | Signed in | Learn ▸ Study Today | today's plan, AI/computed explanation, streak, daily challenge | `getDailyRecommendation`; `getAiInsight(recommendation)`; `getStudyStreak`; `getDailyChallenge`, `startDailyChallenge` |
| `/exam/start` | Take a Test | Signed in | Learn ▸ Take a Test | topics, tier limits; optional presets in the address (`topic`, `selection`, `examType`, `similarTo`) | `getTopicCounts` (via `hooks/topic-data`); `lib/exam-rules`; saves with `startExamSession` |
| `/topics` | Topics | Signed in | Learn ▸ Topics | topic counts for RN or RM; level per topic | `getTopicCounts`; `getTopicMastery` |
| `/plan` | Study Plan | Signed in | Learn ▸ Study Plan | the plan, its progress, exam date, explanation | `getStudyPlan`, `createStudyPlan`, `setExamDate`; `getAiInsight(plan)` |
| `/exam/$examId` | A test in progress | Signed in | Take a Test stays lit | questions without answers, server clock, saved answers | `getExamSession`, `saveExamAnswer`, `submitExamSession` |
| `/exam/$examId/results` | Results | Signed in | Review ▸ Test History stays lit | score, answers, rationales, why each question was chosen; help, similar questions, bookmark, report | `getExamResults`; Edge `ask-ai`; `getSimilarQuestions`; `addBookmark`; `createQuestionReport` |
| `/history` | Test History | Signed in | Review ▸ Test History | finished tests and the verified average | `listExamHistory` |
| `/mistakes` | Mistake Bank | Signed in | Review ▸ Mistake Bank | unresolved mistakes by filter; similar questions | `listMistakes`; `addBookmark`; `getSimilarQuestions` |
| `/bookmarks` | Bookmarks | Signed in | Review ▸ Bookmarks | saved questions and notes | `listBookmarks`, `addBookmark`, `removeBookmark` |
| `/mastery` | Mastery & Readiness | Signed in | Insights ▸ Mastery & Readiness | readiness (RN/RM), mastery by topic, confidence, pace, explanation | `getExamReadiness`; `getTopicMastery`; `getConfidenceAnalytics`; `getTimeAnalytics`; `getAiInsight(readiness)` |
| `/analysis` | Performance Analysis | Signed in | Insights ▸ Performance Analysis | trends, repeated mistakes, overdue reviews, pace, explanation | `getPerformanceAnalysis`; `getAiInsight(performance)` |
| `/achievements` | Achievements | Signed in | Insights ▸ Achievements | level, XP, achievements | `getGamificationSummary` |
| `/friends` | Friends & Challenges | Signed in | Community ▸ Friends & Challenges | friends, requests, challenges | `listFriends`, `requestFriend`, `respondToFriendRequest`, `removeFriend`, `listFriendChallenges`, `createFriendChallenge`, `startFriendChallenge`, `declineFriendChallenge` |
| `/leaderboard` | Leaderboard | Signed in | Community ▸ Leaderboard | today's ranking | `getLeaderboard(daily)` |
| `/notifications` | Notifications | Signed in | bell icon in the header (with unread count) | inbox | `listNotifications`, `markNotificationsRead`, `getUnreadNotificationCount` |
| `/profile` | Profile | Signed in | Account ▸ Profile | own profile, plan, today's use, tier limits | `useAuth` profile; `lib/exam-rules` |
| `/payments` | Upgrade | Signed in | Account ▸ Upgrade | plans, own payments, tier | direct reads of `plans` and own `subscription_payments`; Paystack checkout; `/api/public/paystack-verify` |
| `/test/$token` | Shared test | Public | none (opened from a link) | the test, the attempt, review after submitting | `getSharedTest`, `startSharedTest`, `submitSharedTest`, `claimSharedTestAttempt`; Edge `ask-ai` |
| `/progress` | (old address) | Public | none | – | redirects to `/today` so saved links keep working |
| `/admin?tab=questions` | Add Questions | Admin | Admin ▸ Add Questions | topic counts | `adminCreateQuestion`, `adminImportQuestions`, `getTopicCounts` |
| `/admin?tab=bank` | Question Bank | Admin | Admin ▸ Question Bank | questions with keys, subtopics | `adminListQuestions`, `adminUpdateQuestion`, `adminRetireQuestion`, `adminRestoreQuestion`, subtopic functions |
| `/admin?tab=reports` | Question Reports | Admin | Admin ▸ Question Reports | open, resolved and dismissed reports | `adminListQuestionReports`, `resolveQuestionReport` |
| `/admin?tab=custom-tests` | Create a Test | Admin | Admin ▸ Create a Test | own tests, question pool | `createCustomTest`, `listCustomTests`, `republishCustomTest`, `importCustomTestQuestions`, `adminListQuestions` |
| `/admin?tab=audit` | Broken Questions | Admin | Admin ▸ Broken Questions | all questions with keys | `adminListQuestions` |
| `/admin?tab=leaderboards` | Leaderboards | Admin | Admin ▸ Leaderboards | weekly ranking | `getLeaderboard(weekly)` |
| `/admin?tab=payments` | Upgrades | Central admin | Admin ▸ Upgrades | all payments | direct read of `subscription_payments` and `profiles` (RLS: admins) |
| `/admin?tab=pricing` | Pricing & Duration | Central admin | Admin ▸ Pricing & Duration | plans | direct read and update of `plans` (RLS: central admin) |
| `/admin?tab=users` | Users | Central admin | Admin ▸ Users | profiles, exams | direct reads; `assign_user_tier` (SQL checks the caller) |
| `/admin?tab=admin-access` | Assign Admin | Central admin | Admin ▸ Assign Admin | admins and roles | direct `user_roles` reads and writes (RLS: central admin) |
| `/admin?tab=sub-users` | Users | Admin who is not central | Admin ▸ Users | usernames, tiers, totals | `getUserDirectory` |
| `/api/public/paystack-verify` | (not a page) | token in header | none | – | Worker route; verifies with Paystack, then `activate_verified_subscription` |

An address like `/admin?tab=pricing` opened by an admin who may not use that tab shows the default tab
(`resolveAdminTab`), not the forbidden one.

## Navigation structure

Built by `navigationFor(viewer)`; shown nothing until the person is signed in and onboarded (an admin who has
not onboarded sees the Admin group only). Desktop: one menu per group in the header. Mobile: the menu button
opens a side sheet listing the same groups. The lit button follows the address (a test in progress keeps
"Take a Test" lit; a results page lights "Test History"; the admin tabs are told apart by `?tab=`).

| Group | Buttons |
|---|---|
| Learn | Dashboard · Study Today · Take a Test · Topics · Study Plan |
| Review | Test History · Mistake Bank · Bookmarks |
| Insights | Mastery & Readiness · Performance Analysis · Achievements |
| Community | Friends & Challenges · Leaderboard |
| Account | Profile · Upgrade (and the Notifications bell, kept in the header so it has one button, not two) |
| Admin (admins only) | Add Questions · Question Bank · Question Reports · Create a Test · Broken Questions · Leaderboards · then, for the central admin, Upgrades · Pricing & Duration · Users · Assign Admin; for other admins, Users |

States the header handles: signed out (Sign In button), still loading (no buttons, a placeholder bar),
signed in but the profile could not be loaded ("Account unavailable" badge, sign-out still works), not
onboarded (no menus), student (five groups), admin (six).

Reached from inside other pages, deliberately with no button of their own: AI question help, similar
questions, the daily challenge, bookmarks and reports from a question, challenging a friend.

## Gaps found while mapping

1. Pages that read the database directly (listed in [FEATURE_INVENTORY.md](FEATURE_INVENTORY.md)): `/payments`, `/onboarding`, `/admin` (four tabs), the sign-in session. Protected by row-level security, not by a server function.
2. The mistake bank cannot offer AI help (the item does not carry the exam id).
3. No screen edits name, username or exam preference after onboarding.
4. `listQuestions`, `listXpHistory`, `listMyQuestionReports`, `listDueReviews`, `getFriendChallenge` have no screen.
5. The 80% submit unlock is a screen rule the server does not enforce.
6. Nothing has been opened in a browser; every statement about how a page looks or behaves rests on code and the automated tests.
