-- Fix pass / shared tests (ADR-0009). The multi-write operations of the shared-test feature become
-- one transaction each, with the caller named explicitly (no auth.uid(): only the server calls them),
-- and admins lose their direct write access to the test tables, as they did for questions.

-- Creates a published test and all its questions, or nothing.
CREATE OR REPLACE FUNCTION public.create_custom_test(
  _owner_id uuid, _title text, _description text, _exam_type public.exam_type, _source_mode text,
  _duration_minutes integer, _expires_at timestamptz, _token_hash text, _questions jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_count integer;
BEGIN
  IF jsonb_typeof(_questions) <> 'array' THEN RAISE EXCEPTION 'invalid_question_set'; END IF;
  v_count := jsonb_array_length(_questions);
  IF v_count NOT BETWEEN 1 AND 250 THEN RAISE EXCEPTION 'invalid_question_set'; END IF;
  IF EXISTS (
    SELECT 1 FROM jsonb_array_elements(_questions) q
     WHERE btrim(coalesce(q->>'question_text', '')) = '' OR btrim(coalesce(q->>'option_a', '')) = ''
        OR btrim(coalesce(q->>'option_b', '')) = '' OR btrim(coalesce(q->>'option_c', '')) = ''
        OR btrim(coalesce(q->>'option_d', '')) = ''
        OR upper(btrim(coalesce(q->>'correct_answer', ''))) NOT IN ('A', 'B', 'C', 'D')
  ) THEN RAISE EXCEPTION 'invalid_question_set'; END IF;

  INSERT INTO public.custom_tests
    (owner_id, title, description, exam_type, source_mode, duration_minutes, expires_at, token_hash, status)
  VALUES
    (_owner_id, btrim(_title), nullif(btrim(coalesce(_description, '')), ''), _exam_type, _source_mode,
     _duration_minutes, _expires_at, _token_hash, 'published')
  RETURNING id INTO v_id;

  INSERT INTO public.custom_test_questions
    (custom_test_id, source_question_id, source_kind, question_text, option_a, option_b, option_c, option_d,
     correct_answer, rationale, position)
  SELECT v_id, nullif(q.value->>'source_question_id', '')::uuid, q.value->>'source_kind',
         q.value->>'question_text', q.value->>'option_a', q.value->>'option_b', q.value->>'option_c',
         q.value->>'option_d', upper(btrim(q.value->>'correct_answer')), nullif(q.value->>'rationale', ''),
         (q.ordinality - 1)::integer
    FROM jsonb_array_elements(_questions) WITH ORDINALITY AS q(value, ordinality);
  RETURN v_id;
END $$;

-- Scores and closes a shared-test attempt in one transaction, from the stored key. Named failures:
-- attempt_not_found (also a wrong key), attempt_closed, answers_not_in_test, too_few_answered:<n>.
CREATE OR REPLACE FUNCTION public.submit_shared_attempt(_attempt_id uuid, _access_hash text, _answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.custom_test_attempts%ROWTYPE;
  v_minutes integer;
  v_ids uuid[];
  v_answered integer;
  v_needed integer;
  v_correct integer;
  v_score numeric;
BEGIN
  SELECT * INTO a FROM public.custom_test_attempts
   WHERE id = _attempt_id AND access_hash = btrim(_access_hash) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'attempt_not_found'; END IF;
  IF a.status <> 'in_progress' THEN RAISE EXCEPTION 'attempt_closed'; END IF;
  IF jsonb_typeof(_answers) <> 'array' OR jsonb_array_length(_answers) > 250 THEN
    RAISE EXCEPTION 'answers_not_in_test';
  END IF;

  SELECT array_agg((e->>'question_id')::uuid) INTO v_ids FROM jsonb_array_elements(_answers) e;
  v_ids := coalesce(v_ids, '{}');
  IF cardinality(v_ids) <> (SELECT count(DISTINCT x) FROM unnest(v_ids) x)
     OR EXISTS (SELECT 1 FROM unnest(v_ids) x
                 WHERE x NOT IN (SELECT id FROM public.custom_test_questions WHERE custom_test_id = a.custom_test_id)) THEN
    RAISE EXCEPTION 'answers_not_in_test';
  END IF;

  SELECT count(*) INTO v_answered FROM jsonb_array_elements(_answers) e
   WHERE upper(btrim(coalesce(e->>'user_answer', ''))) IN ('A', 'B', 'C', 'D');
  SELECT duration_minutes INTO v_minutes FROM public.custom_tests WHERE id = a.custom_test_id;
  v_needed := ceil(a.total_questions * 0.8)::integer;
  IF now() < a.started_at + make_interval(mins => v_minutes) AND v_answered < v_needed THEN
    RAISE EXCEPTION 'too_few_answered:%', v_needed;
  END IF;

  INSERT INTO public.custom_test_attempt_answers (attempt_id, custom_test_question_id, user_answer, is_correct, position)
  SELECT a.id, q.id, s.letter, coalesce(s.letter = q.correct_answer, false), q.position
    FROM public.custom_test_questions q
    LEFT JOIN (
      SELECT (e->>'question_id')::uuid AS qid,
             CASE WHEN upper(btrim(coalesce(e->>'user_answer', ''))) IN ('A', 'B', 'C', 'D')
                  THEN upper(btrim(e->>'user_answer')) END AS letter
        FROM jsonb_array_elements(_answers) e) s ON s.qid = q.id
   WHERE q.custom_test_id = a.custom_test_id
  ON CONFLICT (attempt_id, custom_test_question_id) DO UPDATE
    SET user_answer = EXCLUDED.user_answer, is_correct = EXCLUDED.is_correct;

  SELECT count(*) FILTER (WHERE is_correct) INTO v_correct
    FROM public.custom_test_attempt_answers WHERE attempt_id = a.id;
  v_score := round(v_correct::numeric * 100 / a.total_questions, 2);

  UPDATE public.custom_test_attempts
     SET status = 'completed', completed_at = now(), correct_count = v_correct, score_pct = v_score
   WHERE id = a.id;

  RETURN jsonb_build_object(
    'score', v_score, 'correct', v_correct, 'total', a.total_questions,
    'results', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'question_id', q.id, 'question_position', q.position, 'question_text', q.question_text,
        'option_a', q.option_a, 'option_b', q.option_b, 'option_c', q.option_c, 'option_d', q.option_d,
        'correct_answer', q.correct_answer, 'rationale', q.rationale,
        'user_answer', aa.user_answer, 'is_correct', aa.is_correct) ORDER BY q.position), '[]'::jsonb)
      FROM public.custom_test_questions q
      JOIN public.custom_test_attempt_answers aa ON aa.custom_test_question_id = q.id AND aa.attempt_id = a.id
     WHERE q.custom_test_id = a.custom_test_id));
