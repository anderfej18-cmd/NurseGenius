# Formulas

Every number the intelligence engines produce is a deterministic function of a student's recorded
attempts, the current time, and a typed config. Nothing here predicts exam results. Sections 1–17 use
no AI; section 18 describes the one place AI is used, which only phrases what these formulas measured. Tunable values live in `*.config.ts` files next to each engine; this document explains what
they mean. Design decisions: `docs/adr/0002-derived-learning-state.md`.

**Terms.** _Attempt_: one answered question in a completed session (unanswered questions are not
attempts). _Topic_: the question's `topic` value. _Evidence_: how much a score rests on the
student's own attempts rather than on the prior.

**Data that may be missing.** No existing question has a `difficulty` and no existing attempt has a
`confidence` (the current UI does not ask). Components that need them are left out, never zero-filled,
and the result lists which components were used.

## 1. Topic mastery

`src/server/intelligence/mastery/` (`mastery.config.ts`, `mastery.service.ts`).

For one topic with `n` attempts:

| Component       | Definition                                                                                                                                        |
| --------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------ | ---------------------------------------------------------------------------------------------------------- |
| **accuracy**    | `Σ wᵢ·cᵢ / Σ wᵢ` where `cᵢ` is 1 if correct, `wᵢ = 0.5^(ageDaysᵢ / 30)`: an attempt's weight halves every 30 days                                 |
| **recency**     | accuracy over the latest 10 attempts (all of them if fewer)                                                                                       |
| **consistency** | share of _qualifying_ sessions (at least 3 attempts in the topic) whose accuracy reached 60%; needs at least 2 qualifying sessions, else left out |
| **difficulty**  | accuracy where hard = 1.5, medium = 1, easy = 0.5; only attempts with a known difficulty; needs at least 5                                        |
| **calibration** | `1 − mean(                                                                                                                                        | expected − outcome | )` with expected success low 0.4, medium 0.65, high 0.9; only attempts with a confidence; needs at least 5 |

```
raw      = Σ weightₖ·componentₖ / Σ weightₖ        over the components that have data
weights  = accuracy 0.40, recency 0.20, consistency 0.15, difficulty 0.15, calibration 0.10
penalty  = 0.15 × (questions missed ≥ 2 times and not answered correctly since) / (distinct questions)
adjusted = clamp(raw − penalty, 0, 1)
evidence = n / (n + 10)
score    = 100 × ( 0.5 + (adjusted − 0.5) × evidence )
```

**Why shrinkage.** With no evidence the score is the prior, 50. Two correct answers give
`0.5 + 0.5 × 2/12 = 58.3`, not 100; 100 correct answers give 95.5. A score reaches the same level only
with the evidence to back it.

**Levels.** `insufficient_data` below 5 attempts. Otherwise `mastered` (score ≥ 85 **and** evidence ≥ 0.75,
that is at least 30 attempts), `proficient` (≥ 70), `developing` (≥ 50), `weak`.

**Trend.** Accuracy of the latest 10 attempts minus that of the up-to-10 before them (at least 5 needed):
`improving` at +0.10 or more, `declining` at −0.10 or less, else `stable`; `unknown` without enough history.

**Overall mastery** is the attempt-weighted mean of the topic scores; its evidence is `N / (N + 10)`.

**Worked example.** 25 correct attempts in 5 sessions of 5: accuracy 1, recency 1, consistency 1
(difficulty and calibration absent) → raw 1.0; evidence 25/35 = 0.714; score `0.5 + 0.5 × 0.714 = 85.7`;
level `proficient` because the evidence is below 0.75.

**Assumptions and limits.** Attempts are scored equally regardless of question text; sessions are the
unit of consistency; the half-life, windows and thresholds are starting values to tune against real
data. The score is an explanation of past results, not a forecast.

## 2. Confidence analytics

`src/server/intelligence/confidence/` (`confidence.config.ts`, `confidence.analytics.ts`).

Each attempt that carries a confidence falls into one of six cells: correct or wrong, crossed with
low, medium or high. Attempts without a confidence are counted as `unrated` and used for nothing else.
The counts are reported overall, per topic and per exam type (RN / RM), optionally from a `since` date
(inclusive).

```
highConfidenceErrorRate  = wrongHigh  / (correctHigh + wrongHigh)     null if no high-confidence answers
lowConfidenceSuccessRate = correctLow / (correctLow  + wrongLow)      null if no low-confidence answers

falseConfidence = rated ≥ 5  and  wrongHigh  ≥ 3  and  highConfidenceErrorRate  ≥ 0.25
weakConfidence  = rated ≥ 5  and  correctLow ≥ 3  and  lowConfidenceSuccessRate ≥ 0.50
```

**Reading the cells.** _Correct + high_: strong knowledge signal. _Correct + low_: may need reinforcement
(weak confidence when it dominates). _Wrong + high_: false confidence, the pattern most worth
correcting. _Wrong + low_: a known weakness. Topics are listed with the most high-confidence mistakes
first, then alphabetically.

