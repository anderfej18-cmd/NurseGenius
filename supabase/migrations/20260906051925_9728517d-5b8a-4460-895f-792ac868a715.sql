CREATE TYPE public.custom_test_status AS ENUM ('draft', 'published', 'archived');

CREATE TABLE public.custom_tests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL,
  title text NOT NULL,
  description text,
  exam_type public.exam_type NOT NULL,
  source_mode text NOT NULL DEFAULT 'existing' CHECK (source_mode IN ('existing', 'upload')),
  duration_minutes integer NOT NULL CHECK (duration_minutes BETWEEN 10 AND 180),
  expires_at timestamp with time zone NOT NULL,
  token_hash text NOT NULL UNIQUE,
  status public.custom_test_status NOT NULL DEFAULT 'draft',
  created_at timestamp with time zone NOT NULL DEFAULT now(),
  updated_at timestamp with time zone NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_tests TO authenticated;
GRANT ALL ON public.custom_tests TO service_role;
ALTER TABLE public.custom_tests ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage custom tests" ON public.custom_tests FOR ALL TO authenticated USING (app_private.is_any_admin(auth.uid())) WITH CHECK (app_private.is_any_admin(auth.uid()) AND owner_id = auth.uid());

CREATE TABLE public.custom_test_questions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_test_id uuid NOT NULL REFERENCES public.custom_tests(id) ON DELETE CASCADE,
  source_question_id uuid REFERENCES public.questions(id) ON DELETE SET NULL,
  source_kind text NOT NULL DEFAULT 'existing' CHECK (source_kind IN ('existing', 'custom')),
  question_text text NOT NULL,
  option_a text NOT NULL,
  option_b text NOT NULL,
  option_c text NOT NULL,
  option_d text NOT NULL,
  correct_answer text NOT NULL CHECK (correct_answer IN ('A', 'B', 'C', 'D')),
  rationale text,
  position integer NOT NULL CHECK (position >= 0),
  imported_to_bank boolean NOT NULL DEFAULT false,
  imported_at timestamp with time zone,
  UNIQUE (custom_test_id, position)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.custom_test_questions TO authenticated;
GRANT ALL ON public.custom_test_questions TO service_role;
ALTER TABLE public.custom_test_questions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Admins manage custom test questions" ON public.custom_test_questions FOR ALL TO authenticated USING (app_private.is_any_admin(auth.uid())) WITH CHECK (app_private.is_any_admin(auth.uid()));

CREATE TABLE public.custom_test_attempts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  custom_test_id uuid NOT NULL REFERENCES public.custom_tests(id) ON DELETE CASCADE,
  user_id uuid,
  email text NOT NULL,
  access_hash text NOT NULL UNIQUE,
  started_at timestamp with time zone NOT NULL DEFAULT now(),
  completed_at timestamp with time zone,
  total_questions integer NOT NULL CHECK (total_questions > 0),
  correct_count integer,
  score_pct numeric(5,2),
  status text NOT NULL DEFAULT 'in_progress' CHECK (status IN ('in_progress', 'completed', 'abandoned'))
);
GRANT SELECT ON public.custom_test_attempts TO authenticated;
GRANT ALL ON public.custom_test_attempts TO service_role;
ALTER TABLE public.custom_test_attempts ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view their custom test attempts" ON public.custom_test_attempts FOR SELECT TO authenticated USING (user_id = auth.uid() OR app_private.is_any_admin(auth.uid()));

CREATE TABLE public.custom_test_attempt_answers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  attempt_id uuid NOT NULL REFERENCES public.custom_test_attempts(id) ON DELETE CASCADE,
  custom_test_question_id uuid NOT NULL REFERENCES public.custom_test_questions(id) ON DELETE CASCADE,
  user_answer text CHECK (user_answer IS NULL OR user_answer IN ('A', 'B', 'C', 'D')),
  is_correct boolean NOT NULL DEFAULT false,
  position integer NOT NULL CHECK (position >= 0),
  UNIQUE (attempt_id, custom_test_question_id),
  UNIQUE (attempt_id, position)
);
GRANT SELECT ON public.custom_test_attempt_answers TO authenticated;
GRANT ALL ON public.custom_test_attempt_answers TO service_role;
ALTER TABLE public.custom_test_attempt_answers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Users view their custom test answers" ON public.custom_test_attempt_answers FOR SELECT TO authenticated USING (EXISTS (SELECT 1 FROM public.custom_test_attempts a WHERE a.id = attempt_id AND (a.user_id = auth.uid() OR app_private.is_any_admin(auth.uid()))));

CREATE INDEX idx_custom_tests_owner ON public.custom_tests(owner_id);
CREATE INDEX idx_custom_tests_status_expiry ON public.custom_tests(status, expires_at);
CREATE INDEX idx_custom_test_questions_test ON public.custom_test_questions(custom_test_id, position);
CREATE INDEX idx_custom_test_attempts_test ON public.custom_test_attempts(custom_test_id, status);
CREATE INDEX idx_custom_test_attempts_user ON public.custom_test_attempts(user_id);
CREATE INDEX idx_custom_test_attempt_answers_attempt ON public.custom_test_attempt_answers(attempt_id, position);

