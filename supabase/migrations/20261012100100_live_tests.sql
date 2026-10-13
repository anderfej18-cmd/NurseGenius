-- Live tests (docs/live-tests-integration.md, Phases 2 to 4).
--
-- A shared test gets a schedule (starts_at .. expires_at), a stored link, answers saved on the server as they
-- are chosen (so the deadline is enforced there, not in the browser), random question selection per
-- subcategory inside the database, role-aware lists, and an audited, de-duplicating import.
-- Every function here is called by the server only (service_role); the actor is passed explicitly.

-- 1. Schedule, link, flags ---------------------------------------------------------------------------

ALTER TABLE public.custom_tests ADD COLUMN starts_at timestamptz;
UPDATE public.custom_tests SET starts_at = created_at WHERE starts_at IS NULL;
ALTER TABLE public.custom_tests ALTER COLUMN starts_at SET NOT NULL;
ALTER TABLE public.custom_tests ALTER COLUMN starts_at SET DEFAULT now();
ALTER TABLE public.custom_tests ADD CONSTRAINT custom_tests_window_check CHECK (starts_at < expires_at) NOT VALID;
-- The link itself, so the lists can show it again. Only admin server functions read it; browser roles have
-- no column grant on it (below). The hash stays the lookup key for candidates.
ALTER TABLE public.custom_tests ADD COLUMN share_token text UNIQUE;

ALTER TABLE public.custom_test_attempt_answers ADD COLUMN flagged boolean NOT NULL DEFAULT false;

REVOKE SELECT ON public.custom_tests FROM anon, authenticated;
GRANT SELECT (id, owner_id, title, description, exam_type, source_mode, duration_minutes, expires_at,
              starts_at, token_hash, status, created_at, updated_at)
  ON public.custom_tests TO authenticated;

-- 2. Small helpers -------------------------------------------------------------------------------------

-- How long after its deadline a request may still be accepted (network time), in one place.
CREATE OR REPLACE FUNCTION app_private.shared_grace() RETURNS interval
LANGUAGE sql IMMUTABLE AS $$ SELECT interval '15 seconds' $$;

-- Whether a question row is complete enough to put in a test.
CREATE OR REPLACE FUNCTION app_private.question_is_complete(q public.questions) RETURNS boolean
LANGUAGE sql IMMUTABLE AS $$
  SELECT btrim(coalesce(q.question_text, '')) <> '' AND btrim(coalesce(q.option_a, '')) <> ''
     AND btrim(coalesce(q.option_b, '')) <> '' AND btrim(coalesce(q.option_c, '')) <> ''
     AND btrim(coalesce(q.option_d, '')) <> ''
     AND upper(btrim(coalesce(q.correct_answer::text, ''))) IN ('A', 'B', 'C', 'D')
     AND btrim(q.question_text) !~* '^(question\s*)?\d+\s*[.)]?$'
$$;

CREATE OR REPLACE FUNCTION app_private.is_test_manager(_actor uuid, _owner uuid) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT public.has_role(_actor, 'central_admin') OR (_actor = _owner AND public.is_any_admin(_actor))
$$;

-- 3. Create ----------------------------------------------------------------------------------------------

-- Named failures: not_authorized, invalid_schedule, invalid_question_set, allocation_exceeds_pool:<topic>:<available>.
-- `_allocations` is [{topic, count}] for a bank test (the database draws the questions at random from the
-- active, complete ones of that exam type and topic); `_questions` is the upload's content for a custom test.
CREATE OR REPLACE FUNCTION public.create_live_test(
  _owner_id uuid, _title text, _description text, _exam_type public.exam_type, _source_mode text,
  _duration_minutes integer, _starts_at timestamptz, _expires_at timestamptz, _token_hash text,
  _share_token text, _questions jsonb, _allocations jsonb)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_id uuid;
  v_total integer := 0;
  v_position integer := 0;
  a record;
  v_available integer;
