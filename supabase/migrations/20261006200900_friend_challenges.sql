-- Milestone 3 / competition, part 2: friend challenges. One student sets a fixed set of questions for a
-- friend; each then takes it as an ordinary exam session, so every session rule (one active session,
-- the tier's daily allowance, scoring from the answer key on the server) applies unchanged. Nothing
-- about the result is stored: it is read from the two exams, so no score can be written by anyone.
--
-- Like friendships, nothing here is readable or writable by a signed-in student directly: the server
-- calls these functions with the student's id from the verified token.

CREATE TABLE public.friend_challenges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  challenger_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  opponent_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_type public.exam_type NOT NULL,
  question_ids uuid[] NOT NULL CHECK (cardinality(question_ids) BETWEEN 1 AND 20),
  created_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL,
  declined_at timestamptz,
  challenger_exam_id uuid REFERENCES public.exams(id) ON DELETE SET NULL,
  opponent_exam_id uuid REFERENCES public.exams(id) ON DELETE SET NULL,
  CHECK (challenger_id <> opponent_id),
  CHECK (expires_at > created_at)
);
CREATE UNIQUE INDEX friend_challenges_challenger_exam_unique
  ON public.friend_challenges (challenger_exam_id) WHERE challenger_exam_id IS NOT NULL;
CREATE UNIQUE INDEX friend_challenges_opponent_exam_unique
  ON public.friend_challenges (opponent_exam_id) WHERE opponent_exam_id IS NOT NULL;
CREATE INDEX idx_friend_challenges_challenger ON public.friend_challenges (challenger_id, created_at DESC);
CREATE INDEX idx_friend_challenges_opponent ON public.friend_challenges (opponent_id, created_at DESC);

ALTER TABLE public.friend_challenges ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.friend_challenges FROM anon, authenticated;
GRANT ALL ON public.friend_challenges TO service_role;

-- ============ Setting a challenge ============
-- The student must be one of two accepted friends; the other becomes the opponent. The questions must
-- be distinct, active and of the exam type. `_max_open` caps the student's challenges still waiting
-- for the opponent to start; the student's profile row is locked so the cap holds under concurrency.
CREATE OR REPLACE FUNCTION public.create_friend_challenge(
  _user_id uuid, _friendship_id uuid, _exam_type public.exam_type, _question_ids uuid[],
  _expires_at timestamptz, _max_open integer)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_other uuid;
  v_id uuid;
  v_count integer := coalesce(cardinality(_question_ids), 0);
BEGIN
  PERFORM 1 FROM public.profiles p WHERE p.id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile_not_found'; END IF;

  SELECT CASE WHEN f.requester_id = _user_id THEN f.addressee_id ELSE f.requester_id END INTO v_other
    FROM public.friendships f
   WHERE f.id = _friendship_id AND f.status = 'accepted' AND _user_id IN (f.requester_id, f.addressee_id);
  IF NOT FOUND THEN RAISE EXCEPTION 'friendship_not_found'; END IF;

  IF v_count NOT BETWEEN 1 AND 20
     OR v_count <> (SELECT count(DISTINCT qid) FROM unnest(_question_ids) AS qid)
     OR v_count <> (SELECT count(*) FROM public.questions q
                     WHERE q.id = ANY (_question_ids) AND q.exam_type = _exam_type AND q.status = 'active') THEN
    RAISE EXCEPTION 'invalid_question_set';
  END IF;

  IF (SELECT count(*) FROM public.friend_challenges c
       WHERE c.challenger_id = _user_id AND c.declined_at IS NULL
         AND c.opponent_exam_id IS NULL AND c.expires_at > now()) >= _max_open THEN
    RAISE EXCEPTION 'challenge_limit';
  END IF;

  INSERT INTO public.friend_challenges (challenger_id, opponent_id, exam_type, question_ids, expires_at)
  VALUES (_user_id, v_other, _exam_type, _question_ids, _expires_at)
  RETURNING id INTO v_id;
  RETURN v_id;
END $$;