CREATE TRIGGER update_custom_tests_updated_at BEFORE UPDATE ON public.custom_tests FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE OR REPLACE FUNCTION public.get_custom_test_by_token(_token_hash text)
RETURNS TABLE (
  test_id uuid,
  title text,
  description text,
  exam_type public.exam_type,
  duration_minutes integer,
  expires_at timestamp with time zone,
  question_id uuid,
  question_position integer,
  question_text text,
  option_a text,
  option_b text,
  option_c text,
  option_d text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private
AS $$
  SELECT t.id, t.title, t.description, t.exam_type, t.duration_minutes, t.expires_at,
         q.id, q.position, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d
  FROM public.custom_tests t
  JOIN public.custom_test_questions q ON q.custom_test_id = t.id
  WHERE t.token_hash = trim(_token_hash)
    AND t.status = 'published'
    AND t.expires_at > now()
  ORDER BY q.position;
$$;

CREATE OR REPLACE FUNCTION public.start_custom_test_attempt(_token_hash text, _email text, _access_hash text)
RETURNS TABLE (attempt_id uuid, duration_minutes integer, expires_at timestamp with time zone, total_questions integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  _test public.custom_tests%ROWTYPE;
  _attempt uuid;
  _total integer;
  _uid uuid := auth.uid();
BEGIN
  IF length(trim(coalesce(_email, ''))) < 3 OR position('@' in trim(_email)) < 2 THEN
    RAISE EXCEPTION 'valid email required';
  END IF;
  IF length(trim(coalesce(_access_hash, ''))) < 16 THEN
    RAISE EXCEPTION 'invalid attempt key';
  END IF;
  SELECT * INTO _test FROM public.custom_tests WHERE token_hash = trim(_token_hash) AND status = 'published' AND expires_at > now();
  IF NOT FOUND THEN RAISE EXCEPTION 'This test link has expired or does not exist'; END IF;
  SELECT count(*)::integer INTO _total FROM public.custom_test_questions WHERE custom_test_id = _test.id;
  IF _total < 1 THEN RAISE EXCEPTION 'This test has no questions'; END IF;
  INSERT INTO public.custom_test_attempts (custom_test_id, user_id, email, access_hash, total_questions)
  VALUES (_test.id, _uid, lower(trim(_email)), trim(_access_hash), _total)
  RETURNING id INTO _attempt;
  RETURN QUERY SELECT _attempt, _test.duration_minutes, _test.expires_at, _total;
END;
$$;

CREATE OR REPLACE FUNCTION public.submit_custom_test_attempt(_attempt_id uuid, _access_hash text, _answers jsonb)
RETURNS TABLE (score_pct numeric, correct_count integer, total_questions integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  _attempt public.custom_test_attempts%ROWTYPE;
  _answer jsonb;
  _qid uuid;
  _letter text;
  _correct text;
  _position integer;
  _correct_count integer := 0;
  _answered integer := 0;
BEGIN
  SELECT * INTO _attempt FROM public.custom_test_attempts WHERE id = _attempt_id AND access_hash = trim(_access_hash) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'Attempt not found'; END IF;
  IF _attempt.status = 'completed' THEN RAISE EXCEPTION 'Attempt already submitted'; END IF;
  IF jsonb_typeof(_answers) <> 'array' THEN RAISE EXCEPTION 'Invalid answers'; END IF;

  FOR _answer IN SELECT value FROM jsonb_array_elements(_answers)
  LOOP
    _qid := (_answer->>'question_id')::uuid;
    _letter := upper(trim(coalesce(_answer->>'user_answer', '')));
    SELECT correct_answer, position INTO _correct, _position
      FROM public.custom_test_questions
      WHERE id = _qid AND custom_test_id = _attempt.custom_test_id;
    IF _correct IS NULL THEN CONTINUE; END IF;
    IF _letter NOT IN ('A', 'B', 'C', 'D') THEN _letter := NULL; END IF;
    INSERT INTO public.custom_test_attempt_answers (attempt_id, custom_test_question_id, user_answer, is_correct, position)
    VALUES (_attempt.id, _qid, _letter, (_letter IS NOT NULL AND _letter = _correct), _position)
    ON CONFLICT (attempt_id, custom_test_question_id) DO UPDATE SET user_answer = EXCLUDED.user_answer, is_correct = EXCLUDED.is_correct, position = EXCLUDED.position;
    _answered := _answered + 1;
    IF _letter IS NOT NULL AND _letter = _correct THEN _correct_count := _correct_count + 1; END IF;
  END LOOP;

  UPDATE public.custom_test_attempts
     SET completed_at = now(), correct_count = _correct_count,
         score_pct = round((_correct_count::numeric / NULLIF(_attempt.total_questions, 0)) * 100, 2),
         status = 'completed'
   WHERE id = _attempt.id;

  RETURN QUERY SELECT round((_correct_count::numeric / NULLIF(_attempt.total_questions, 0)) * 100, 2), _correct_count, _attempt.total_questions;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_custom_test_attempt_results(_attempt_id uuid, _access_hash text)
RETURNS TABLE (
  question_id uuid,
  question_position integer,
  question_text text,
  option_a text,
  option_b text,
  option_c text,
  option_d text,
  correct_answer text,
  rationale text,
  user_answer text,
  is_correct boolean
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private
AS $$
  SELECT q.id, q.position, q.question_text, q.option_a, q.option_b, q.option_c, q.option_d,
         q.correct_answer, q.rationale, a.user_answer, coalesce(a.is_correct, false)
  FROM public.custom_test_attempts at
  JOIN public.custom_test_questions q ON q.custom_test_id = at.custom_test_id
  LEFT JOIN public.custom_test_attempt_answers a ON a.attempt_id = at.id AND a.custom_test_question_id = q.id
  WHERE at.id = _attempt_id AND at.access_hash = trim(_access_hash) AND at.status = 'completed'
  ORDER BY q.position;
$$;

CREATE OR REPLACE FUNCTION public.claim_custom_test_attempt(_attempt_id uuid, _access_hash text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  UPDATE public.custom_test_attempts
     SET user_id = auth.uid()
   WHERE id = _attempt_id AND access_hash = trim(_access_hash) AND user_id IS NULL;
  RETURN FOUND;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_custom_test_analytics(_custom_test_id uuid)
RETURNS TABLE (participant_count integer, pass_count integer, fail_count integer, pass_pct numeric, average_score numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private
AS $$
  SELECT count(*)::integer,
         count(*) FILTER (WHERE score_pct >= 50)::integer,
         count(*) FILTER (WHERE score_pct < 50)::integer,
         coalesce(round((count(*) FILTER (WHERE score_pct >= 50)::numeric / NULLIF(count(*)::numeric, 0)) * 100, 2), 0),
         coalesce(round(avg(score_pct), 2), 0)
  FROM public.custom_test_attempts a
  WHERE a.custom_test_id = _custom_test_id AND a.status = 'completed'
    AND app_private.is_any_admin(auth.uid());
$$;

CREATE OR REPLACE FUNCTION public.republish_custom_test(_custom_test_id uuid, _expires_at timestamp with time zone)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  _token text := encode(gen_random_bytes(24), 'hex');
BEGIN
  IF NOT app_private.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF _expires_at <= now() THEN RAISE EXCEPTION 'Expiry must be in the future'; END IF;
  UPDATE public.custom_tests SET status = 'published', expires_at = _expires_at, token_hash = encode(digest(_token, 'sha256'), 'hex') WHERE id = _custom_test_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Test not found'; END IF;
  RETURN _token;
END;
$$;

CREATE OR REPLACE FUNCTION public.add_custom_test_to_question_bank(_custom_test_id uuid, _exam_type public.exam_type, _topic text)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  _added integer;
BEGIN
  IF NOT app_private.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'not authorized'; END IF;
  IF length(trim(coalesce(_topic, ''))) < 1 THEN RAISE EXCEPTION 'Subcategory required'; END IF;
  INSERT INTO public.questions (exam_type, topic, question_text, option_a, option_b, option_c, option_d, correct_answer, rationale, created_by)
  SELECT _exam_type, trim(_topic), q.question_text, q.option_a, q.option_b, q.option_c, q.option_d, q.correct_answer, q.rationale, auth.uid()
  FROM public.custom_test_questions q
  WHERE q.custom_test_id = _custom_test_id AND q.imported_to_bank = false;
  GET DIAGNOSTICS _added = ROW_COUNT;
  UPDATE public.custom_test_questions SET imported_to_bank = true, imported_at = now() WHERE custom_test_id = _custom_test_id AND imported_to_bank = false;
  RETURN _added;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_custom_test_by_token(text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_custom_test_attempt(text, text, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.submit_custom_test_attempt(uuid, text, jsonb) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_custom_test_attempt_results(uuid, text) TO anon, authenticated;
GRANT EXECUTE ON FUNCTION public.claim_custom_test_attempt(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_custom_test_analytics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.republish_custom_test(uuid, timestamp with time zone) TO authenticated;
GRANT EXECUTE ON FUNCTION public.add_custom_test_to_question_bank(uuid, public.exam_type, text) TO authenticated;
REVOKE EXECUTE ON FUNCTION public.get_custom_test_by_token(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.start_custom_test_attempt(text, text, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.submit_custom_test_attempt(uuid, text, jsonb) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_custom_test_attempt_results(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.claim_custom_test_attempt(uuid, text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_custom_test_analytics(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.republish_custom_test(uuid, timestamp with time zone) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.add_custom_test_to_question_bank(uuid, public.exam_type, text) FROM PUBLIC;