**Limits.** The web UI does not yet ask for a confidence, so existing history is all `unrated`; the
report is empty of patterns until confidence is collected. Nothing is inferred from other signals.

## 3. Spaced review (SM-2)

`src/server/intelligence/review/` (`review.scheduler.ts` interface and replay, `sm2.scheduler.ts`,
`sm2.config.ts`, `review.service.ts`, `due.ts`).

Every answered attempt is one _review_ of that question. A `ReviewScheduler` turns the ordered reviews
into a schedule; `Sm2ReviewScheduler` is the only implementation (the interface is the replacement
seam, ADR-0003). The scheduler is pure: it needs no clock, database or framework.

**Grade.** Wrong answer: 1. Correct: 5 with high confidence, 4 with medium confidence or none, 3 with low
confidence. A grade below 3 is a lapse.

```
success (grade ≥ 3):  repetitions += 1
                      interval = 1 day            (repetitions = 1)
                                 6 days           (repetitions = 2)
                                 round(interval × ease)   (repetitions ≥ 3, with the ease from before this review)
                      ease     = max(1.3, ease + 0.1 − (5−q)·(0.08 + (5−q)·0.02))
lapse (grade < 3):    repetitions = 0, interval = 1 day, ease unchanged (as in the original algorithm)
nextReviewAt = reviewedAt + interval days   (interval capped at 365)
```

With the starting ease of 2.5 and grade 4, successive intervals are 1, 6, 15, 38 days.

| Stored field            | Meaning                                                                                                                               |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `next_review_at`        | `nextReviewAt` above                                                                                                                  |
| `review_count`          | reviews so far (equals `attempts` when up to date)                                                                                    |
| `last_reviewed_at`      | time of the latest review                                                                                                             |
| `interval_days`, `ease` | the algorithm's current values                                                                                                        |
| `review_status`         | `new` (never answered), `learning` (fewer than 2 successes in a row, or last answer wrong), `review`, `mastered` (interval ≥ 21 days) |

**Due.** A question is due when `now ≥ next_review_at`; _overdue days_ is the time past that, in days.
Retired questions are never listed.

**The stored schedule is a cache.** It is rebuilt by replaying the attempt history oldest first, never
updated incrementally, so a change of algorithm or parameters is a recompute and a repeated recompute
changes nothing. `review_stale` (generated: `review_count <> attempts`) marks schedules to rebuild.
They are rebuilt after an exam is scored (best effort) and before due reviews are read, at most
1,000 questions per request.

**Limits.** SM-2 does not use answer time or question difficulty. "Mastered" here describes a review
interval, not topic mastery (section 1).

## 4. Empirical difficulty

`src/server/intelligence/difficulty.ts`.

No existing question has an admin-set difficulty. A question's difficulty is therefore its admin-set
value if there is one, otherwise it is learned from all students' completed attempts: with at least
20 attempts, **easy** when at least 75% were correct, **hard** when at most 45% were, else **medium**;
unknown below 20 attempts. Unknown difficulty is left out of every formula, never guessed.

## 5. Time analytics

`src/server/intelligence/time/` (`time.config.ts`, `time-analytics.service.ts`).

Answer times are reported by the browser and are advisory: the server only clamps them to the
session's age. An attempt with no time is _untimed_; one with a time of 0 or over 10 minutes is an
_outlier_ (a question left open). Both are counted and left out of every statistic.

