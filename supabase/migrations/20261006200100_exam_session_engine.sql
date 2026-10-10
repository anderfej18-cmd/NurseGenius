-- Milestone 1 / steps 1, 3, 4: the server becomes the only writer of exam sessions, answers,
-- scores and per-question statistics. Students keep read access to their own rows only.
--
-- Rules implemented here (single source: the application passes policy numbers such as the time
-- limit and answer grace in; the database enforces ownership, state transitions and atomicity):
--   * one active (in_progress) session per student, enforced by a partial unique index
--   * correctness and scores are computed from the answer key inside submit_exam_session
--   * submitting twice returns the stored result and changes nothing (idempotent)
--   * answers are accepted only while the session is in progress and before the deadline (+ grace)

-- ============ EXAMS: session metadata ============
ALTER TABLE public.exams
  ADD COLUMN session_type text NOT NULL DEFAULT 'mock_exam'
    CHECK (session_type IN ('practice', 'topic_practice', 'mixed', 'mistake_review', 'mock_exam',
                            'timed_exam', 'revision', 'daily_challenge', 'custom')),
  ADD COLUMN deadline_at timestamptz,
  ADD COLUMN submitted_at timestamptz,
  ADD COLUMN auto_submitted boolean NOT NULL DEFAULT false,
  ADD COLUMN time_spent_ms integer CHECK (time_spent_ms IS NULL OR time_spent_ms >= 0),
  ADD COLUMN topics text[] NOT NULL DEFAULT '{}';

UPDATE public.exams SET deadline_at = started_at + make_interval(mins => time_limit_minutes);
UPDATE public.exams SET submitted_at = completed_at WHERE status = 'completed' AND submitted_at IS NULL;
ALTER TABLE public.exams ALTER COLUMN deadline_at SET NOT NULL;

CREATE INDEX idx_exams_user_status_completed ON public.exams (user_id, status, completed_at DESC);

-- ============ EXAM ANSWERS: behavioural data per attempt ============
ALTER TABLE public.exam_answers
  ADD COLUMN topic text,
  ADD COLUMN first_answer char(1) CHECK (first_answer IN ('A', 'B', 'C', 'D')),
  ADD COLUMN answer_changes integer NOT NULL DEFAULT 0 CHECK (answer_changes >= 0),
  ADD COLUMN time_spent_ms integer CHECK (time_spent_ms IS NULL OR time_spent_ms >= 0),
  ADD COLUMN confidence text CHECK (confidence IN ('low', 'medium', 'high')),
  ADD COLUMN answered_at timestamptz,
  ADD COLUMN attempt_number integer CHECK (attempt_number >= 1);

CREATE INDEX idx_exam_answers_question ON public.exam_answers (question_id);

UPDATE public.exam_answers ea SET topic = q.topic FROM public.questions q
  WHERE q.id = ea.question_id AND ea.topic IS NULL;
UPDATE public.exam_answers SET first_answer = user_answer WHERE user_answer IS NOT NULL AND first_answer IS NULL;

-- Legacy attempt numbers: nth answered occurrence of the question for that student.
UPDATE public.exam_answers ea SET attempt_number = n.rn
FROM (
  SELECT a.id,
         row_number() OVER (PARTITION BY e.user_id, a.question_id ORDER BY e.completed_at, a.position) AS rn
  FROM public.exam_answers a
  JOIN public.exams e ON e.id = a.exam_id AND e.status = 'completed' AND e.completed_at IS NOT NULL
  WHERE a.user_answer IS NOT NULL
) n
WHERE n.id = ea.id;

