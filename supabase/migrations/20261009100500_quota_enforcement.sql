-- Fix pass / L3: enforce the tier limits inside the database.
--
-- The service checked the per-session and daily limits from a profile read taken before the database
-- call, so the check and the counter update were not one atomic step. start_exam_session already locks
-- the student's profile row; it now reads the tier and counter under that lock and refuses a session the
-- tier does not allow. Practice, daily-challenge and friend-challenge sessions all start through this
-- function, so they share one rule. The service still checks first, to give a precise message.
--
-- The caps below must equal TIER_DAILY_LIMIT and TIER_SESSION_LIMIT in src/lib/exam-rules.ts; the test
-- src/server/testing/quota-enforcement.test.ts fails if they drift apart.

CREATE OR REPLACE FUNCTION app_private.tier_limits(_tier public.user_tier, OUT daily integer, OUT per_session integer)
LANGUAGE sql IMMUTABLE AS $$
  SELECT CASE _tier WHEN 'novice' THEN 50 WHEN 'erudite' THEN 500 ELSE NULL END,
         CASE _tier WHEN 'novice' THEN 50 WHEN 'erudite' THEN 150 ELSE 250 END;
$$;
REVOKE ALL ON FUNCTION app_private.tier_limits(public.user_tier) FROM PUBLIC, anon, authenticated;

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
  v_tier public.user_tier;
  v_expiry timestamptz;
  v_used integer;
  v_daily integer;
  v_per_session integer;
BEGIN
  IF v_count = 0 OR v_count <> (SELECT count(DISTINCT qid) FROM unnest(_question_ids) AS qid) THEN
    RAISE EXCEPTION 'invalid_question_set';
  END IF;
  IF _time_limit_minutes IS NULL OR _time_limit_minutes NOT BETWEEN 1 AND 180 THEN
    RAISE EXCEPTION 'invalid_time_limit';
  END IF;

  -- Serialise concurrent starts for this student, and read the quota under the same lock.
  SELECT tier, expiry_date,
         CASE WHEN last_question_date = _today THEN questions_today ELSE 0 END
    INTO v_tier, v_expiry, v_used
    FROM public.profiles WHERE id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;

  FOR v_stale IN
    SELECT id FROM public.exams WHERE user_id = _user_id AND status = 'in_progress' AND deadline_at <= now()
  LOOP
    PERFORM app_private.finalize_exam(v_stale.id, _user_id);
  END LOOP;
  IF EXISTS (SELECT 1 FROM public.exams WHERE user_id = _user_id AND status = 'in_progress') THEN
    RAISE EXCEPTION 'active_session_exists';
  END IF;

  -- A paid tier past its expiry counts as novice, as in the application.
  IF v_expiry IS NOT NULL AND v_expiry < now() THEN v_tier := 'novice'; END IF;
  SELECT t.daily, t.per_session INTO v_daily, v_per_session FROM app_private.tier_limits(v_tier) t;
  IF v_count > v_per_session THEN RAISE EXCEPTION 'session_limit_exceeded'; END IF;
  IF v_daily IS NOT NULL AND v_used + v_count > v_daily THEN RAISE EXCEPTION 'daily_limit_reached'; END IF;

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
     SET questions_today = v_used + v_count,
         last_question_date = _today
   WHERE id = _user_id;

  RETURN v_exam_id;
END $$;
