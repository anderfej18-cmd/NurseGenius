-- Fix pass / ask-ai and abuse limits (ADR-0006, ADR-0007).
--
-- 1. A shared, atomic rate limiter that works across every Worker and Edge Function instance.
-- 2. Two functions that tell the AI explainer which question a caller may have explained. The
--    answer key is returned only when the caller has already been shown it (a finished exam of
--    their own, or a finished shared-test attempt whose key they hold).

-- ============ Rate limiter ============
CREATE TABLE app_private.rate_limit_hits (
  bucket text NOT NULL CHECK (length(bucket) BETWEEN 1 AND 200),
  window_start timestamptz NOT NULL,
  hits integer NOT NULL DEFAULT 0 CHECK (hits >= 0),
  PRIMARY KEY (bucket, window_start)
);
CREATE INDEX idx_rate_limit_hits_window ON app_private.rate_limit_hits (window_start);
REVOKE ALL ON app_private.rate_limit_hits FROM PUBLIC, anon, authenticated;

-- One call = one hit. Returns whether the caller is still within `_limit` for the current fixed
-- window of `_window_seconds`, how many hits remain, and how long until the window ends. A refused
-- call still counts, so hammering an exhausted limit gains nothing.
CREATE OR REPLACE FUNCTION public.consume_rate_limit(_bucket text, _limit integer, _window_seconds integer)
RETURNS TABLE (allowed boolean, remaining integer, retry_after_seconds integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private AS $$
DECLARE
  v_start timestamptz;
  v_hits integer;
BEGIN
  IF _bucket IS NULL OR length(_bucket) NOT BETWEEN 1 AND 200
     OR _limit IS NULL OR _limit NOT BETWEEN 1 AND 10000
     OR _window_seconds IS NULL OR _window_seconds NOT BETWEEN 1 AND 604800 THEN
    RAISE EXCEPTION 'invalid_rate_limit';
  END IF;

  v_start := to_timestamp(floor(extract(epoch FROM now()) / _window_seconds) * _window_seconds);

  INSERT INTO app_private.rate_limit_hits AS r (bucket, window_start, hits)
  VALUES (_bucket, v_start, 1)
  ON CONFLICT (bucket, window_start) DO UPDATE SET hits = r.hits + 1
  RETURNING r.hits INTO v_hits;

  -- A new window is the cheap moment to forget windows nobody can still be inside.
  IF v_hits = 1 THEN
    DELETE FROM app_private.rate_limit_hits
     WHERE ctid IN (SELECT ctid FROM app_private.rate_limit_hits
                     WHERE window_start < now() - interval '8 days' LIMIT 100);
  END IF;

  RETURN QUERY SELECT
    v_hits <= _limit,
    greatest(_limit - v_hits, 0),
    greatest(ceil(extract(epoch FROM (v_start + make_interval(secs => _window_seconds) - now())))::integer, 1);
END $$;

-- ============ What the AI explainer may be shown ============
-- A signed-in student's own finished exam. Nothing for a running exam, someone else's exam, or a
-- question that is not in that exam.
CREATE OR REPLACE FUNCTION public.get_explainable_question(_user_id uuid, _exam_id uuid, _question_id uuid)
RETURNS TABLE (
  topic text, question_text text, option_a text, option_b text, option_c text, option_d text,
  correct_answer text, user_answer text, rationale text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT q.topic, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
         q.correct_answer, ea.user_answer::text, q.rationale
    FROM public.exams e
    JOIN public.exam_answers ea ON ea.exam_id = e.id
    JOIN public.questions q ON q.id = ea.question_id
   WHERE e.id = _exam_id AND e.user_id = _user_id AND e.status = 'completed'
     AND ea.question_id = _question_id
$$;

-- A shared-test taker: a finished attempt, proved by the hash of the attempt key they hold, and a
-- question that belongs to that attempt's test. The topic is the test's exam type.
CREATE OR REPLACE FUNCTION public.get_explainable_shared_question(_attempt_id uuid, _access_hash text, _question_id uuid)
RETURNS TABLE (
  topic text, question_text text, option_a text, option_b text, option_c text, option_d text,
  correct_answer text, user_answer text, rationale text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.exam_type::text, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
         q.correct_answer, aa.user_answer, NULL::text
    FROM public.custom_test_attempts a
    JOIN public.custom_tests t ON t.id = a.custom_test_id
    JOIN public.custom_test_questions q ON q.custom_test_id = t.id
    LEFT JOIN public.custom_test_attempt_answers aa
           ON aa.attempt_id = a.id AND aa.custom_test_question_id = q.id
   WHERE a.id = _attempt_id AND a.access_hash = _access_hash AND a.status = 'completed'
     AND q.id = _question_id
$$;

REVOKE ALL ON FUNCTION public.consume_rate_limit(text, integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_explainable_question(uuid, uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_explainable_shared_question(uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_rate_limit(text, integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_explainable_question(uuid, uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_explainable_shared_question(uuid, text, uuid) TO service_role;