**Statistics.** Count, average, median, minimum and maximum, overall, for correct answers, for wrong
answers, and per topic (slowest average first, with the topic's own correct and wrong averages).
The five slowest questions by average time are listed.

**Pace.** `median` is the student's own median time over timed attempts. An attempt is _fast_ at or below
`0.6 × median`, _slow_ at or above `1.5 × median`, otherwise _typical_. Crossed with correctness this gives
six counts: fast/slow/typical × correct/incorrect. Patterns are reported only once at least 10 attempts are timed.

**Insights** (each needs at least 3 attempts of the pattern and this share of the timed attempts):

| Code             | Pattern          | Share |
| ---------------- | ---------------- | ----- |
| `rushing`        | fast and wrong   | ≥ 15% |
| `struggling`     | slow and wrong   | ≥ 15% |
| `carefulButSlow` | slow and correct | ≥ 25% |
| `efficient`      | fast and correct | ≥ 25% |

**Trend.** Average time of the latest 20 timed attempts against the 20 before them (at least 10 needed):
`faster` at −10% or less, `slower` at +10% or more, else `steady`; `changePct` is the relative change.

**Limits.** Times are not compared across students, and a question's text length is not considered.

## 6. Adaptive question selection

`src/server/intelligence/selection/` (`adaptive-selection.config.ts`, `adaptive-selector.ts`,
`adaptive-selection.service.ts`). Used by `SessionService.start()` when a session is started with
`selection: "adaptive"`; the default stays random. The browser names a mode, never the questions.

Every candidate question (active, complete, in the chosen exam type and topic) gets six signals in
0 to 1 and a score that is their weighted sum:

| Signal            | Weight | Definition                                                                          |
| ----------------- | ------ | ----------------------------------------------------------------------------------- | ------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `weakTopic`       | 0.30   | `1 − topicMastery / 100`; a topic with no history uses the prior 50, so 0.5         |
| `dueReview`       | 0.20   | 0 unless the question is due; `0.5 + 0.5 × min(daysOverdue, 14) / 14` once it is    |
| `previousMistake` | 0.20   | `min(1, misses / 3)` for a question missed and not answered correctly since, else 0 |
| `lowExposure`     | 0.10   | `1 / (1 + attempts at this question)`                                               |
| `recentWeakness`  | 0.10   | `1 − recent accuracy` of the topic (mastery component `recency`); 0.5 if unknown    |
| `difficultyFit`   | 0.10   | `1 −                                                                                | difficulty − target | `, difficulty easy 0 / medium 0.5 / hard 1, target = topic mastery / 100; 0.5 if the question's difficulty is unknown |

**Ranking.** By score, then by a seeded hash of `userId|time` and the question id (so students with no
history do not all get the same questions, yet one request is reproducible), then by id.

**Variety.** No topic supplies more than `ceil(count × 0.6)` questions while other topics have questions;
places no other topic can fill go back to the capped topic. Order within the session is selection
order (highest priority first).

**Example.** Organic Chemistry 42, Stoichiometry 55, Atomic Structure 87, equal otherwise: weak-topic
signals 0.58, 0.45, 0.13, so a 10-question session takes most questions from Organic Chemistry,
then Stoichiometry, and at most one from Atomic Structure.

**Limits.** Only admin-set difficulty is used for candidates (reading learned difficulty for the
whole bank on every start would be costly), and no existing question has one yet, so `difficultyFit`
is neutral until difficulties are set. The student's recent history is read up to 5,000 attempts.

## 7. Similar questions

`src/server/intelligence/similar/` (`similar.config.ts`, `similar-questions.ts`, `similar.service.ts`).
No AI and no copied records: related questions are found from the metadata and wording the bank already has.

A candidate is eligible when it is an **active question of the same exam type** that shares the source's
**topic or subtopic**, and is not the source. Points:

| Signal                                                      | Points                             |
| ----------------------------------------------------------- | ---------------------------------- |
| same topic                                                  | 3                                  |
| same subtopic                                               | 2                                  |
| same difficulty / one step apart (easy–medium, medium–hard) | 1 / 0.5                            |
| shared tags                                                 | 0.5 each, at most 2                |
| similar wording                                             | 1.5 × the wording overlap (0 to 1) |

Wording overlap is the Jaccard index of the two questions' _meaningful words_: lower-case letters and digits, at least 4 characters, without the words every exam question uses ("which", "following", "patient", "nurse", "priority" …). It counts only when at least 3 meaningful words are shared and the overlap is at least 0.2, otherwise it is 0. It is a plain-text fallback: no embeddings, no vector search (none exists in this infrastructure, and the bank is small enough that topic-bounded candidates are ranked directly). Wording can raise a question's rank but never makes a question from another topic eligible.

`score = points / 8.5` (8.5 is the best possible). Order: score, then questions the student has **not** answered
before answered ones, then id. The default is 5 results, at most 20.

**Ownership.** Only a question the student has already answered can be used as the source; any other
id gets "not found", the same as a missing one. Results carry question content and never the answer key.

**Limits.** The schema has no "question type" column (every question is multiple choice), so tags are the
only stand-in for it; difficulty is unknown for every question until admins set it, in which case it
adds no points. At most 300 candidates per query are ranked.

## 8. Daily recommendation

`src/server/intelligence/recommendation/` (`recommendation.config.ts`, `deterministic.strategy.ts`,
`recommendation.service.ts`). No AI. `RecommendationService` measures the student (mastery, due reviews,
unresolved mistakes, pace, activity, exam date, remaining quota) and passes those facts to a
`RecommendationStrategy`; `DeterministicRecommendationStrategy` is the only strategy. It never sees raw
history, so a later strategy can replace it without touching the measuring.

**Size of the day.**

```
secondsPerQuestion = clamp(own average seconds per answer, 15, 300)      60 when unknown
budget             = clamp(floor(availableMinutes × 60 / secondsPerQuestion), 10, 100)
budget             = min(budget, questions the tier still allows today)  0 ⇒ empty plan, limitReached
```

`availableMinutes` is 10 to 240 (default 30); anything else is a validation error before any data is read.

**Blocks.** Topic practice is guaranteed at least 40% of the budget; the other blocks share the rest in
this order, each only if it has at least 5 questions to offer (or fewer exist):

| Block            | Target                                                  | Present when                                                  |
| ---------------- | ------------------------------------------------------- | ------------------------------------------------------------- |
| `due_reviews`    | 30% of budget, at most the number due                   | something is due                                              |
| `mistake_review` | 20% of budget, at most the unresolved mistakes          | questions missed and not answered correctly since             |
| topic blocks     | everything left, over 2 topics (3 when urgency is high) | the student has history; else one `mixed_practice` block      |
| `speed_practice` | 10% of budget                                           | right answers take unusually long (time analytics, section 5) |

Each chosen topic gets 5 questions first; the remainder is split in proportion to the topic's priority
by largest remainder (an even split when every priority is 0). Order in the plan: due, mistakes, topics,
speed.

**Topic priority** `= 1 − mastery/100`, plus 0.1 while its trend is `declining`. Mastered topics are left
out unless every topic is mastered.

**Exam urgency.** From whole UTC days to the exam: `high` ≤ 14, `medium` ≤ 30, `low` ≤ 60, otherwise (or
no date, or past) `none`. Urgency changes the number of topic blocks and adds a note; it does not change
the budget.

**Notes.** The days to the exam when urgency applies; a return note after 3 or more days without practice.

**Limits.** Estimated minutes use the student's own average pace, which is client-reported. The shares,
minimums and thresholds are starting values to tune against real use.

## 9. Exam readiness

`src/server/intelligence/readiness/` (`readiness.config.ts`, `readiness.ts`, `readiness.service.ts`).

**What it is.** An internal preparation metric computed from the student's past practice at one exam
type (RN or RM). It is **not a prediction** of an exam result and is labelled that way in every report
(`notice`); no pass probability is claimed or derived. The exam date does not enter the score.

Each component is 0 to 1, or absent when the data for it does not exist. Accuracies are shrunk toward
50% with 10 pseudo-attempts, so a short run of right answers cannot look ready:
`shrunk = (correct + 5) / (attempts + 10)`; 2 of 2 gives 0.583, 100 of 100 gives 0.955.

| Component            | Weight | Definition                                                                                                                           | Absent when                                             |
| -------------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------- |
| **mastery**          | 0.25   | overall topic mastery score ÷ 100 (section 1)                                                                                        | no attempts                                             |
| **accuracy**         | 0.10   | shrunk accuracy over all attempts                                                                                                    | no attempts                                             |
| **recent**           | 0.15   | shrunk accuracy over the last 14 days                                                                                                | fewer than 10 attempts in them                          |
| **mockExam**         | 0.15   | shrunk accuracy over `mock_exam` and `timed_exam` sessions                                                                           | fewer than 20 such attempts                             |
| **consistency**      | 0.10   | `min(1, days practised in the last 14 ÷ 10)` (UTC days)                                                                              | no attempts at all (practice only long ago is a real 0) |
| **speed**            | 0.05   | `clamp((240 − median seconds) ÷ (240 − 90), 0, 1)`                                                                                   | fewer than 20 timed attempts                            |
| **coverage**         | 0.10   | topics with at least 5 attempts ÷ active topics in the bank for this exam type, capped at 1                                          | no topics in the bank                                   |
| **repeatedMistakes** | 0.10   | `1 − min(1, share ÷ 0.2)` where `share` = questions missed ≥ 2 times and not answered correctly since ÷ distinct questions attempted | no attempts                                             |

```
score = 100 × Σ weightₖ·valueₖ / Σ weightₖ        over the components that have data
```

Components without data are left out and the rest renormalised (as in mastery), never counted as zero.
`completeness` is the share of the weight that had data.

**Minimum evidence.** Below 30 attempts no score is given: `readinessScore` is null, `band` is
`not_enough_data`, and `attemptsToScore` says how many more are needed.

**Bands.** `early` below 40, `developing` 40 to under 60, `solid` 60 to under 75, `strong` 75 and over.
These are descriptions of the score, not pass marks.

**Weak topics.** Topics at mastery level `weak` or `developing`, lowest score first (ties by name), at
most 5.

**Recommendations.** Components under 0.6, ordered by weighted shortfall `weight × (1 − value)`
(ties keep the table order above), at most 3. If no timed or mock exam has been taken, "take a timed
mock exam" is added after the weaknesses while there is room. Fixed messages, no scoring involved.

**History.** Each assessment is kept as a snapshot when the score or the number of answers changed since the last one (`readiness_snapshots`, the latest 30 per student and exam). The report says when it was made and how many points it moved since the previous scored one; a failure to keep the history never withholds the report.

**Exam date.** Reported with `daysToExam` and the same urgency levels as the daily plan (section 8:
14, 30 and 60 days). It is context for the reader and does not change any component.

**Worked example.** 60 attempts, 45 correct; 20 of them mock-exam attempts (15 correct) over the last
10 days; median time 90 s; topics A and B covered of 4 in the bank; overall mastery 72; no repeated
mistakes. Components: mastery 0.72, accuracy 50/70 = 0.714, recent 20/30 = 0.667, mockExam 0.667,
consistency 1, speed 1, coverage 0.5, repeatedMistakes 1.
`score = 100 × (0.25·0.72 + 0.10·0.714 + 0.15·0.667 + 0.15·0.667 + 0.10 + 0.05 + 0.10·0.5 + 0.10) = 75.1`
→ `strong`.

**Assumptions and limits.** The weights, targets (90 s, 10 days) and thresholds are starting values to
tune against real outcomes; until real results are collected, nothing validates that the score tracks
exam performance. Times are client-reported. The topic list comes from the question bank, so coverage
rises as topics are added. Mock-exam performance stays absent until the app creates `mock_exam` or
`timed_exam` sessions (the current screens do not).

## 10. Study streak

`src/server/engagement/streaks/` (`streak.config.ts`, `streak.ts`, `streak.service.ts`). Calculated on the
server from attempt history; nothing is stored, and no request can set a streak.

A **study day** is a UTC calendar day on which the student answered at least 5 questions in completed
sessions (`minQuestionsPerDay`; several entries for one day are added up). Days after today (clock skew)
are ignored.

```
current  = consecutive study days ending today; if today has none yet but yesterday does, the run
           ending yesterday (the streak is "at risk" until something is answered today)
longest  = the longest run in the history read (the last 366 days)
```

A whole missed day sets `current` to 0; `longest` is kept. Also reported: whether today is done,
the last study day, days studied in the last 7 and 30 days, and the next milestone
(3, 7, 14, 30, 60, 100, 180 and 365 days) with the days remaining.

**Limits.** Days are UTC: a student studying late in the evening far from UTC may see a day boundary at
an unexpected local hour (profiles hold no time zone). The 5-question threshold is a product choice, so
a streak cannot be kept by answering one question; change `minQuestionsPerDay` to move it. The longest
streak only looks back 366 days.

## 11. XP, levels and achievements

`src/server/engagement/gamification/` (`gamification.config.ts`, `xp.ts`, `levels.ts`, `achievements.ts`,
`gamification.service.ts`). XP is paid only by the server, into a ledger where each source can be paid once
(docs/adr/0004). No request carries an amount.

**XP per finished session.**

| Event (`source_type`, `source_id`)  | XP                                                                                                  | When                                                                          |
| ----------------------------------- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------- |
| `session`, the session id           | 10 × answers that were right **and** the first right answer this student ever gave to that question | every finished session (a 0-XP entry marks it processed)                      |
| `daily_practice`, the UTC date      | 20                                                                                                  | the session has at least 5 answered questions; once per date                  |
| `perfect_session`, the UTC date     | 20                                                                                                  | at least 10 answered and all right; once per date                             |
| `daily_challenge`, the challenge id | 8 × right answers, plus 10 when every answer is right                                               | the challenge's session is finished; a challenge with no right answers pays 0 |
| `achievement`, the code             | the achievement's XP                                                                                | when it unlocks                                                               |

Repeating a question pays nothing, so total per-question XP is bounded by the size of the bank, and
the bonuses are paid once a day however many sessions qualify. "First right answer" is judged in the
database from the answer key in completion order, never from a stored flag.

**Levels.** Level `n` starts at `100 × (n − 1) × n / 2` XP: level 2 at 100, 3 at 300, 4 at 600, 5 at 1,000,
10 at 4,500; the maximum is level 100. Progress is `(xp − start) / (next start − start)`.

**Achievements.** Definitions are data in the config: a metric and a threshold, unlocked when the metric
reaches it, each paying its XP once. Metrics: sessions completed, questions answered, correct answers,
perfect sessions, topics practised (at least 5 answered each), longest streak (section 10), daily
challenges finished (section 12) and level.
Unlocking pays XP, which can lift the level and unlock a level achievement; this is followed for up to
3 rounds in one catch-up. Locked achievements report `current`, `target` and `progress`.

**Catch-up (`sync`).** Pays up to 4 batches of 50 unprocessed sessions, then evaluates achievements.
It runs after a session is first scored and whenever the summary is read; repeating it pays nothing.

**Limits.** Amounts are starting values. Streak and daily bonuses use UTC dates. XP does not reward
reviewing questions already answered correctly (only the daily bonus does); that is deliberate, to make
farming impossible, and is easy to revisit. Existing sessions are paid when first seen after deployment,
including history from before XP existed.

## 12. Daily challenge

`src/server/engagement/challenges/` (`daily-challenge.config.ts`, `daily-challenge.service.ts`).

One stored instance per student per UTC day (`UNIQUE (user_id, challenge_date)`).

- **Creation.** The first time the day's challenge is needed, the server takes the active, complete
  questions of the student's exam type and chooses 5 with the adaptive selector (section 6): weak topics,
  due reviews and past mistakes come first. The chosen ids are stored and **never change** for that day;
  asking again, or concurrently, returns the same instance. A bank with fewer than 5 complete questions
  gives a smaller challenge; an empty bank gives an error and stores nothing. The request cannot name
  questions.
- **Exam type.** The one asked for, else the profile's RN/RM preference; "Both" or none asks the student
  to choose.
- **Taking it.** Starting the challenge starts an ordinary exam session (type `daily_challenge`, 10
  minutes) and links it to the instance in one database step. Every session rule applies: one active
  session at a time, the tier's daily allowance (the 5 questions count against it), server scoring.
  Starting again while it is running returns the running session; once finished it is refused.
- **Finished** means its exam is completed, so there is no second copy of the result to drift. An
  expired session is finalised by the existing logic and counts as finished with the score it had.
- **XP and achievements.** Section 11: 8 per right answer plus 10 for all right (so 0 to 50), paid once
  per challenge; "Challenger" at 1 finished challenge, "Challenge week" at 7.

**Limits.** The day is UTC. A challenge answered with nothing right earns no XP, so abandoning it gains
nothing. A student can see the challenge's question ids in their own row (the same questions are
readable through the normal question bank), never the answers.

