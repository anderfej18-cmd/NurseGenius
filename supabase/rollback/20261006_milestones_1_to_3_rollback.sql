-- Rolls back Milestones 1, 2 and 3 and the fix pass (every migration from 20261006200000 on).
-- NOT part of supabase/migrations: run it by hand, then deploy the previous application build first.
--
-- WARNING: this re-opens the vulnerabilities Milestone 1 closed (students regain write access to
-- profiles.tier, exams, exam_answers and read access to the answer key). Use it only to recover
-- from a failed rollout, and redeploy the frontend from before Milestone 1 so it matches.
--
-- Not reversible by this script:
--   * data created after the migration: user_question_stats, bookmarks, question_reports, the XP
--     ledger and achievements, and the new columns on exams, exam_answers and questions;
--   * legacy abandoned sessions the migration finalised: they stay completed, with a score computed
--     from their saved answers and completed_at = their deadline.

-- ===== Live tests, 2026-10-12 =====
-- Schedules, stored links and saved answers go; tests are live from creation to expiry again. Earlier in this
-- script the milestone's own shared-test functions are dropped, so nothing here needs to put them back.
DROP FUNCTION IF EXISTS public.import_live_test_questions(uuid, uuid, public.exam_type, text);
DROP FUNCTION IF EXISTS public.list_test_attempts(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.list_live_tests(uuid);
DROP FUNCTION IF EXISTS public.get_shared_attempt(uuid, text);
DROP FUNCTION IF EXISTS public.save_shared_answer(uuid, text, uuid, text, boolean);
DROP FUNCTION IF EXISTS public.start_shared_attempt(text, text, text);
DROP FUNCTION IF EXISTS public.get_shared_test_state(text);
DROP FUNCTION IF EXISTS public.republish_live_test(uuid, uuid, text, text, timestamptz, timestamptz, integer);
DROP FUNCTION IF EXISTS public.create_live_test(uuid, text, text, public.exam_type, text, integer, timestamptz, timestamptz, text, text, jsonb, jsonb);
DROP FUNCTION IF EXISTS app_private.close_overdue_attempts(uuid[]);
DROP FUNCTION IF EXISTS app_private.attempt_result(uuid);
DROP FUNCTION IF EXISTS app_private.finish_attempt(uuid, jsonb);
DROP FUNCTION IF EXISTS app_private.is_test_manager(uuid, uuid);
DROP FUNCTION IF EXISTS app_private.question_is_complete(public.questions);
DROP FUNCTION IF EXISTS app_private.shared_grace();
ALTER TABLE public.custom_test_attempt_answers DROP COLUMN IF EXISTS flagged;
ALTER TABLE public.custom_tests DROP CONSTRAINT IF EXISTS custom_tests_window_check;
ALTER TABLE public.custom_tests DROP COLUMN IF EXISTS share_token, DROP COLUMN IF EXISTS starts_at;
GRANT SELECT ON public.custom_tests TO anon, authenticated;

-- ===== Admin privacy and question audit, 2026-10-12 =====
-- Any admin (sub-admins too) may read student exams, payments, receipts and attempt emails again.
DROP FUNCTION IF EXISTS public.admin_delete_question(uuid, uuid);
DROP TABLE IF EXISTS public.admin_audit_log;
DROP POLICY IF EXISTS "central admin reads exams" ON public.exams;
CREATE POLICY "admins read exams" ON public.exams FOR SELECT TO authenticated USING (public.is_any_admin(auth.uid()));
DROP POLICY IF EXISTS "users view own payments or central admin" ON public.subscription_payments;
CREATE POLICY "users view own payments or admins view all" ON public.subscription_payments
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_any_admin(auth.uid()));
DROP POLICY IF EXISTS "users view own receipts or central admin" ON public.payment_receipts;
CREATE POLICY "users view own receipts" ON public.payment_receipts
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.is_any_admin(auth.uid()));
DROP POLICY IF EXISTS "central admin updates receipts" ON public.payment_receipts;
CREATE POLICY "admins update receipts" ON public.payment_receipts FOR UPDATE TO authenticated USING (public.is_any_admin(auth.uid()));
DROP POLICY IF EXISTS "users view own attempts or central admin" ON public.custom_test_attempts;
CREATE POLICY "Users view their custom test attempts" ON public.custom_test_attempts
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR app_private.is_any_admin(auth.uid()));
DROP POLICY IF EXISTS "users view own attempt answers or central admin" ON public.custom_test_attempt_answers;
CREATE POLICY "Users view their custom test answers" ON public.custom_test_attempt_answers
  FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.custom_test_attempts a
    WHERE a.id = attempt_id AND (a.user_id = auth.uid() OR app_private.is_any_admin(auth.uid()))));