-- ============ USER QUESTION STATS: one row per student and question ============
-- Powers the mistake bank now; the review_* / ease / interval columns are owned by the spaced-review
-- scheduler (Milestone 2) and keep their defaults until then.
CREATE TABLE public.user_question_stats (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts >= 0),
  correct integer NOT NULL DEFAULT 0 CHECK (correct >= 0),
  misses integer NOT NULL DEFAULT 0 CHECK (misses >= 0),
  last_answer char(1),
  last_attempt_at timestamptz,
  last_correct_at timestamptz,
  last_missed_at timestamptz,
  corrected_at timestamptz,
  next_review_at timestamptz,
  review_count integer NOT NULL DEFAULT 0 CHECK (review_count >= 0),
  last_reviewed_at timestamptz,
  review_status text NOT NULL DEFAULT 'new' CHECK (review_status IN ('new', 'learning', 'review', 'mastered')),
  interval_days numeric(7, 2) NOT NULL DEFAULT 0 CHECK (interval_days >= 0),
  ease numeric(4, 2) NOT NULL DEFAULT 2.50 CHECK (ease > 0),
  updated_at timestamptz NOT NULL DEFAULT now(),
  -- A mistake is unresolved until a correct answer follows the most recent miss.
  unresolved boolean GENERATED ALWAYS AS (
    misses > 0 AND (corrected_at IS NULL OR corrected_at < last_missed_at)
  ) STORED,
  PRIMARY KEY (user_id, question_id)
);
CREATE INDEX idx_stats_user_recent_miss ON public.user_question_stats (user_id, last_missed_at DESC) WHERE misses > 0;
CREATE INDEX idx_stats_user_most_missed ON public.user_question_stats (user_id, misses DESC, last_missed_at DESC) WHERE misses > 0;
CREATE INDEX idx_stats_user_next_review ON public.user_question_stats (user_id, next_review_at) WHERE next_review_at IS NOT NULL;
CREATE INDEX idx_stats_question ON public.user_question_stats (question_id);

ALTER TABLE public.user_question_stats ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students read own question stats" ON public.user_question_stats
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.user_question_stats FROM anon, authenticated;
GRANT SELECT ON public.user_question_stats TO authenticated;
GRANT ALL ON public.user_question_stats TO service_role;

-- Backfill from completed history. Correctness is recomputed from the answer key: historic
-- is_correct values were written by the browser and are not trusted. Stored scores are left as they are.
WITH attempts AS (
  SELECT e.user_id, ea.question_id, e.completed_at AS at, ea.position, ea.user_answer,
         (upper(btrim(ea.user_answer)) = upper(btrim(q.correct_answer))) AS ok
  FROM public.exam_answers ea
  JOIN public.exams e ON e.id = ea.exam_id AND e.status = 'completed' AND e.completed_at IS NOT NULL
  JOIN public.questions q ON q.id = ea.question_id
  WHERE ea.user_answer IS NOT NULL
), marked AS (
  SELECT a.*, min(a.at) FILTER (WHERE NOT a.ok) OVER (PARTITION BY a.user_id, a.question_id) AS first_miss
  FROM attempts a
)
INSERT INTO public.user_question_stats
  (user_id, question_id, attempts, correct, misses, last_answer, last_attempt_at, last_correct_at, last_missed_at, corrected_at)
SELECT user_id, question_id,
       count(*), count(*) FILTER (WHERE ok), count(*) FILTER (WHERE NOT ok),
       (array_agg(user_answer ORDER BY at DESC, position DESC))[1],
       max(at), max(at) FILTER (WHERE ok), max(at) FILTER (WHERE NOT ok),
       max(at) FILTER (WHERE ok AND first_miss IS NOT NULL AND at > first_miss)
FROM marked
GROUP BY user_id, question_id;