## 13. Study plan

`src/server/engagement/plans/` (`study-plan.config.ts`, `study-plan.ts`, `study-plan-progress.ts`,
`study-plan.service.ts`). No AI in the plan itself (section 18 only rephrases it): the plan is a pure function of the exam date, three settings, the
topics in the question bank and the student's topic mastery (section 1). The same input gives the same
plan. It uses only topics that exist in the bank.

**Inputs.** The exam date is the profile's (a student with none is asked to set one); today is the UTC
date. `dailyMinutes` 10 to 240 (default 30), `daysPerWeek` 1 to 7 (5), `targetScore` 50 to 100 (80); the
exam type is the one asked for, else the profile's RN/RM preference. The plan covers every day from
today to the day before the exam, which must be 1 to 364 days away.

**Size of a day.**

```
secondsPerQuestion = clamp(own average seconds per answer in this exam, 15, 300)      60 when unknown
questionsPerDay    = max(1, floor(dailyMinutes × 60 / secondsPerQuestion))
```

**Weeks.** Whole weeks from today; the last runs to the day before the exam and may be shorter. A week's
question budget is `questionsPerDay × min(daysPerWeek, days in the week)`. The last week is the final
week; every earlier week is a learning week. A plan of one week has only the final week.

**Topic weight.** Mastery is the topic's score, or 50 for a topic the student has not practised.