-- ===== Fix pass, 2026-10-09 (newest first) =====
-- selection reasons: the column and its function go
DROP FUNCTION IF EXISTS public.record_selection_reasons(uuid, uuid, jsonb);
ALTER TABLE public.exam_answers DROP COLUMN IF EXISTS selection_reason;
-- AI learning features: insights and readiness history go
DROP FUNCTION IF EXISTS public.record_readiness_snapshot(uuid, public.exam_type, text, integer, numeric, jsonb, numeric);
DROP TABLE IF EXISTS public.readiness_snapshots;
DROP TABLE IF EXISTS public.ai_insights;
-- quota enforcement: start_exam_session goes back to trusting the service's check
DROP FUNCTION IF EXISTS app_private.tier_limits(public.user_tier);
CREATE OR REPLACE FUNCTION public.start_exam_session(
  _user_id uuid, _exam_type public.exam_type, _category text, _session_type text,
  _time_limit_minutes integer, _topics text[], _question_ids uuid[], _today date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private AS $$
DECLARE
  v_exam_id uuid;
  v_stale record;
  v_inserted integer;
  v_count integer := coalesce(cardinality(_question_ids), 0);
BEGIN
  IF v_count = 0 OR v_count <> (SELECT count(DISTINCT qid) FROM unnest(_question_ids) AS qid) THEN
    RAISE EXCEPTION 'invalid_question_set';
  END IF;
  IF _time_limit_minutes IS NULL OR _time_limit_minutes NOT BETWEEN 1 AND 180 THEN
    RAISE EXCEPTION 'invalid_time_limit';
  END IF;

  -- Serialise concurrent starts for this student before looking at their sessions.
  PERFORM 1 FROM public.profiles WHERE id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;

  FOR v_stale IN
    SELECT id FROM public.exams WHERE user_id = _user_id AND status = 'in_progress' AND deadline_at <= now()
  LOOP
    PERFORM app_private.finalize_exam(v_stale.id, _user_id);
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.exams WHERE user_id = _user_id AND status = 'in_progress') THEN
    RAISE EXCEPTION 'active_session_exists';
  END IF;

  INSERT INTO public.exams
    (user_id, exam_type, category, total_questions, time_limit_minutes, session_type, deadline_at, topics)
  VALUES
    (_user_id, _exam_type, _category, v_count, _time_limit_minutes, _session_type,
     now() + make_interval(mins => _time_limit_minutes), coalesce(_topics, '{}'))
  RETURNING id INTO v_exam_id;

  INSERT INTO public.exam_answers (exam_id, question_id, position, topic)
  SELECT v_exam_id, q.id, (u.ord - 1)::integer, q.topic
    FROM unnest(_question_ids) WITH ORDINALITY AS u(qid, ord)
    JOIN public.questions q ON q.id = u.qid AND q.exam_type = _exam_type AND q.status = 'active';
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  IF v_inserted <> v_count THEN RAISE EXCEPTION 'invalid_question_set'; END IF;

  UPDATE public.profiles
     SET questions_today = CASE WHEN last_question_date = _today THEN questions_today ELSE 0 END + v_count,
         last_question_date = _today
   WHERE id = _user_id;

  RETURN v_exam_id;
