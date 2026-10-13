# Engagement

Source: `src/functions/engagement.functions.ts` → `src/server/engagement/`. All functions are `POST`,
require a signed-in student, and touch **only that student's** data: the user id comes from the verified
token and no request field can name another user (schemas are strict).

This page documents the study-plan functions. The streak, XP and daily-challenge functions are
described in docs/formulas.md (sections 10 to 12).

## getStudyPlan

- **Request**: `{}`
- **Response**: `null` when the student has no plan, else `{ examType, settings: { dailyMinutes, daysPerWeek, targetScore }, createdAt, plan, progress, examDateChanged }`
  - `plan`: `{ startsOn, examDate, questionsPerDay, weeks, summary }`; each week is `{ index, startsOn, endsOn, kind: "learn"|"final", questionBudget, items }` and each item `{ weekIndex, kind: "topic"|"review"|"mock_exam", topic: string|null, questions }`; `summary` is `{ totalQuestions, learnQuestions, unallocatedQuestions, unscheduledTopics }`
  - `progress`: `{ weeks: [{ index, planned, done, items: [{ kind, topic, questions, done }] }], questionsDone, plannedToDate, currentWeek: number|null, status: "not_started"|"behind"|"on_track"|"ahead"|"finished" }`
  - `examDateChanged`: the profile's exam date is no longer the one the plan was made for
- **Errors**: 404 no profile
- **Business rules**: formulas section 13. Progress is derived from the student's answers on every call; nothing about it is stored.

## createStudyPlan

- **Request**: `{ examType?: "RN"|"RM", dailyMinutes?: 10–240, daysPerWeek?: 1–7, targetScore?: 50–100 }` (defaults 30, 5, 80; `examType` defaults to the profile's preference)
- **Response**: the same object as `getStudyPlan`, for the plan just made
- **Errors**: 400 settings out of range, no exam date in the profile, an exam date that is not in the future or is more than 52 weeks away, no exam type given while the profile says Both or nothing, or no questions in the bank for the exam · 404 no profile
- **Business rules**: formulas section 13. The exam date comes from the profile and the topics from the question bank, so the request cannot supply either. A student has one plan: this replaces the earlier one. The plan is advice and creates no session.

## setExamDate

- **Authorization**: signed-in student; updates only their own profile's `exam_date`.
- **Request**: `{ examDate: "YYYY-MM-DD" }` (strict).
- **Errors**: 400 not a real date, not after today, or more than two years away.

## getStudyPlan / createStudyPlan: additions

- Each plan item carries `mastery` (the student's mastery in the topic when the plan was made; `null` if never practised or a mock exam).
- The view carries `attention`: `"exam_date_changed"`, `"behind"` or `null`.
- `createStudyPlan` keeps the weeks of the earlier plan (same exam) that began before today, cut at yesterday, and plans from today again (docs/formulas.md section 13). Progress stays derived from answers; nothing is ticked by hand.