```
weight = 0.25 + max(0, targetScore − mastery) / 100
```

Topics are ranked by weight, highest first, ties by name.

**Learning weeks.** The learning weeks' whole budget is shared among the topics in proportion to weight
(largest remainder), each capped at 2 passes through the topic's questions (`questionCount × 2`). What
the caps leave unused is reported as `unallocatedQuestions`; a topic that receives nothing is listed in
`unscheduledTopics`. The topics are then laid end to end in rank order and cut into weeks, so the weakest
topic comes first and a topic can run over from one week into the next.

**Final week.** 60% of its budget (rounded down) is review, shared by weight among up to 3 topics: the
lowest-mastery topics below the target, or the 3 lowest when none is below it. The rest, at most 50
questions, is one mock exam over every topic.

**Progress** is derived each time the plan is read, never stored. For each item, the answers given in
that week's UTC dates count toward it, up to the item's size: a topic or review item counts answers in
its topic from ordinary sessions; the mock exam counts answers from `mock_exam` and `timed_exam`
sessions only. Only answers in the plan's exam type count.

```
plannedToDate = planned in finished weeks + round(planned in the current week × days elapsed / days in week)
ratio         = questions done / plannedToDate
status        = finished (the last week has ended) · not_started (plannedToDate is 0)
                · behind (ratio < 0.7) · ahead (ratio > 1.1) · on_track
```

