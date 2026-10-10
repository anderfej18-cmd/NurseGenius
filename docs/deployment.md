# Deploying the Milestone 1–3 and fix-pass changes

Nothing in `supabase/migrations/20261006200000` and later has been applied to a live database by the
people who wrote it: there was no access to one. Every statement below about live behaviour is therefore
an instruction to check, not a result. The migrations replay cleanly on PGlite (Postgres compiled to WASM,
`src/server/testing/`), which is strong evidence for the SQL and the privileges but is not Supabase itself.

## 0. Before you start

1. Take a backup or a point-in-time-recovery marker of the production database.
2. Know the way back: `supabase/rollback/20261006_milestones_1_to_3_rollback.sql` (run by hand; read its
   header first, because it re-opens the vulnerabilities the milestones closed). Redeploy the application
   build from before the change at the same time, so the code matches the schema.
3. Do it first on a staging copy of the project if you have one.

## 1. Apply the migrations, in this order

Apply in file-name order. Each file is one transaction; stop at the first error and read it.

| # | File | What it does |
|---|---|---|
| 1 | `20261006200000_question_catalog_and_profile_lockdown` | Hides the answer key from students; students can no longer write `tier` or other protected profile fields |
| 2 | `20261006200100_exam_session_engine` | Server-side sessions and scoring; students lose write access to `exams` and `exam_answers`; backfills statistics; finishes abandoned sessions |
| 3 | `…200200_bookmarks_and_question_reports` | Bookmarks and reports |
| 4 | `…200300_intelligence_support` | Review scheduling support |
| 5 | `…200400_study_days` | Streak days |
| 6 | `…200500_gamification` | XP ledger and achievements |
| 7 | `…200600_daily_challenges` | Daily challenge |
| 8 | `…200700_study_plans` | Study plans |
| 9 | `…200800_friends` | Friends |
| 10 | `…200900_friend_challenges` | Friend challenges |
| 11 | `…201000_notifications` | Notification outbox and inbox |
| 12 | `…201100_admin_content_management` | Admins can no longer write `questions` or `subtopics` from the browser |
| 13 | `20261009100000_rate_limits_and_ai_access` | Database rate limiter; `ask-ai` access functions |
| 14 | `20261009100100_admin_access_and_directories` | Tier grants for central admins only; leaderboard and directory for the server only |
| 15 | `20261009100200_custom_tests_service_rpcs` | Shared tests through the server only |
| 16 | `20261009100300_hints_used` | `exam_answers.hints_used` and the nine-argument `save_exam_answer` |
| 17 | `20261009100400_score_integrity` | `exams.score_verified`, backfill, verified-only leaderboards |
| 18 | `20261009100500_quota_enforcement` | Tier limits enforced inside `start_exam_session` |
| 19 | `20261009100600_ai_insights` | `ai_insights` (stored AI explanations) and `readiness_snapshots` with `record_readiness_snapshot`; both service-role only |
| 20 | `20261009100700_selection_reasons` | `exam_answers.selection_reason` and `record_selection_reasons` |

### Effects on existing data

- **Legacy in-progress sessions** are finished by migration 2. Those past their deadline are scored from
  their saved answers with `completed_at` set to the deadline; of several open ones, the most recent
  survives. A student who was mid-exam when you apply may find that exam closed. Apply in a quiet period.
- **Legacy scores** are not changed. Migration 17 recomputes each completed exam from the answer key and
  sets `score_verified` only where the stored score and every answer flag agree. Exams that disagree stay
  as they are, show "Unverified" on the dashboard, and do not count on the leaderboards or in the dashboard
  average. Count them after applying (query below) and decide whether to leave, review or repair them.
- **Daily counters** are unchanged. From migration 18 a session larger than the tier allows is refused by
  the database even if a stale caller asks for it.

```sql
-- how many completed exams could not be verified?
SELECT count(*) FILTER (WHERE NOT score_verified) AS unverified, count(*) AS completed
FROM public.exams WHERE status = 'completed';
```

## 2. Deploy order between database and application

The new application build needs the new schema (it calls functions that do not exist before) and the new
schema breaks the old application build (the old build writes `exams` and `profiles` directly, reads the
answer key, and calls the revoked leaderboard and directory functions). There is no zero-downtime order.
Apply the migrations and publish the build in one short window; expect errors from the old build's open
pages until they reload.

## 3. Edge Function `ask-ai`

1. Set the secret `ALLOWED_ORIGINS` to the exact origins of your site, comma-separated (for example
   `https://app.example.com`). The function refuses to start without it. Keep `LOVABLE_API_KEY` as it is.
2. Deploy the function from `supabase/functions/ask-ai/` (it needs `policy.ts`, `handler.ts`, `index.ts`
   and `deno.json`). `supabase/config.toml` sets `verify_jwt = true`; confirm the setting is in effect on
   the deployed function. `verify_jwt` alone is not the access control: the function checks the caller
   itself (ADR-0006).
3. Make sure the previously deployed version is replaced, not left running beside the new one: the old
   version accepted any origin and trusted an answer sent by the browser.

## 3b. Edge Function `ai-insight` and the updated `ask-ai`

