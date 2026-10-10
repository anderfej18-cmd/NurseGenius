-- Milestone 2: read and write support for the deterministic intelligence engines. The engines are
-- pure TypeScript; these functions only fetch attempt history and store the derived review cache.
-- All three are executable by the service role only (the server passes the verified user id).

-- ============ A student's answered attempts ============
-- One row per answered question in a completed session, newest first. Correctness is recomputed from
-- the answer key: stored is_correct flags written by older clients are not trusted.
CREATE OR REPLACE FUNCTION public.get_student_attempts(
  _user_id uuid,
  _since timestamptz DEFAULT NULL,
  _question_ids uuid[] DEFAULT NULL,
  _limit integer DEFAULT 5000)
RETURNS TABLE (
  question_id uuid, topic text, exam_type public.exam_type, session_id uuid, session_type text,
  correct boolean, answered_at timestamptz, difficulty text, confidence text, time_spent_ms integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT ea.question_id, q.topic, e.exam_type, e.id, e.session_type,
         upper(btrim(ea.user_answer)) = upper(btrim(q.correct_answer)),
         coalesce(ea.answered_at, e.completed_at), q.difficulty, ea.confidence, ea.time_spent_ms
    FROM public.exams e
    JOIN public.exam_answers ea ON ea.exam_id = e.id
    JOIN public.questions q ON q.id = ea.question_id
   WHERE e.user_id = _user_id
     AND e.status = 'completed'
     AND ea.user_answer IS NOT NULL
     AND (_since IS NULL OR coalesce(ea.answered_at, e.completed_at) >= _since)
     AND (_question_ids IS NULL OR ea.question_id = ANY (_question_ids))
   ORDER BY coalesce(ea.answered_at, e.completed_at) DESC, ea.id
   LIMIT least(greatest(_limit, 1), 20000)
$$;

-- ============ How hard each question has proved, across all students ============
-- Aggregates only (attempts and correct answers); the server turns them into an empirical difficulty
-- when the sample is large enough. Questions nobody answered are absent.
CREATE OR REPLACE FUNCTION public.get_question_difficulty_stats(_question_ids uuid[])
RETURNS TABLE (question_id uuid, attempts integer, correct integer)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF cardinality(_question_ids) > 20000 THEN RAISE EXCEPTION 'too_many_questions'; END IF;
  RETURN QUERY
    SELECT ea.question_id, count(*)::integer,
           (count(*) FILTER (WHERE upper(btrim(ea.user_answer)) = upper(btrim(q.correct_answer))))::integer
      FROM public.exam_answers ea
      JOIN public.exams e ON e.id = ea.exam_id AND e.status = 'completed'
      JOIN public.questions q ON q.id = ea.question_id
     WHERE ea.question_id = ANY (_question_ids) AND ea.user_answer IS NOT NULL
     GROUP BY ea.question_id;
END $$;

-- ============ Review schedule cache ============
-- Every answered attempt is one review, so a schedule is up to date exactly when review_count equals
-- attempts. PostgREST cannot compare two columns in a filter, hence a generated flag.
ALTER TABLE public.user_question_stats
  ADD COLUMN review_stale boolean GENERATED ALWAYS AS (review_count <> attempts) STORED;
CREATE INDEX idx_stats_user_review_stale ON public.user_question_stats (user_id) WHERE review_stale;

-- The scheduler recomputes each schedule from the attempt history; this stores the result on the
-- caller's own statistics rows. Only review columns are written; rows that do not exist are skipped.
CREATE OR REPLACE FUNCTION public.apply_review_states(_user_id uuid, _states jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_changed integer;
BEGIN
  IF jsonb_array_length(_states) > 1000 THEN RAISE EXCEPTION 'too_many_states'; END IF;
  UPDATE public.user_question_stats s
     SET next_review_at = x.next_review_at, review_count = x.review_count,
         last_reviewed_at = x.last_reviewed_at, review_status = x.review_status,
         interval_days = x.interval_days, ease = x.ease, updated_at = now()
    FROM jsonb_to_recordset(_states) AS x(
           question_id uuid, next_review_at timestamptz, review_count integer,
           last_reviewed_at timestamptz, review_status text, interval_days numeric, ease numeric)
   WHERE s.user_id = _user_id AND s.question_id = x.question_id;
  GET DIAGNOSTICS v_changed = ROW_COUNT;
  RETURN v_changed;
END $$;

REVOKE ALL ON FUNCTION public.get_student_attempts(uuid, timestamptz, uuid[], integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_question_difficulty_stats(uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.apply_review_states(uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_student_attempts(uuid, timestamptz, uuid[], integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_question_difficulty_stats(uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.apply_review_states(uuid, jsonb) TO service_role;