**Replacing and going stale.** A student has one plan; making a new one replaces it. The plan keeps the
exam date it was made for, and the response says `examDateChanged` when the profile's date has since
changed or been removed.

**Limits.** The plan is advice: it does not create sessions, and starting one still goes through the
usual limits. Answers count by topic name, so a renamed topic stops counting. Only the newest 5,000
attempts are read, so progress on a very long history can undercount. The current screens
create no `mock_exam` sessions (Milestone 2 audit, limitation 3), so the mock-exam item stays at 0 until they do.
Pace is client-reported. Every number above is a starting value, not validated against outcomes.

**Why each item is there.** Every topic or review item stores the mastery the student had when the plan was made (null if the topic was never practised, and for the mock exam), so the screen can say "Pharmacology is at 38.5% mastery against your target of 80%" without inventing a figure.

**Updating a plan.** A student has one plan. Making a new plan keeps the weeks of the earlier plan (same exam) that began before today, cut at yesterday, and plans the weeks from today again from current mastery; progress is derived from the answers, so what was done in the kept weeks stays counted. The plan asks for an update (`attention`) when the exam date on the profile differs from the plan's, or when the student is _behind_. Nothing is ticked by hand: an item is done when the student has answered questions of that topic in the week (verified attempts).

**Exam date.** Saved through `setExamDate`: a real calendar date, after today, within two years.