-- ============ Finalisation (internal; never exposed to clients) ============
-- Scores a session from the answer key and updates the statistics in the caller's transaction.
CREATE OR REPLACE FUNCTION app_private.finalize_exam(_exam_id uuid, _user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  e public.exams%ROWTYPE;
  v_correct integer;
  v_total integer;
  v_score numeric;
  v_auto boolean;
  v_done timestamptz;
BEGIN
  SELECT * INTO e FROM public.exams WHERE id = _exam_id AND user_id = _user_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'exam_not_found'; END IF;

  IF e.status = 'completed' THEN
    RETURN jsonb_build_object(
      'exam_id', e.id, 'already_completed', true, 'correct_count', e.correct_count,
      'total_questions', e.total_questions, 'score_pct', e.score_pct, 'auto_submitted', e.auto_submitted);
  END IF;

  UPDATE public.exam_answers ea
     SET is_correct = (ea.user_answer IS NOT NULL AND upper(btrim(ea.user_answer)) = upper(btrim(q.correct_answer)))
    FROM public.questions q
   WHERE q.id = ea.question_id AND ea.exam_id = e.id;

  SELECT count(*), count(*) FILTER (WHERE is_correct)
    INTO v_total, v_correct
    FROM public.exam_answers WHERE exam_id = e.id;
  v_score := CASE WHEN v_total = 0 THEN 0 ELSE round(v_correct::numeric * 100 / v_total, 2) END;
  v_auto := now() > e.deadline_at;
  v_done := least(now(), e.deadline_at);

  UPDATE public.exams
     SET status = 'completed', completed_at = v_done, submitted_at = now(), auto_submitted = v_auto,
         correct_count = v_correct, total_questions = v_total, score_pct = v_score,
         time_spent_ms = greatest(0, (extract(epoch FROM (v_done - e.started_at)) * 1000)::integer)
   WHERE id = e.id;

  INSERT INTO public.user_question_stats AS s
    (user_id, question_id, attempts, correct, misses, last_answer, last_attempt_at, last_correct_at, last_missed_at)
  SELECT DISTINCT ON (ea.question_id)
         _user_id, ea.question_id, 1, ea.is_correct::integer, (NOT ea.is_correct)::integer, ea.user_answer, v_done,
         CASE WHEN ea.is_correct THEN v_done END, CASE WHEN NOT ea.is_correct THEN v_done END
    FROM public.exam_answers ea
   WHERE ea.exam_id = e.id AND ea.user_answer IS NOT NULL
   ORDER BY ea.question_id, ea.position DESC
  ON CONFLICT (user_id, question_id) DO UPDATE SET
    attempts = s.attempts + 1,
    correct = s.correct + EXCLUDED.correct,
    misses = s.misses + EXCLUDED.misses,
    last_answer = EXCLUDED.last_answer,
    last_attempt_at = EXCLUDED.last_attempt_at,
    last_correct_at = COALESCE(EXCLUDED.last_correct_at, s.last_correct_at),
    last_missed_at = COALESCE(EXCLUDED.last_missed_at, s.last_missed_at),
    corrected_at = CASE
      WHEN EXCLUDED.correct = 1 AND s.last_missed_at IS NOT NULL
           AND (s.corrected_at IS NULL OR s.corrected_at < s.last_missed_at)
      THEN EXCLUDED.last_correct_at ELSE s.corrected_at END,
    updated_at = now();

  UPDATE public.exam_answers ea SET attempt_number = s.attempts
    FROM public.user_question_stats s
   WHERE ea.exam_id = e.id AND ea.user_answer IS NOT NULL
     AND s.user_id = _user_id AND s.question_id = ea.question_id;

  RETURN jsonb_build_object(
    'exam_id', e.id, 'already_completed', false, 'correct_count', v_correct,
    'total_questions', v_total, 'score_pct', v_score, 'auto_submitted', v_auto);
END $$;
REVOKE ALL ON FUNCTION app_private.finalize_exam(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- Close abandoned legacy sessions (expired ones, and all but the newest open one per student) so the
-- one-active-session index can be created. They complete at their deadline, exactly as the old
-- browser timer would have submitted them.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT x.id, x.user_id FROM public.exams x
    WHERE x.status = 'in_progress'
      AND (x.deadline_at <= now()
           OR x.id <> (SELECT y.id FROM public.exams y
                       WHERE y.user_id = x.user_id AND y.status = 'in_progress'
                       ORDER BY y.started_at DESC, y.id DESC LIMIT 1))
  LOOP
    PERFORM app_private.finalize_exam(r.id, r.user_id);
  END LOOP;
END $$;

CREATE UNIQUE INDEX exams_one_active_per_user ON public.exams (user_id) WHERE status = 'in_progress';

-- ============ Students read their sessions; only the server writes ============
DROP POLICY IF EXISTS "users manage own exams" ON public.exams;
DROP POLICY IF EXISTS "users manage own answers" ON public.exam_answers;
CREATE POLICY "students read own exams" ON public.exams
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "students read own answers" ON public.exam_answers
  FOR SELECT TO authenticated
  USING (EXISTS (SELECT 1 FROM public.exams e WHERE e.id = exam_id AND e.user_id = auth.uid()));
REVOKE INSERT, UPDATE, DELETE ON public.exams, public.exam_answers FROM anon, authenticated;

-- ============ Engine functions (service role only) ============
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

-- Returns 'ok', 'not_found' (no such session or question for this student) or 'closed'.
-- Null arguments leave the stored value unchanged.
CREATE OR REPLACE FUNCTION public.save_exam_answer(
  _user_id uuid, _exam_id uuid, _question_id uuid, _grace_seconds integer,
  _answer char(1) DEFAULT NULL, _confidence text DEFAULT NULL,
  _flagged boolean DEFAULT NULL, _time_spent_ms integer DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public, app_private AS $$
DECLARE
  e record;
  a record;
  v_elapsed_ms bigint;
BEGIN
  -- FOR SHARE blocks while a concurrent submit holds the row, then re-checks the new status.
  SELECT status, deadline_at, started_at INTO e
    FROM public.exams WHERE id = _exam_id AND user_id = _user_id FOR SHARE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;
  IF e.status <> 'in_progress' OR now() > e.deadline_at + make_interval(secs => greatest(coalesce(_grace_seconds, 0), 0)) THEN
    RETURN 'closed';
  END IF;

  SELECT id, user_answer INTO a
    FROM public.exam_answers WHERE exam_id = _exam_id AND question_id = _question_id FOR UPDATE;
  IF NOT FOUND THEN RETURN 'not_found'; END IF;

  v_elapsed_ms := (extract(epoch FROM (now() - e.started_at)) * 1000)::bigint;

  UPDATE public.exam_answers SET
    user_answer = coalesce(_answer, user_answer),
    first_answer = CASE WHEN _answer IS NOT NULL AND first_answer IS NULL THEN _answer ELSE first_answer END,
    answer_changes = answer_changes
      + CASE WHEN _answer IS NOT NULL AND user_answer IS NOT NULL AND user_answer <> _answer THEN 1 ELSE 0 END,
    answered_at = CASE WHEN _answer IS NOT NULL THEN now() ELSE answered_at END,
    confidence = coalesce(_confidence, confidence),
    flagged = coalesce(_flagged, flagged),
    time_spent_ms = CASE
      WHEN _time_spent_ms IS NULL THEN time_spent_ms
      ELSE greatest(coalesce(time_spent_ms, 0), least(_time_spent_ms, v_elapsed_ms)::integer) END
  WHERE id = a.id;
  RETURN 'ok';
END $$;

CREATE OR REPLACE FUNCTION public.submit_exam_session(_user_id uuid, _exam_id uuid)
RETURNS jsonb
LANGUAGE sql SECURITY DEFINER SET search_path = public, app_private AS $$
  SELECT app_private.finalize_exam(_exam_id, _user_id)
$$;

REVOKE ALL ON FUNCTION public.start_exam_session(uuid, public.exam_type, text, text, integer, text[], uuid[], date) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.save_exam_answer(uuid, uuid, uuid, integer, char, text, boolean, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.submit_exam_session(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.start_exam_session(uuid, public.exam_type, text, text, integer, text[], uuid[], date) TO service_role;
GRANT EXECUTE ON FUNCTION public.save_exam_answer(uuid, uuid, uuid, integer, char, text, boolean, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.submit_exam_session(uuid, uuid) TO service_role;