1. Deploy `supabase/functions/ai-insight/` (`index.ts`, `handler.ts`, `policy.ts`, `deno.json`). It uses the
   existing `LOVABLE_API_KEY` secret and the platform's `SUPABASE_URL` / `SUPABASE_SERVICE_ROLE_KEY`; it needs
   no new secret and no `ALLOWED_ORIGINS` (no browser calls it). `supabase/config.toml` sets `verify_jwt = true`.
2. Redeploy `ask-ai` (it now returns and uses the official rationale, accepts `intent` and `followUp`, and the
   migration `20261009100000` was edited to return `rationale`; apply migrations before deploying it).
3. The Worker calls `${SUPABASE_URL}/functions/v1/ai-insight` with the service-role key it already has. If the
   function is not deployed, the student sees the computed summary (labelled "Computed summary"), never an error.
4. Order: migrations (19, 20) → deploy both functions → publish the application build.

## 4. Regenerate the types

`src/integrations/supabase/types.ts` was extended by hand to describe the new tables and functions. After
migrations are live, regenerate it from the database and run the four checks. A diff you did not expect is
the signal that the hand-written types and the real schema disagree.

## 5. Owner steps that code cannot do

- Set `ALLOWED_ORIGINS` (above).
- Decide the CSP: it ships as Report-Only (ADR-0010). Watch the reports, then enforce it. Until it is
  enforced it does not protect against injected scripts.
- Grant paid tiers only through a central admin; sub-admins can no longer do it (ADR-0008). Confirm
  that matches how you run the business.
- Rotate keys if you ever put a secret in a tracked file. The tracked `.env` held public settings only when
  checked; the test `src/server/env-files.test.ts` guards against that changing.

## 6. Smoke test after deployment

Use two test accounts (a student and a central admin) and one test sub-admin.

1. **Student:** sign in; start a practice test of 10; answer; submit. The result shows a score and the
   rationale only after submitting.
2. **Answer key:** in the browser console run `supabase.from("questions").select("correct_answer")`. It must
   fail or return no key.
3. **Write lock:** run `supabase.from("exams").update({ score_pct: 100 }).eq("id", "<your exam id>")` and
   `supabase.from("profiles").update({ tier: "scholar" }).eq("id", "<your id>")`. Both must fail.
4. **Limits:** as a novice, try to start a test larger than 50 questions. It must be refused.
5. **Second session:** start a test, then try to start another without finishing. It must be refused.
6. **Leaderboard:** open it as a student. It loads (through the server function). As an anonymous visitor it
   must not load.
7. **Admin:** as a central admin, grant a tier, create, retire and restore a question. As a sub-admin, the
   directory lists names and tiers, and granting a tier is refused.
8. **Shared test:** open a shared-test link, submit, and confirm repeated rapid requests start returning
   "too many requests".
9. **`ask-ai`:** from the site, request an explanation after a result. From another origin (for example
   `curl -H "Origin: https://example.org"`) the request must be refused.
10. **Payments (test mode):** pay with the provider's test card; the plan activates once; verifying the same
    reference again is refused.
11. **Friends:** send a friend request from one account; the other sees one unread notification.
12. **AI explanations:** on Study Today, Mastery & Readiness, Study Plan and Performance Analysis, open an account with at least 30 answers. The card
    says "AI-assisted" with a time and a "What this is based on" list. Stop the `ai-insight` function: after
    Refresh the card shows "Computed summary" with a short reason, and nothing else breaks. An account with
    fewer than 30 answers shows the computed summary without calling the model (check the function logs).
13. **Question help:** after a finished test, use Explain, Simplify, Compare the options and (on a wrong answer)
    Why was I wrong?; ask a follow-up. On a test still in progress the function must answer 404 for the same
    question ids (call it with `curl` and the in-progress exam id).
14. **Study plan:** save an exam date, create a plan, change the date and confirm the plan asks to be updated;
    update it and confirm the earlier week and its progress are still listed.
15. **Similar questions:** on the results page choose "Find similar questions", then "Practise these"; the new
    test contains only questions from the same topic. On the results page of that test each question says why
    it was chosen.
16. **Headers:** `curl -I` the site and confirm a `Content-Security-Policy: frame-ancestors …`
    header (enforced) and a `Content-Security-Policy-Report-Only` header (the full policy) are present.
17. **Navigation:** sign in as a student: the header shows Learn, Review, Insights, Community and Account menus
    (no Admin), and every button opens its page with the right button lit; the bell opens Notifications. On a
    phone-width window the menu button opens the same list. Open `/progress`: it lands on Study Today. Open
    `/history`, `/topics`, `/profile`: each loads; History lists the finished tests and shows the same average as
    the dashboard.
18. **Admin navigation:** as an ordinary admin the header shows an Admin menu with 7 entries (no Upgrades,
    Pricing & Duration, Assign Admin); open `/admin?tab=pricing` by hand: it shows Add Questions, not the pricing
    tab. As the central admin the Admin menu has 10 entries and each opens its tab. A student who types `/admin`
    is sent to the dashboard.

If any step fails, stop, keep the output, and decide between fixing forward and the rollback script.