END $$;

-- Copies a test's not-yet-imported questions into the bank, once each, for the test's owner.
CREATE OR REPLACE FUNCTION public.import_custom_test_to_bank(_admin_id uuid, _test_id uuid, _topic text)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_exam_type public.exam_type;
  v_added integer;
BEGIN
  SELECT exam_type INTO v_exam_type FROM public.custom_tests WHERE id = _test_id AND owner_id = _admin_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'test_not_found'; END IF;
  IF btrim(coalesce(_topic, '')) = '' THEN RAISE EXCEPTION 'invalid_topic'; END IF;

  INSERT INTO public.questions
    (exam_type, topic, question_text, option_a, option_b, option_c, option_d, correct_answer, rationale, created_by)
  SELECT v_exam_type, btrim(_topic), q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
         q.correct_answer, q.rationale, _admin_id
    FROM public.custom_test_questions q
   WHERE q.custom_test_id = _test_id AND NOT q.imported_to_bank;
  GET DIAGNOSTICS v_added = ROW_COUNT;

  UPDATE public.custom_test_questions SET imported_to_bank = true, imported_at = now()
   WHERE custom_test_id = _test_id AND NOT imported_to_bank;
  RETURN v_added;
END $$;

-- One row per test the admin owns, with its counts, in one query (the old code asked twice per test).
CREATE OR REPLACE FUNCTION public.list_custom_test_summaries(_owner_id uuid)
RETURNS TABLE (
  id uuid, title text, description text, exam_type public.exam_type, source_mode text,
  duration_minutes integer, expires_at timestamptz, status public.custom_test_status, created_at timestamptz,
  question_count integer, participant_count integer, pass_count integer, average_score numeric)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT t.id, t.title, t.description, t.exam_type, t.source_mode, t.duration_minutes, t.expires_at, t.status,
         t.created_at,
         (SELECT count(*)::integer FROM public.custom_test_questions q WHERE q.custom_test_id = t.id),
         (SELECT count(*)::integer FROM public.custom_test_attempts a WHERE a.custom_test_id = t.id AND a.status = 'completed'),
         (SELECT count(*)::integer FROM public.custom_test_attempts a
           WHERE a.custom_test_id = t.id AND a.status = 'completed' AND a.score_pct >= 50),
         coalesce((SELECT round(avg(a.score_pct), 2) FROM public.custom_test_attempts a
                    WHERE a.custom_test_id = t.id AND a.status = 'completed'), 0)
    FROM public.custom_tests t
   WHERE t.owner_id = _owner_id
   ORDER BY t.created_at DESC
   LIMIT 200
$$;

REVOKE INSERT, UPDATE, DELETE ON public.custom_tests, public.custom_test_questions FROM anon, authenticated;

REVOKE ALL ON FUNCTION public.create_custom_test(uuid, text, text, public.exam_type, text, integer, timestamptz, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_shared_attempt(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.import_custom_test_to_bank(uuid, uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_custom_test_summaries(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_custom_test(uuid, text, text, public.exam_type, text, integer, timestamptz, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_shared_attempt(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_custom_test_to_bank(uuid, uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_custom_test_summaries(uuid) TO service_role;
