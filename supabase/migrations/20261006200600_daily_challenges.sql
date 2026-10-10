-- Milestone 3 / daily challenges: one stored instance per student per UTC day. The server chooses the
-- questions when the instance is created; the student then takes it as an ordinary exam session, so
-- every existing rule (one active session, tier limits, server scoring) applies unchanged.
-- Whether a challenge is done is derived from its exam, so there is no second copy of the result.

CREATE TABLE public.daily_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  challenge_date date NOT NULL,
  exam_type public.exam_type NOT NULL,
  question_ids uuid[] NOT NULL CHECK (cardinality(question_ids) BETWEEN 1 AND 20),
  exam_id uuid REFERENCES public.exams(id) ON DELETE SET NULL,
  started_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, challenge_date)
);
CREATE UNIQUE INDEX daily_challenges_exam_unique ON public.daily_challenges (exam_id) WHERE exam_id IS NOT NULL;

ALTER TABLE public.daily_challenges ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students read own challenges" ON public.daily_challenges
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.daily_challenges FROM anon, authenticated;
GRANT SELECT ON public.daily_challenges TO authenticated;
GRANT ALL ON public.daily_challenges TO service_role;

-- ============ Creating the day's instance ============
-- Returns the student's challenge for `_date`. The first call fixes the question set; later calls
-- return the same instance whatever they pass. The profile row is locked so concurrent calls agree.
CREATE OR REPLACE FUNCTION public.create_daily_challenge(
  _user_id uuid, _date date, _exam_type public.exam_type, _question_ids uuid[])
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_count integer := coalesce(cardinality(_question_ids), 0);
BEGIN
  PERFORM 1 FROM public.profiles WHERE id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;

  SELECT id INTO v_id FROM public.daily_challenges WHERE user_id = _user_id AND challenge_date = _date;
  IF FOUND THEN RETURN v_id; END IF;

  IF v_count NOT BETWEEN 1 AND 20
     OR v_count <> (SELECT count(DISTINCT qid) FROM unnest(_question_ids) AS qid)
     OR v_count <> (SELECT count(*) FROM public.questions
                     WHERE id = ANY (_question_ids) AND exam_type = _exam_type AND status = 'active') THEN
    RAISE EXCEPTION 'invalid_question_set';
  END IF;

  INSERT INTO public.daily_challenges (user_id, challenge_date, exam_type, question_ids)
  VALUES (_user_id, _date, _exam_type, _question_ids)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ============ Taking it ============
-- Starts the exam for the challenge and links the two in one step, so a started challenge always has
-- its session. Asked again, it returns the session already linked. The exam is started by the same
-- function every session uses, so its rules (one active session, the day's allowance) apply.
CREATE OR REPLACE FUNCTION public.start_challenge_session(
  _user_id uuid, _challenge_id uuid, _time_limit_minutes integer, _today date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.daily_challenges%ROWTYPE;
  v_exam uuid;
BEGIN
  SELECT * INTO c FROM public.daily_challenges
   WHERE id = _challenge_id AND user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'challenge_not_found'; END IF;
  IF c.exam_id IS NOT NULL THEN RETURN c.exam_id; END IF;

  v_exam := public.start_exam_session(
    _user_id, c.exam_type, 'Daily challenge', 'daily_challenge', _time_limit_minutes,
    (SELECT array_agg(DISTINCT q.topic ORDER BY q.topic) FROM public.questions q WHERE q.id = ANY (c.question_ids)),
    c.question_ids, _today);
  UPDATE public.daily_challenges SET exam_id = v_exam, started_at = now() WHERE id = c.id;
  RETURN v_exam;
END $$;

-- ============ Reading ============
-- The student's challenge for a day with the state of its exam; no question content.
CREATE OR REPLACE FUNCTION public.get_daily_challenge_view(_user_id uuid, _date date)
RETURNS TABLE (
  id uuid, challenge_date date, exam_type public.exam_type, total_questions integer,
  exam_id uuid, exam_status text, correct_count integer, score_pct numeric, completed_at timestamptz)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, c.challenge_date, c.exam_type, cardinality(c.question_ids)::integer,
         c.exam_id, e.status, e.correct_count, e.score_pct, e.completed_at
    FROM public.daily_challenges c
    LEFT JOIN public.exams e ON e.id = c.exam_id
   WHERE c.user_id = _user_id AND c.challenge_date = _date
$$;

-- Finished challenges whose XP has not been worked out yet, oldest first.
CREATE OR REPLACE FUNCTION public.get_unpaid_daily_challenges(_user_id uuid, _limit integer DEFAULT 50)
RETURNS TABLE (
  challenge_id uuid, completed_at timestamptz, correct_count integer, total_questions integer, score_pct numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT c.id, e.completed_at, e.correct_count, e.total_questions, e.score_pct
    FROM public.daily_challenges c
    JOIN public.exams e ON e.id = c.exam_id AND e.status = 'completed'
   WHERE c.user_id = _user_id
     AND NOT EXISTS (
       SELECT 1 FROM public.xp_events x
        WHERE x.user_id = _user_id AND x.source_type = 'daily_challenge' AND x.source_id = c.id::text)
   ORDER BY e.completed_at, c.id
   LIMIT least(greatest(_limit, 1), 200)
$$;

-- The counters the achievement rules read, now including finished daily challenges.
CREATE OR REPLACE FUNCTION public.get_engagement_snapshot(
  _user_id uuid, _perfect_min_answered integer, _topic_min_attempts integer)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH a AS (
    SELECT e.id AS exam_id, q.topic,
           (upper(btrim(ea.user_answer)) = upper(btrim(q.correct_answer))) AS ok
      FROM public.exams e
      JOIN public.exam_answers ea ON ea.exam_id = e.id
      JOIN public.questions q ON q.id = ea.question_id
     WHERE e.user_id = _user_id AND e.status = 'completed' AND ea.user_answer IS NOT NULL
  ),
  per_session AS (
    SELECT exam_id, count(*) AS n, count(*) FILTER (WHERE ok) AS c FROM a GROUP BY exam_id
  ),
  per_topic AS (SELECT topic, count(*) AS n FROM a GROUP BY topic)
  SELECT jsonb_build_object(
    'questions_answered', (SELECT count(*) FROM a),
    'correct_answers', (SELECT count(*) FROM a WHERE ok),
    'sessions_completed', (SELECT count(*) FROM per_session),
    'perfect_sessions', (SELECT count(*) FROM per_session WHERE n >= _perfect_min_answered AND c = n),
    'topics_practised', (SELECT count(*) FROM per_topic WHERE n >= _topic_min_attempts),
    'daily_challenges_completed', (
      SELECT count(*) FROM public.daily_challenges c
        JOIN public.exams e ON e.id = c.exam_id AND e.status = 'completed'
       WHERE c.user_id = _user_id))
$$;

REVOKE ALL ON FUNCTION public.create_daily_challenge(uuid, date, public.exam_type, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_challenge_session(uuid, uuid, integer, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_daily_challenge_view(uuid, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_unpaid_daily_challenges(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_engagement_snapshot(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_daily_challenge(uuid, date, public.exam_type, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_challenge_session(uuid, uuid, integer, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_daily_challenge_view(uuid, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_unpaid_daily_challenges(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_engagement_snapshot(uuid, integer, integer) TO service_role;