## 14. Friends and friend challenges

`src/server/competition/` (`friends/`, `challenges/`). No AI, and no score is ever written by a
student or by the client: a challenge's result is read from two exams the server scored.

**Friends.** One row per pair of students, whichever asked (a unique index on the unordered pair).

- _Asking._ By exact username (usernames are already shown on the leaderboards, so this reveals
  nothing new; an unknown name says so). You cannot ask yourself, someone you are already friends with,
  or someone you already asked. If they had already asked you, asking back accepts it.
- _Answering._ Only the student who was asked can accept or decline, and only while it waits. Declining
  deletes the request, so it leaves no record and can be asked again.
- _Ending._ Either friend can end a friendship; the asker can withdraw a waiting request.
- _Limits_ (starting values): 200 friends, 20 requests waiting from one student. Accepting needs room
  for both students. The caps, not blocking, are what stop a student being flooded.
- _Privacy._ Students cannot read the table or call these functions directly. Lists show the other
  student as a username and a date only: no email, name, tier or user id.

**Challenges.** A friend challenge is a fixed set of questions chosen by the server, taken by both
students as ordinary exam sessions (type `custom`, category "Friend challenge").

- _Setting one._ Either friend can set one for the other. The server draws 10 questions at random
  (secure randomness) from the active, complete questions of the exam type (the one asked for, else the
  profile's RN/RM preference); the request cannot name questions, the opponent or the closing date. It
  closes 7 days later. A student can have 10 challenges waiting for the other to start (declined or
  started ones do not count).
- _Taking it._ Each student starts their own session, 15 minutes, in the same question order. Every
  session rule applies: one active session at a time, the tier's daily allowance (the 10 questions
  count), server scoring. Starting again returns the running session; a declined or expired challenge
  cannot be started, a finished one cannot be started again. A session started before the challenge
  closed can still be finished.
- _Declining._ Only the challenged student, and only before starting.
- _State_ (for the student looking): `not_started`, `in_progress`, `waiting_for_opponent` (finished,
  the other has not), `declined`, `expired` (it closed before the student started, or before the other
  started after the student finished) and `completed`.
- _Winner._ Both answer the same questions, so the winner is whoever has more right answers; equal is a
  `draw`. Time is not compared because it is reported by the browser.
- _No spoilers._ The opponent's result is withheld until the student has finished their own session.
- _Walking away._ When a challenge is read, an exam of either student that has run out of time is
  finished first (the same finishing a late submit gets), so a result never waits on a student who left.

**Limits.** No XP or achievement is paid for challenges. Unfriending does not cancel challenges already
set; declining or ignoring one is the way out. The question draw reads the whole active bank for the
exam type, like the daily challenge and session start (Milestone 2 audit, limitation 12). All numbers
are starting values.

## 15. Notifications

`src/server/notifications/` (`notification.config.ts`, `notification.ts`, `notification.service.ts`).
No AI. A notification is written by the database, in the same transaction as the change it reports,
and delivered by the server (ADR-0005).

**Events** (one outbox row each, for the student who needs to know):

| Event                     | Told to                | When                                                                     |
| ------------------------- | ---------------------- | ------------------------------------------------------------------------ |
| `friend_request_received` | the student asked      | a friend request is made                                                 |
| `friend_request_accepted` | the student who asked  | the request is accepted (a declined request is deleted and says nothing) |
| `challenge_received`      | the challenged student | a friend challenge is set                                                |
| `challenge_declined`      | the student who set it | the challenge is declined                                                |

**Delivery.** `dispatch(student)` takes up to `batchSize` waiting notifications, oldest first, and gives each
to every provider in turn. A notification is marked delivered only when **all** providers succeeded; a
failure is recorded (`"<provider>: <message>"`, at most 500 characters) and the others carry on.

- A notification handed out but not confirmed is handed out again after `staleAfterSeconds`.
- It is given up on after `maxAttempts` attempts and stays in the outbox with its last error.
- Concurrent runs take different rows (`FOR UPDATE SKIP LOCKED`).
- The in-app inbox row reuses the outbox id, so a repeated delivery leaves one row.

| Setting             | Starting value |
| ------------------- | -------------- |
| `batchSize`         | 50             |
| `maxAttempts`       | 5              |
| `staleAfterSeconds` | 300            |

**Reading.** Listing and counting first deliver what is waiting (best effort: a failure is logged and the
inbox is shown as it is), so a notification appears on the next read after the event. The inbox is paged
(`limit` ≤ 50, `offset` ≤ 10,000) newest first. Marking read ignores ids that are not the student's and
notifications already read, and returns how many changed.