END $$;
-- score integrity: the flag, its trigger and the verified-only leaderboards go (the bodies below are the previous ones)
DROP TRIGGER IF EXISTS exams_mark_score_verified ON public.exams;
DROP FUNCTION IF EXISTS app_private.mark_score_verified();
ALTER TABLE public.exams DROP COLUMN IF EXISTS score_verified;
-- Daily leaderboard: sort by avg score desc, then attempted desc (tie-breaker)
CREATE OR REPLACE FUNCTION public.get_daily_leaderboard()
RETURNS TABLE(user_id uuid, username text, avg_score numeric, attempted integer, correct integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH today_answers AS (
    SELECT e.user_id, ea.user_answer, ea.is_correct, e.score_pct
    FROM public.exams e
    JOIN public.exam_answers ea ON ea.exam_id = e.id
    WHERE e.status = 'completed'
      AND e.completed_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
  ),
  per_user AS (
    SELECT user_id,
      COUNT(*) FILTER (WHERE user_answer IS NOT NULL)::int AS attempted,
      COUNT(*) FILTER (WHERE is_correct = true)::int AS correct
    FROM today_answers GROUP BY user_id
  ),
  scores AS (
    SELECT e.user_id, AVG(e.score_pct) AS avg_score
    FROM public.exams e
    WHERE e.status = 'completed'
      AND e.completed_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
      AND e.score_pct IS NOT NULL
    GROUP BY e.user_id
  )
  SELECT p.user_id, COALESCE(pr.username, 'Anonymous'),
         COALESCE(s.avg_score, 0)::numeric, p.attempted, p.correct
  FROM per_user p
  LEFT JOIN scores s ON s.user_id = p.user_id
  LEFT JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.attempted >= 100
  ORDER BY COALESCE(s.avg_score, 0) DESC, p.attempted DESC, p.correct DESC
  LIMIT 50;
$function$;

-- Weekly leaderboard (Mon–Sun, UTC) with 4-of-7 consistency rule
CREATE OR REPLACE FUNCTION public.get_weekly_leaderboard()
RETURNS TABLE(user_id uuid, username text, avg_score numeric, attempted integer, correct integer, active_days integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH week_bounds AS (
    SELECT date_trunc('week', now() AT TIME ZONE 'UTC') AS wk_start
  ),
  week_answers AS (
    SELECT e.user_id,
           (e.completed_at AT TIME ZONE 'UTC')::date AS day,
           ea.user_answer, ea.is_correct
    FROM public.exams e
    JOIN public.exam_answers ea ON ea.exam_id = e.id, week_bounds w
    WHERE e.status = 'completed'
      AND e.completed_at >= w.wk_start
      AND e.completed_at < w.wk_start + interval '7 days'
  ),
  per_user_day AS (
    SELECT user_id, day, COUNT(*) FILTER (WHERE user_answer IS NOT NULL)::int AS attempted
    FROM week_answers GROUP BY user_id, day
  ),
  qualifying AS (
    SELECT user_id, COUNT(*)::int AS active_days
    FROM per_user_day WHERE attempted >= 100 GROUP BY user_id HAVING COUNT(*) >= 4
  ),
  totals AS (
    SELECT user_id,
      COUNT(*) FILTER (WHERE user_answer IS NOT NULL)::int AS attempted,
      COUNT(*) FILTER (WHERE is_correct = true)::int AS correct
    FROM week_answers GROUP BY user_id
  ),
  scores AS (
    SELECT e.user_id, AVG(e.score_pct) AS avg_score
    FROM public.exams e, week_bounds w
    WHERE e.status = 'completed'
      AND e.completed_at >= w.wk_start
      AND e.completed_at < w.wk_start + interval '7 days'
      AND e.score_pct IS NOT NULL
    GROUP BY e.user_id
  )
  SELECT q.user_id, COALESCE(pr.username, 'Anonymous'),
         COALESCE(s.avg_score, 0)::numeric, t.attempted, t.correct, q.active_days
  FROM qualifying q
  JOIN totals t ON t.user_id = q.user_id
  LEFT JOIN scores s ON s.user_id = q.user_id
  LEFT JOIN public.profiles pr ON pr.id = q.user_id
  ORDER BY COALESCE(s.avg_score, 0) DESC, t.attempted DESC, t.correct DESC
  LIMIT 100;
$function$;

GRANT EXECUTE ON FUNCTION public.get_weekly_leaderboard() TO authenticated;

-- Ensure exams table is in realtime publication for live leaderboard updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'exams'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.exams';
  END IF;
END $$;

-- Schedule Sunday-night reset (Mon 00:00 UTC = end of Sunday) — daily_reset already handles counters
SELECT cron.unschedule('weekly-reset') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-reset');
SELECT cron.schedule('weekly-reset', '0 0 * * 1', $$SELECT public.daily_reset();$$);
-- hints_used: the nine-argument save_exam_answer and the column go (the next section drops the rest of the engine)
DROP FUNCTION IF EXISTS public.save_exam_answer(uuid, uuid, uuid, integer, char, text, boolean, integer, boolean);
ALTER TABLE public.exam_answers DROP COLUMN IF EXISTS hints_used;
-- shared tests: admins get their direct writes back, the service functions go
GRANT INSERT, UPDATE, DELETE ON public.custom_tests, public.custom_test_questions TO anon, authenticated;
DROP FUNCTION IF EXISTS public.list_custom_test_summaries(uuid);
DROP FUNCTION IF EXISTS public.import_custom_test_to_bank(uuid, uuid, text);
DROP FUNCTION IF EXISTS public.submit_shared_attempt(uuid, text, jsonb);
DROP FUNCTION IF EXISTS public.create_custom_test(uuid, text, text, public.exam_type, text, integer, timestamptz, text, jsonb);
-- roles and directories: put the previous (any-admin) tier checks and the old directory back
DROP FUNCTION IF EXISTS public.count_users_by_tier();
DROP FUNCTION IF EXISTS public.list_user_directory(integer, integer);
CREATE OR REPLACE FUNCTION public.get_subadmin_user_directory()
RETURNS TABLE(username text, tier public.user_tier)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public, app_private AS $$
  SELECT p.username, p.tier
  FROM public.profiles p
  WHERE app_private.is_any_admin(auth.uid())
  ORDER BY lower(coalesce(p.username, '')), p.id;
$$;
REVOKE ALL ON FUNCTION public.get_subadmin_user_directory() FROM PUBLIC, anon, authenticated;
CREATE OR REPLACE FUNCTION app_private.assign_user_tier(_user_id uuid, _tier user_tier, _days int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app_private.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _tier = 'novice' THEN
    UPDATE public.profiles SET tier = 'novice', expiry_date = NULL WHERE id = _user_id;
  ELSE
    UPDATE public.profiles
      SET tier = _tier,
          expiry_date = CASE WHEN _days IS NULL OR _days <= 0 THEN NULL ELSE now() + (_days || ' days')::interval END
      WHERE id = _user_id;
  END IF;
END $$;
CREATE OR REPLACE FUNCTION app_private.approve_receipt(_receipt_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  s RECORD;
  days INT;
BEGIN
  IF NOT app_private.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO r FROM public.payment_receipts WHERE id = _receipt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found'; END IF;
  SELECT * INTO s FROM public.app_settings WHERE id = 1;
  days := CASE WHEN r.target_tier = 'erudite' THEN s.erudite_days ELSE s.scholar_days END;
  UPDATE public.profiles
    SET tier = r.target_tier, expiry_date = now() + (days || ' days')::interval
    WHERE id = r.user_id;
  UPDATE public.payment_receipts
    SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = _receipt_id;
END $$;

DROP FUNCTION IF EXISTS public.get_explainable_shared_question(uuid, text, uuid);
DROP FUNCTION IF EXISTS public.get_explainable_question(uuid, uuid, uuid);
DROP FUNCTION IF EXISTS public.consume_rate_limit(text, integer, integer);
DROP TABLE IF EXISTS app_private.rate_limit_hits;

-- ===== Milestone 3 (newest first) =====
-- admin content management: give admins their direct question writes back
GRANT INSERT, UPDATE, DELETE ON public.questions TO anon, authenticated;
CREATE POLICY "admins insert questions" ON public.questions FOR INSERT TO authenticated WITH CHECK (public.is_any_admin(auth.uid()));
CREATE POLICY "admins update questions" ON public.questions FOR UPDATE TO authenticated USING (public.is_any_admin(auth.uid()));
CREATE POLICY "admins delete questions" ON public.questions FOR DELETE TO authenticated USING (public.is_any_admin(auth.uid()));

DROP FUNCTION IF EXISTS public.mark_notifications_read(uuid, uuid[]);
DROP FUNCTION IF EXISTS public.count_unread_notifications(uuid);
DROP FUNCTION IF EXISTS public.list_notifications(uuid, boolean, integer, integer);
DROP FUNCTION IF EXISTS public.record_notification_failure(uuid, text);
DROP FUNCTION IF EXISTS public.mark_notifications_dispatched(uuid[]);
DROP FUNCTION IF EXISTS public.claim_notifications(uuid, integer, integer, integer);
DROP TRIGGER IF EXISTS friend_challenges_notify_declined ON public.friend_challenges;
DROP TRIGGER IF EXISTS friend_challenges_notify_received ON public.friend_challenges;
DROP TRIGGER IF EXISTS friendships_notify_accepted ON public.friendships;
DROP TRIGGER IF EXISTS friendships_notify_request ON public.friendships;
DROP FUNCTION IF EXISTS app_private.notify_challenge_declined();
DROP FUNCTION IF EXISTS app_private.notify_challenge_received();
DROP FUNCTION IF EXISTS app_private.notify_friend_accepted();
DROP FUNCTION IF EXISTS app_private.notify_friend_request();
DROP FUNCTION IF EXISTS app_private.username_of(uuid);
DROP FUNCTION IF EXISTS app_private.enqueue_notification(uuid, text, jsonb);
DROP TABLE IF EXISTS public.notifications;
DROP TABLE IF EXISTS public.notification_outbox;
DROP FUNCTION IF EXISTS public.get_friend_challenge_views(uuid, integer, integer, uuid);
DROP FUNCTION IF EXISTS public.start_friend_challenge_session(uuid, uuid, integer, date);
DROP FUNCTION IF EXISTS public.decline_friend_challenge(uuid, uuid);
DROP FUNCTION IF EXISTS public.create_friend_challenge(uuid, uuid, public.exam_type, uuid[], timestamptz, integer);
DROP TABLE IF EXISTS public.friend_challenges;
DROP TABLE IF EXISTS public.study_plans;
DROP FUNCTION IF EXISTS public.list_friendships(uuid, text, integer, integer);
DROP FUNCTION IF EXISTS public.remove_friendship(uuid, uuid);
DROP FUNCTION IF EXISTS public.respond_friend_request(uuid, uuid, boolean, integer);
DROP FUNCTION IF EXISTS public.request_friend(uuid, text, integer, integer);
DROP FUNCTION IF EXISTS app_private.friend_count(uuid);
DROP TABLE IF EXISTS public.friendships;
DROP FUNCTION IF EXISTS public.get_unpaid_daily_challenges(uuid, integer);
DROP FUNCTION IF EXISTS public.get_daily_challenge_view(uuid, date);
DROP FUNCTION IF EXISTS public.start_challenge_session(uuid, uuid, integer, date);
DROP FUNCTION IF EXISTS public.create_daily_challenge(uuid, date, public.exam_type, uuid[]);
DROP TABLE IF EXISTS public.daily_challenges;
DROP FUNCTION IF EXISTS public.get_engagement_snapshot(uuid, integer, integer);
DROP FUNCTION IF EXISTS public.get_unawarded_sessions(uuid, integer);
DROP FUNCTION IF EXISTS public.get_xp_total(uuid);
DROP FUNCTION IF EXISTS public.unlock_achievements(uuid, jsonb);
DROP FUNCTION IF EXISTS public.record_xp_events(uuid, jsonb);
DROP TABLE IF EXISTS public.user_achievements;
DROP TABLE IF EXISTS public.xp_events;
DROP FUNCTION IF EXISTS public.get_study_days(uuid, date);

-- ===== Milestone 2: intelligence support functions =====
DROP INDEX IF EXISTS public.idx_stats_user_review_stale;
ALTER TABLE public.user_question_stats DROP COLUMN IF EXISTS review_stale;
DROP FUNCTION IF EXISTS public.apply_review_states(uuid, jsonb);
DROP FUNCTION IF EXISTS public.get_question_difficulty_stats(uuid[]);
DROP FUNCTION IF EXISTS public.get_student_attempts(uuid, timestamptz, uuid[], integer);

-- ===== 3. bookmarks and question reports =====
DROP TABLE IF EXISTS public.question_reports;
DROP TABLE IF EXISTS public.bookmarks;

-- ===== 2. exam session engine =====
DROP FUNCTION IF EXISTS public.submit_exam_session(uuid, uuid);
DROP FUNCTION IF EXISTS public.save_exam_answer(uuid, uuid, uuid, integer, char, text, boolean, integer);
DROP FUNCTION IF EXISTS public.start_exam_session(uuid, public.exam_type, text, text, integer, text[], uuid[], date);
DROP FUNCTION IF EXISTS app_private.finalize_exam(uuid, uuid);
DROP INDEX IF EXISTS public.exams_one_active_per_user;
DROP TABLE IF EXISTS public.user_question_stats;

DROP POLICY IF EXISTS "students read own exams" ON public.exams;
DROP POLICY IF EXISTS "students read own answers" ON public.exam_answers;
CREATE POLICY "users manage own exams" ON public.exams
  FOR ALL TO authenticated USING (user_id = auth.uid()) WITH CHECK (user_id = auth.uid());
CREATE POLICY "users manage own answers" ON public.exam_answers FOR ALL TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_id AND e.user_id = auth.uid()))
  WITH CHECK (EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_id AND e.user_id = auth.uid()));
-- The old schema also held these table privileges for `anon` (RLS policies only admit `authenticated`).
GRANT INSERT, UPDATE, DELETE ON public.exams, public.exam_answers TO anon, authenticated;

DROP INDEX IF EXISTS public.idx_exam_answers_question;
ALTER TABLE public.exam_answers
  DROP COLUMN IF EXISTS topic, DROP COLUMN IF EXISTS first_answer, DROP COLUMN IF EXISTS answer_changes,
  DROP COLUMN IF EXISTS time_spent_ms, DROP COLUMN IF EXISTS confidence, DROP COLUMN IF EXISTS answered_at,
  DROP COLUMN IF EXISTS attempt_number;

DROP INDEX IF EXISTS public.idx_exams_user_status_completed;
ALTER TABLE public.exams
  DROP COLUMN IF EXISTS session_type, DROP COLUMN IF EXISTS deadline_at, DROP COLUMN IF EXISTS submitted_at,
  DROP COLUMN IF EXISTS auto_submitted, DROP COLUMN IF EXISTS time_spent_ms, DROP COLUMN IF EXISTS topics;

-- ===== 1. question catalog and profile lockdown =====
DROP FUNCTION IF EXISTS public.get_question_topic_counts(public.exam_type);

DROP POLICY IF EXISTS "students read active questions, admins read all" ON public.questions;
CREATE POLICY "any authenticated reads questions" ON public.questions
  FOR SELECT TO authenticated USING (true);
GRANT SELECT ON public.questions TO anon, authenticated;

DROP TRIGGER IF EXISTS update_questions_updated_at ON public.questions;
DROP INDEX IF EXISTS public.idx_questions_catalog;
DROP INDEX IF EXISTS public.idx_questions_subtopic;
ALTER TABLE public.questions
  DROP COLUMN IF EXISTS difficulty, DROP COLUMN IF EXISTS status, DROP COLUMN IF EXISTS tags,
  DROP COLUMN IF EXISTS source, DROP COLUMN IF EXISTS subtopic_id, DROP COLUMN IF EXISTS updated_at;
DROP TABLE IF EXISTS public.subtopics;

GRANT INSERT, UPDATE, DELETE ON public.profiles TO anon, authenticated;