BEGIN
  IF NOT public.is_any_admin(_owner_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  IF btrim(coalesce(_title, '')) = '' OR _duration_minutes NOT BETWEEN 10 AND 180
     OR _starts_at IS NULL OR _expires_at IS NULL OR _expires_at <= _starts_at OR _expires_at <= now() THEN
    RAISE EXCEPTION 'invalid_schedule';
  END IF;
  IF _source_mode NOT IN ('existing', 'upload') THEN RAISE EXCEPTION 'invalid_question_set'; END IF;

  INSERT INTO public.custom_tests
    (owner_id, title, description, exam_type, source_mode, duration_minutes, starts_at, expires_at,
     token_hash, share_token, status)
  VALUES
    (_owner_id, btrim(_title), nullif(btrim(coalesce(_description, '')), ''), _exam_type, _source_mode,
     _duration_minutes, _starts_at, _expires_at, _token_hash, _share_token, 'published')
  RETURNING id INTO v_id;

  IF _source_mode = 'upload' THEN
    IF jsonb_typeof(_questions) <> 'array' OR jsonb_array_length(_questions) NOT BETWEEN 1 AND 250 THEN
      RAISE EXCEPTION 'invalid_question_set';
    END IF;
    IF EXISTS (
      SELECT 1 FROM jsonb_array_elements(_questions) q
       WHERE btrim(coalesce(q->>'question_text', '')) = '' OR btrim(coalesce(q->>'option_a', '')) = ''
          OR btrim(coalesce(q->>'option_b', '')) = '' OR btrim(coalesce(q->>'option_c', '')) = ''
          OR btrim(coalesce(q->>'option_d', '')) = ''
          OR upper(btrim(coalesce(q->>'correct_answer', ''))) NOT IN ('A', 'B', 'C', 'D')
    ) THEN RAISE EXCEPTION 'invalid_question_set'; END IF;
    INSERT INTO public.custom_test_questions
      (custom_test_id, source_kind, question_text, option_a, option_b, option_c, option_d, correct_answer,
       rationale, position)
    SELECT v_id, 'custom', btrim(q.value->>'question_text'), btrim(q.value->>'option_a'),
           btrim(q.value->>'option_b'), btrim(q.value->>'option_c'), btrim(q.value->>'option_d'),
           upper(btrim(q.value->>'correct_answer')), nullif(btrim(coalesce(q.value->>'rationale', '')), ''),
           (q.ordinality - 1)::integer
      FROM jsonb_array_elements(_questions) WITH ORDINALITY AS q(value, ordinality);
    v_total := jsonb_array_length(_questions);
  ELSE
    IF jsonb_typeof(_allocations) <> 'array' OR jsonb_array_length(_allocations) = 0 THEN
      RAISE EXCEPTION 'invalid_question_set';
    END IF;
    IF (SELECT count(DISTINCT btrim(e->>'topic')) FROM jsonb_array_elements(_allocations) e)
       <> jsonb_array_length(_allocations) THEN RAISE EXCEPTION 'invalid_question_set'; END IF;
    FOR a IN
      SELECT btrim(e->>'topic') AS topic, (e->>'count')::integer AS wanted
        FROM jsonb_array_elements(_allocations) e
    LOOP
      IF a.topic = '' OR a.wanted IS NULL OR a.wanted < 1 THEN RAISE EXCEPTION 'invalid_question_set'; END IF;
      SELECT count(*) INTO v_available FROM public.questions q
       WHERE q.exam_type = _exam_type AND q.topic = a.topic AND q.status = 'active'
         AND app_private.question_is_complete(q);
      IF a.wanted > v_available THEN
        RAISE EXCEPTION 'allocation_exceeds_pool:%:%', a.topic, v_available;
      END IF;
      v_total := v_total + a.wanted;
      IF v_total > 250 THEN RAISE EXCEPTION 'invalid_question_set'; END IF;

      INSERT INTO public.custom_test_questions
        (custom_test_id, source_question_id, source_kind, question_text, option_a, option_b, option_c,
         option_d, correct_answer, rationale, position)
      SELECT v_id, p.id, 'existing', p.question_text, p.option_a, p.option_b, p.option_c, p.option_d,
             upper(btrim(p.correct_answer::text)), p.rationale, v_position + (row_number() OVER ())::integer - 1
        FROM (SELECT q.* FROM public.questions q
               WHERE q.exam_type = _exam_type AND q.topic = a.topic AND q.status = 'active'
                 AND app_private.question_is_complete(q)
               ORDER BY random() LIMIT a.wanted) p;
      v_position := v_position + a.wanted;
    END LOOP;
  END IF;
  IF v_total NOT BETWEEN 1 AND 250 THEN RAISE EXCEPTION 'invalid_question_set'; END IF;

  INSERT INTO public.admin_audit_log (actor_id, action, target_id, details)
  VALUES (_owner_id, 'live_test.create', v_id,
          jsonb_build_object('title', btrim(_title), 'exam_type', _exam_type, 'source_mode', _source_mode,
                             'questions', v_total, 'starts_at', _starts_at, 'expires_at', _expires_at));
  RETURN v_id;
END $$;

-- Republish: a new link, schedule and duration for a test the actor owns (the central admin may do any).
CREATE OR REPLACE FUNCTION public.republish_live_test(
  _actor_id uuid, _test_id uuid, _token_hash text, _share_token text, _starts_at timestamptz,
  _expires_at timestamptz, _duration_minutes integer)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.custom_tests%ROWTYPE;
BEGIN
  SELECT * INTO t FROM public.custom_tests WHERE id = _test_id FOR UPDATE;
  IF NOT FOUND OR NOT app_private.is_test_manager(_actor_id, t.owner_id) THEN
    RAISE EXCEPTION 'test_not_found';
  END IF;
  IF _duration_minutes NOT BETWEEN 10 AND 180 OR _starts_at IS NULL OR _expires_at IS NULL
     OR _expires_at <= _starts_at OR _expires_at <= now() THEN
    RAISE EXCEPTION 'invalid_schedule';
  END IF;
  UPDATE public.custom_tests
     SET status = 'published', starts_at = _starts_at, expires_at = _expires_at,
         duration_minutes = _duration_minutes, token_hash = _token_hash, share_token = _share_token
   WHERE id = _test_id;
  INSERT INTO public.admin_audit_log (actor_id, action, target_id, details)
  VALUES (_actor_id, 'live_test.republish', _test_id,
          jsonb_build_object('starts_at', _starts_at, 'expires_at', _expires_at,
                             'duration_minutes', _duration_minutes));
END $$;

-- 4. Candidates ---------------------------------------------------------------------------------------

-- The public face of a link: what it is and whether it is upcoming, live or closed, by the database clock.
CREATE OR REPLACE FUNCTION public.get_shared_test_state(_token_hash text)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce((
    SELECT jsonb_build_object(
      'state', CASE WHEN t.status <> 'published' OR now() >= t.expires_at THEN 'closed'
                    WHEN now() < t.starts_at THEN 'upcoming' ELSE 'live' END,
      'server_now', now(), 'starts_at', t.starts_at, 'expires_at', t.expires_at,
      'id', t.id, 'title', t.title, 'description', t.description, 'exam_type', t.exam_type,
      'duration_minutes', t.duration_minutes,
      'question_count', (SELECT count(*) FROM public.custom_test_questions q WHERE q.custom_test_id = t.id))
      FROM public.custom_tests t WHERE t.token_hash = _token_hash),
    jsonb_build_object('state', 'closed', 'server_now', now()))
$$;

-- Named failures: test_not_found, test_not_started, test_closed, test_empty.
CREATE OR REPLACE FUNCTION public.start_shared_attempt(_token_hash text, _email text, _access_hash text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.custom_tests%ROWTYPE;
  v_total integer;
  v_id uuid;
  v_started timestamptz;
BEGIN
  SELECT * INTO t FROM public.custom_tests WHERE token_hash = _token_hash;
  IF NOT FOUND THEN RAISE EXCEPTION 'test_not_found'; END IF;
  IF t.status <> 'published' OR now() >= t.expires_at THEN RAISE EXCEPTION 'test_closed'; END IF;
  IF now() < t.starts_at THEN RAISE EXCEPTION 'test_not_started'; END IF;
  SELECT count(*) INTO v_total FROM public.custom_test_questions WHERE custom_test_id = t.id;
  IF v_total = 0 THEN RAISE EXCEPTION 'test_empty'; END IF;
  INSERT INTO public.custom_test_attempts (custom_test_id, email, access_hash, total_questions)
  VALUES (t.id, lower(btrim(_email)), _access_hash, v_total)
  RETURNING id, started_at INTO v_id, v_started;
  RETURN jsonb_build_object('attempt_id', v_id, 'started_at', v_started);
END $$;

-- Scores an attempt from its saved answers (plus the submitted ones when `_answers` is not null) and closes it.
CREATE OR REPLACE FUNCTION app_private.finish_attempt(_attempt_id uuid, _answers jsonb)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.custom_test_attempts%ROWTYPE;
  v_correct integer;
BEGIN
  SELECT * INTO a FROM public.custom_test_attempts WHERE id = _attempt_id FOR UPDATE;
  IF NOT FOUND OR a.status <> 'in_progress' THEN RETURN; END IF;

  INSERT INTO public.custom_test_attempt_answers (attempt_id, custom_test_question_id, user_answer, is_correct, position)
  SELECT a.id, q.id, NULL, false, q.position
    FROM public.custom_test_questions q WHERE q.custom_test_id = a.custom_test_id
  ON CONFLICT (attempt_id, custom_test_question_id) DO NOTHING;

  IF _answers IS NOT NULL THEN
    UPDATE public.custom_test_attempt_answers aa
       SET user_answer = CASE WHEN upper(btrim(coalesce(s.e->>'user_answer', ''))) IN ('A', 'B', 'C', 'D')
                              THEN upper(btrim(s.e->>'user_answer')) END
      FROM jsonb_array_elements(_answers) s(e)
     WHERE aa.attempt_id = a.id AND aa.custom_test_question_id = (s.e->>'question_id')::uuid;
  END IF;

  UPDATE public.custom_test_attempt_answers aa
     SET is_correct = coalesce(aa.user_answer = q.correct_answer, false)
    FROM public.custom_test_questions q
   WHERE aa.attempt_id = a.id AND q.id = aa.custom_test_question_id;

  SELECT count(*) FILTER (WHERE is_correct) INTO v_correct
    FROM public.custom_test_attempt_answers WHERE attempt_id = a.id;
  UPDATE public.custom_test_attempts
     SET status = 'completed', completed_at = now(), correct_count = v_correct,
         score_pct = round(v_correct::numeric * 100 / a.total_questions, 2)
   WHERE id = a.id;
END $$;

-- The result of a completed attempt, with the key and the explanations.
CREATE OR REPLACE FUNCTION app_private.attempt_result(_attempt_id uuid)
RETURNS jsonb
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT jsonb_build_object(
    'score', a.score_pct, 'correct', a.correct_count, 'total', a.total_questions,
    'results', (SELECT coalesce(jsonb_agg(jsonb_build_object(
        'question_id', q.id, 'question_position', q.position, 'question_text', q.question_text,
        'option_a', q.option_a, 'option_b', q.option_b, 'option_c', q.option_c, 'option_d', q.option_d,
        'correct_answer', q.correct_answer, 'rationale', q.rationale,
        'user_answer', aa.user_answer, 'is_correct', aa.is_correct) ORDER BY q.position), '[]'::jsonb)
      FROM public.custom_test_questions q
      JOIN public.custom_test_attempt_answers aa ON aa.custom_test_question_id = q.id AND aa.attempt_id = a.id
     WHERE q.custom_test_id = a.custom_test_id))
  FROM public.custom_test_attempts a WHERE a.id = _attempt_id
$$;

-- Saves one answer (and its flag) as it is chosen. Refused after the attempt's deadline.
-- Named failures: attempt_not_found, attempt_closed, attempt_expired, answers_not_in_test.
CREATE OR REPLACE FUNCTION public.save_shared_answer(
  _attempt_id uuid, _access_hash text, _question_id uuid, _answer text, _flagged boolean)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.custom_test_attempts%ROWTYPE;
  v_minutes integer;
  q public.custom_test_questions%ROWTYPE;
  v_letter text := CASE WHEN upper(btrim(coalesce(_answer, ''))) IN ('A', 'B', 'C', 'D')
                        THEN upper(btrim(_answer)) END;
BEGIN
  SELECT * INTO a FROM public.custom_test_attempts
   WHERE id = _attempt_id AND access_hash = btrim(_access_hash);
  IF NOT FOUND THEN RAISE EXCEPTION 'attempt_not_found'; END IF;
  IF a.status <> 'in_progress' THEN RAISE EXCEPTION 'attempt_closed'; END IF;
  SELECT duration_minutes INTO v_minutes FROM public.custom_tests WHERE id = a.custom_test_id;
  IF now() > a.started_at + make_interval(mins => v_minutes) + app_private.shared_grace() THEN
    RAISE EXCEPTION 'attempt_expired';
  END IF;
  SELECT * INTO q FROM public.custom_test_questions WHERE id = _question_id AND custom_test_id = a.custom_test_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'answers_not_in_test'; END IF;
  INSERT INTO public.custom_test_attempt_answers (attempt_id, custom_test_question_id, user_answer, flagged, position)
  VALUES (a.id, q.id, v_letter, coalesce(_flagged, false), q.position)
  ON CONFLICT (attempt_id, custom_test_question_id)
  DO UPDATE SET user_answer = EXCLUDED.user_answer, flagged = EXCLUDED.flagged;
END $$;

-- The attempt as the candidate's own device sees it: questions without the key, saved answers and flags, the
-- deadline, and the database clock; or the result once it is closed. An attempt past its deadline is closed
-- here, scored from its saved answers.
CREATE OR REPLACE FUNCTION public.get_shared_attempt(_attempt_id uuid, _access_hash text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.custom_test_attempts%ROWTYPE;
  t public.custom_tests%ROWTYPE;
  v_deadline timestamptz;
BEGIN
  SELECT * INTO a FROM public.custom_test_attempts WHERE id = _attempt_id AND access_hash = btrim(_access_hash);
  IF NOT FOUND THEN RAISE EXCEPTION 'attempt_not_found'; END IF;
  SELECT * INTO t FROM public.custom_tests WHERE id = a.custom_test_id;
  v_deadline := a.started_at + make_interval(mins => t.duration_minutes);
  IF a.status = 'in_progress' AND now() > v_deadline + app_private.shared_grace() THEN
    PERFORM app_private.finish_attempt(a.id, NULL);
    SELECT * INTO a FROM public.custom_test_attempts WHERE id = _attempt_id;
  END IF;
  RETURN jsonb_build_object(
    'status', a.status, 'server_now', now(), 'started_at', a.started_at, 'deadline_at', v_deadline,
    'test', jsonb_build_object('title', t.title, 'description', t.description, 'exam_type', t.exam_type,
                               'duration_minutes', t.duration_minutes),
    'user_id', a.user_id, 'email', a.email,
    'questions', CASE WHEN a.status = 'in_progress' THEN
      (SELECT coalesce(jsonb_agg(jsonb_build_object(
          'id', q.id, 'position', q.position, 'question_text', q.question_text, 'option_a', q.option_a,
          'option_b', q.option_b, 'option_c', q.option_c, 'option_d', q.option_d,
          'answer', aa.user_answer, 'flagged', coalesce(aa.flagged, false)) ORDER BY q.position), '[]'::jsonb)
         FROM public.custom_test_questions q
         LEFT JOIN public.custom_test_attempt_answers aa ON aa.custom_test_question_id = q.id AND aa.attempt_id = a.id
        WHERE q.custom_test_id = a.custom_test_id)
      ELSE '[]'::jsonb END,
    'result', CASE WHEN a.status = 'completed' THEN app_private.attempt_result(a.id) END);
END $$;

-- Closes and scores an attempt. Before the deadline the submitted answers are used (and at least 80% must be
-- answered); after it only the saved ones count. Named failures: attempt_not_found, attempt_closed,
-- answers_not_in_test, too_few_answered:<n>.
CREATE OR REPLACE FUNCTION public.submit_shared_attempt(_attempt_id uuid, _access_hash text, _answers jsonb)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  a public.custom_test_attempts%ROWTYPE;
  v_minutes integer;
  v_ids uuid[];
  v_answered integer;
  v_needed integer;
  v_deadline timestamptz;
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

  SELECT duration_minutes INTO v_minutes FROM public.custom_tests WHERE id = a.custom_test_id;
  v_deadline := a.started_at + make_interval(mins => v_minutes);
  IF now() > v_deadline + app_private.shared_grace() THEN
    PERFORM app_private.finish_attempt(a.id, NULL);
  ELSE
    SELECT count(*) INTO v_answered FROM jsonb_array_elements(_answers) e
     WHERE upper(btrim(coalesce(e->>'user_answer', ''))) IN ('A', 'B', 'C', 'D');
    v_needed := ceil(a.total_questions * 0.8)::integer;
    IF now() < v_deadline AND v_answered < v_needed THEN
      RAISE EXCEPTION 'too_few_answered:%', v_needed;
    END IF;
    PERFORM app_private.finish_attempt(a.id, _answers);
  END IF;
  RETURN app_private.attempt_result(a.id);
END $$;

-- Attempts nobody submitted are closed and scored once their test's window has closed and their time is up.
CREATE OR REPLACE FUNCTION app_private.close_overdue_attempts(_test_ids uuid[])
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT a.id FROM public.custom_test_attempts a
      JOIN public.custom_tests t ON t.id = a.custom_test_id
     WHERE a.custom_test_id = ANY (_test_ids) AND a.status = 'in_progress'
       AND now() > a.started_at + make_interval(mins => t.duration_minutes) + app_private.shared_grace()
  LOOP
    PERFORM app_private.finish_attempt(r.id, NULL);
  END LOOP;
END $$;

-- 5. Administration ---------------------------------------------------------------------------------------

-- The tests the actor manages (every test for the central admin), newest first, with real counts. The
-- owner is shown by username only. The link is included for managers.
CREATE OR REPLACE FUNCTION public.list_live_tests(_actor_id uuid)
RETURNS TABLE (
  id uuid, owner_id uuid, owner_username text, title text, description text, exam_type public.exam_type,
  source_mode text, duration_minutes integer, starts_at timestamptz, expires_at timestamptz,
  status public.custom_test_status, created_at timestamptz, share_token text, state text,
  question_count integer, participant_count integer, pass_count integer, average_score numeric,
  custom_unimported integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_central boolean := public.has_role(_actor_id, 'central_admin');
BEGIN
  IF NOT public.is_any_admin(_actor_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  PERFORM app_private.close_overdue_attempts(
    ARRAY(SELECT t.id FROM public.custom_tests t WHERE v_central OR t.owner_id = _actor_id));
  RETURN QUERY
  SELECT t.id, t.owner_id, p.username, t.title, t.description, t.exam_type, t.source_mode,
         t.duration_minutes, t.starts_at, t.expires_at, t.status, t.created_at, t.share_token,
         CASE WHEN t.status <> 'published' OR now() >= t.expires_at THEN 'closed'
              WHEN now() < t.starts_at THEN 'upcoming' ELSE 'live' END,
         (SELECT count(*)::integer FROM public.custom_test_questions q WHERE q.custom_test_id = t.id),
         (SELECT count(*)::integer FROM public.custom_test_attempts a WHERE a.custom_test_id = t.id AND a.status = 'completed'),
         (SELECT count(*)::integer FROM public.custom_test_attempts a
           WHERE a.custom_test_id = t.id AND a.status = 'completed' AND a.score_pct >= 50),
         coalesce((SELECT round(avg(a.score_pct), 2) FROM public.custom_test_attempts a
                    WHERE a.custom_test_id = t.id AND a.status = 'completed'), 0),
         (SELECT count(*)::integer FROM public.custom_test_questions q
           WHERE q.custom_test_id = t.id AND q.source_kind = 'custom' AND NOT q.imported_to_bank)
    FROM public.custom_tests t
    LEFT JOIN public.profiles p ON p.id = t.owner_id
   WHERE v_central OR t.owner_id = _actor_id
   ORDER BY t.created_at DESC
   LIMIT 300;
END $$;

-- Finished attempts of tests the actor manages, but only once a test's window has closed: rankings are
-- final then, and nobody sees a live leaderboard of an open test.
CREATE OR REPLACE FUNCTION public.list_test_attempts(_actor_id uuid, _test_ids uuid[])
RETURNS TABLE (id uuid, custom_test_id uuid, email text, score_pct numeric, correct_count integer,
               total_questions integer, completed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT public.is_any_admin(_actor_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  RETURN QUERY
  SELECT a.id, a.custom_test_id, a.email, a.score_pct, a.correct_count, a.total_questions, a.completed_at
    FROM public.custom_test_attempts a
    JOIN public.custom_tests t ON t.id = a.custom_test_id
   WHERE a.custom_test_id = ANY (_test_ids) AND a.status = 'completed'
     AND (t.status <> 'published' OR t.expires_at <= now())
     AND app_private.is_test_manager(_actor_id, t.owner_id)
   ORDER BY a.score_pct DESC NULLS LAST, a.completed_at
   LIMIT 2000;
END $$;

-- Adds a test's uploaded (custom) questions to the bank, under the exam type and subcategory the admin names.
-- Questions the bank already holds (same exam type, same text, ignoring case and spacing) are skipped, and
-- so are repeats inside the test; each import is written to the audit log. Bank-sourced questions are never
-- copied back. Returns {added, skipped}. Named failures: test_not_found, invalid_topic.
CREATE OR REPLACE FUNCTION public.import_live_test_questions(
  _actor_id uuid, _test_id uuid, _exam_type public.exam_type, _topic text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  t public.custom_tests%ROWTYPE;
  v_topic text := btrim(coalesce(_topic, ''));
  v_pending integer;
  v_added integer;
BEGIN
  SELECT * INTO t FROM public.custom_tests WHERE id = _test_id FOR UPDATE;
  IF NOT FOUND OR NOT app_private.is_test_manager(_actor_id, t.owner_id) THEN
    RAISE EXCEPTION 'test_not_found';
  END IF;
  IF v_topic = '' OR length(v_topic) > 200 THEN RAISE EXCEPTION 'invalid_topic'; END IF;

  SELECT count(*) INTO v_pending FROM public.custom_test_questions
   WHERE custom_test_id = _test_id AND source_kind = 'custom' AND NOT imported_to_bank;

  INSERT INTO public.questions
    (exam_type, topic, question_text, option_a, option_b, option_c, option_d, correct_answer, rationale,
     created_by, source)
  SELECT DISTINCT ON (lower(btrim(q.question_text)))
         _exam_type, v_topic, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
         q.correct_answer, q.rationale, _actor_id, 'live test: ' || t.title
    FROM public.custom_test_questions q
   WHERE q.custom_test_id = _test_id AND q.source_kind = 'custom' AND NOT q.imported_to_bank
     AND NOT EXISTS (SELECT 1 FROM public.questions b
                      WHERE b.exam_type = _exam_type
                        AND lower(btrim(b.question_text)) = lower(btrim(q.question_text)))
   ORDER BY lower(btrim(q.question_text)), q.position;
  GET DIAGNOSTICS v_added = ROW_COUNT;

  UPDATE public.custom_test_questions SET imported_to_bank = true, imported_at = now()
   WHERE custom_test_id = _test_id AND source_kind = 'custom' AND NOT imported_to_bank;

  INSERT INTO public.admin_audit_log (actor_id, action, target_id, details)
  VALUES (_actor_id, 'question.import', _test_id,
          jsonb_build_object('exam_type', _exam_type, 'topic', v_topic, 'added', v_added,
                             'skipped', v_pending - v_added, 'test_title', t.title));
  RETURN jsonb_build_object('added', v_added, 'skipped', v_pending - v_added);
END $$;

-- 6. Retire what the new functions replace, and lock the new ones to the server -------------------------

DROP FUNCTION public.create_custom_test(uuid, text, text, public.exam_type, text, integer, timestamptz, text, jsonb);
DROP FUNCTION public.import_custom_test_to_bank(uuid, uuid, text);
DROP FUNCTION public.list_custom_test_summaries(uuid);

REVOKE ALL ON FUNCTION public.create_live_test(uuid, text, text, public.exam_type, text, integer, timestamptz, timestamptz, text, text, jsonb, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.republish_live_test(uuid, uuid, text, text, timestamptz, timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_shared_test_state(text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_shared_attempt(text, text, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_shared_answer(uuid, text, uuid, text, boolean) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_shared_attempt(uuid, text) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_shared_attempt(uuid, text, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_live_tests(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.list_test_attempts(uuid, uuid[]) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.import_live_test_questions(uuid, uuid, public.exam_type, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_live_test(uuid, text, text, public.exam_type, text, integer, timestamptz, timestamptz, text, text, jsonb, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.republish_live_test(uuid, uuid, text, text, timestamptz, timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_shared_test_state(text) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_shared_attempt(text, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_shared_answer(uuid, text, uuid, text, boolean) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_shared_attempt(uuid, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_shared_attempt(uuid, text, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_live_tests(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.list_test_attempts(uuid, uuid[]) TO service_role;
GRANT EXECUTE ON FUNCTION public.import_live_test_questions(uuid, uuid, public.exam_type, text) TO service_role;

-- 7. Ask AI is for people with an account ---------------------------------------------------------------
-- A guest attempt (no account linked to it) gets no AI help. An attempt is linked only through the verified
-- claim, so help follows the account, not whoever holds the attempt key.
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
     AND a.user_id IS NOT NULL
     AND q.id = _question_id
$$;