**Words.** `describeNotification` builds the text from the facts in the payload. Usernames are plain text;
whoever displays the message must escape it.

**Limits.** There is no scheduler, so nothing is delivered until the student next reads; an email or push
provider would need one (it would call the same `dispatch`). Notifications are not removed once read. No
notification is sent for XP, achievements or streaks. All numbers are starting values.

## 16. Performance analysis

`src/server/intelligence/performance/` (`performance.config.ts`, `performance.ts`, `performance.service.ts`).
No AI. Input: the student's own answered questions (correctness recomputed from the answer key), the
count of questions due for review, the count of unresolved mistakes, and the count of completed tests whose
stored score is **not verified** (`exams.score_verified`). Stored exam scores are never used.

- **Evidence.** Fewer than 30 answers: no pattern is reported, only how many more are needed.
- **Windows.** _Recent_ = the last 14 days; _earlier_ = everything before.
- **Topics.** Accuracy per topic. A topic is ranked only with at least 8 answers: _weak_ below 60%, _strong_ at or above 80%; at most 5 are listed.
- **Trend** per topic: needs at least 5 answers in both windows; _improving_ if recent accuracy is at least 10 points above earlier, _declining_ if at least 10 below, otherwise _stable_; else _unknown_.
- **Recent vs earlier overall:** reported when each window has at least 5 answers and they differ by 15 points or more.
- **Repeated mistakes:** questions missed at least twice and wrong the last time they were seen (most missed first, at most 5 listed, the total always counted).
- **Effect of revisiting:** among misses followed by a later attempt at the same question, the share answered correctly next time; reported from 10 such misses.
- **Pace:** with at least 30 timed answers, the median seconds of right and wrong answers; reported only when wrong answers took 70% of the time of right ones or less.
- **Wording.** Every finding is a measurement or a pattern ("38% correct over 30 answers"); none states a cause.
- **Unverified scores.** Answer-level evidence is recomputed from the key, so legacy browser-written scores cannot distort it; the report says how many tests were skipped for that reason.

## 17. Why a question was chosen

Each answer row of a session stores one reason (`exam_answers.selection_reason`), set by the server
right after the session starts and never by the student; it affects neither the answer nor the score.

| Selection             | Reason stored                                                                                                                                                                  |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Random                | `random`                                                                                                                                                                       |
| Mistakes / Due        | `previous_mistake` / `due_review`                                                                                                                                              |
| Similar to a question | `similar`                                                                                                                                                                      |
| Adaptive              | the signal with the largest weighted share of the question's score (section 6), in this order on ties: previous mistake, due review, weak topic, recent weakness, new question |

A topic the student has no results in is never called _weak_, and _recent weakness_ needs recent results
in the topic. Difficulty fit is part of the score but is never given as a reason. Sessions started before
this feature kept no reasons and show none.

**Similar-question sessions.** "Practise these" starts a session of the questions section 7 ranks highest for one question the
student has already answered (at most 20); the request names that question, never the list.

## 18. AI wording of measured facts

AI is used in exactly two places, and in neither does it measure, score, select or decide
(`docs/adr/0011-ai-explains-measured-facts.md`):

1. **Explanations** of the day's plan (8), readiness (9), study plan (13) and performance analysis (16), through the `ai-insight` Edge Function.
2. **Question help** after a test (explain, simplify, compare options, why was I wrong, a short follow-up), through `ask-ai`.

**Facts.** Deterministic code turns each report into short statements ("Pharmacology: mastery 38.5% (weak).")
plus the topic names they mention. Only those statements and topics are sent; never the student's id or raw answers.

**Checks on the model's answer** (`src/server/ai-insights/grounding.ts`), all of which must pass or the text is discarded:

- it parses as `{summary ≤ 500, points ≤ 5 (topic or null, text ≤ 300), nextAction ≤ 300}` with no other field;
- every topic named is one of the topics in the facts (case and spacing ignored);
- every number in any text is within 0.05 of a number in the facts;
- no promise or prediction about the exam result ("guarantee", "will pass/fail", "sure to …") and no link.

**Cache and limits.** The explanation is stored per student and kind with a SHA-256 digest of the facts and the prompt version. While the digest is unchanged it is returned without a model call. A new call counts against 3 per minute and 40 per day per student (plus a function-wide budget of 1,000 an hour); the limit hit gives the computed summary, not an error.

**Fallback.** When there is too little history, the provider fails, the answer is malformed or ungrounded, or the limit is hit, the student sees the _computed summary_ built from the same facts, labelled as such. A readiness estimate is always described as an estimate.

**Question help.** The server decides whether a question may be explained: only a question of the student's own finished test, or of a finished shared-test attempt whose key they hold. The prompt carries the stored question, key, the official rationale (or says none exists) and the student's own answer. A follow-up question is limited to 300 characters and wrapped as data. "Why was I wrong?" is refused for a question answered correctly or not at all. Answers containing a link are discarded.