-- ============ Declining ============
-- Only the challenged student can decline, and only before starting.
CREATE OR REPLACE FUNCTION public.decline_friend_challenge(_user_id uuid, _challenge_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.friend_challenges c SET declined_at = now()
   WHERE c.id = _challenge_id AND c.opponent_id = _user_id
     AND c.declined_at IS NULL AND c.opponent_exam_id IS NULL;
  IF NOT FOUND THEN RAISE EXCEPTION 'challenge_not_found'; END IF;
END $$;

-- ============ Taking it ============
-- Starts the student's own exam over the stored questions and links it to their side of the challenge
-- in one step. Asked again, it returns the exam already linked, even after the challenge has closed.
-- A declined or expired challenge cannot be started. The exam is started by the function every session
-- uses, so one active session at a time and the day's allowance apply.
CREATE OR REPLACE FUNCTION public.start_friend_challenge_session(
  _user_id uuid, _challenge_id uuid, _time_limit_minutes integer, _today date)
RETURNS uuid
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  c public.friend_challenges%ROWTYPE;
  v_mine uuid;
  v_exam uuid;
BEGIN
  SELECT * INTO c FROM public.friend_challenges x
   WHERE x.id = _challenge_id AND _user_id IN (x.challenger_id, x.opponent_id) FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'challenge_not_found'; END IF;

  v_mine := CASE WHEN c.challenger_id = _user_id THEN c.challenger_exam_id ELSE c.opponent_exam_id END;
  IF v_mine IS NOT NULL THEN RETURN v_mine; END IF;
  IF c.declined_at IS NOT NULL OR c.expires_at <= now() THEN RAISE EXCEPTION 'challenge_closed'; END IF;

  v_exam := public.start_exam_session(
    _user_id, c.exam_type, 'Friend challenge', 'custom', _time_limit_minutes,
    (SELECT array_agg(DISTINCT q.topic ORDER BY q.topic) FROM public.questions q WHERE q.id = ANY (c.question_ids)),
    c.question_ids, _today);
  IF c.challenger_id = _user_id THEN
    UPDATE public.friend_challenges SET challenger_exam_id = v_exam WHERE id = c.id;
  ELSE
    UPDATE public.friend_challenges SET opponent_exam_id = v_exam WHERE id = c.id;
  END IF;
  RETURN v_exam;
END $$;

-- ============ Reading ============
-- The student's challenges, newest first (or one by id): who it is against, the state of each side's
-- exam and, for the student's own side, the result. The other student's result is shown only once the
-- viewer has finished their own, so nobody plays knowing the score to beat. An exam that has run out
-- of time is finished first, so a result never waits on a student who walked away.
CREATE OR REPLACE FUNCTION public.get_friend_challenge_views(
  _user_id uuid, _limit integer, _offset integer, _challenge_id uuid DEFAULT NULL)
RETURNS TABLE (
  id uuid, role text, opponent_username text, exam_type public.exam_type, total_questions integer,
  created_at timestamptz, expires_at timestamptz, declined_at timestamptz,
  my_exam_id uuid, my_exam_status text, my_correct integer, my_score_pct numeric, my_completed_at timestamptz,
  their_exam_status text, their_correct integer, their_score_pct numeric, their_completed_at timestamptz)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private AS $$
DECLARE
  v_stale record;
BEGIN
  FOR v_stale IN
    SELECT e.id AS exam_id, e.user_id AS owner_id
      FROM public.friend_challenges c
      JOIN public.exams e ON e.id IN (c.challenger_exam_id, c.opponent_exam_id)
     WHERE _user_id IN (c.challenger_id, c.opponent_id)
       AND (_challenge_id IS NULL OR c.id = _challenge_id)
       AND e.status = 'in_progress' AND e.deadline_at <= now()
     LIMIT 100
  LOOP
    PERFORM app_private.finalize_exam(v_stale.exam_id, v_stale.owner_id);
  END LOOP;

  RETURN QUERY
    SELECT c.id,
           CASE WHEN c.challenger_id = _user_id THEN 'challenger' ELSE 'opponent' END,
           COALESCE(p.username, 'Anonymous'),
           c.exam_type, cardinality(c.question_ids), c.created_at, c.expires_at, c.declined_at,
           me.id, me.status, me.correct_count, me.score_pct, me.completed_at,
           them.status,
           CASE WHEN me.status = 'completed' THEN them.correct_count END,
           CASE WHEN me.status = 'completed' THEN them.score_pct END,
           CASE WHEN me.status = 'completed' THEN them.completed_at END
      FROM public.friend_challenges c
      JOIN public.profiles p
        ON p.id = CASE WHEN c.challenger_id = _user_id THEN c.opponent_id ELSE c.challenger_id END
      LEFT JOIN public.exams me
        ON me.id = CASE WHEN c.challenger_id = _user_id THEN c.challenger_exam_id ELSE c.opponent_exam_id END
      LEFT JOIN public.exams them
        ON them.id = CASE WHEN c.challenger_id = _user_id THEN c.opponent_exam_id ELSE c.challenger_exam_id END
     WHERE _user_id IN (c.challenger_id, c.opponent_id)
       AND (_challenge_id IS NULL OR c.id = _challenge_id)
     ORDER BY c.created_at DESC, c.id
     LIMIT least(greatest(_limit, 1), 200) OFFSET greatest(_offset, 0);
END $$;

REVOKE ALL ON FUNCTION public.create_friend_challenge(uuid, uuid, public.exam_type, uuid[], timestamptz, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.decline_friend_challenge(uuid, uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.start_friend_challenge_session(uuid, uuid, integer, date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_friend_challenge_views(uuid, integer, integer, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_friend_challenge(uuid, uuid, public.exam_type, uuid[], timestamptz, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.decline_friend_challenge(uuid, uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.start_friend_challenge_session(uuid, uuid, integer, date) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_friend_challenge_views(uuid, integer, integer, uuid) TO service_role;
