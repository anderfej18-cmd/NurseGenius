-- Milestone 3 / gamification: an XP ledger and achievements that only the server can write.
-- Students may read their own rows; nothing a client sends can create or change XP. Every XP event
-- has a unique source, so reprocessing the same session or achievement pays nothing twice.

-- ============ XP ledger ============
CREATE TABLE public.xp_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  source_type text NOT NULL CHECK (source_type IN
    ('session', 'daily_practice', 'perfect_session', 'achievement', 'daily_challenge', 'duel')),
  -- What the XP was paid for: a session id, a UTC date, an achievement code, a challenge id.
  source_id text NOT NULL CHECK (length(source_id) BETWEEN 1 AND 100),
  -- Zero is allowed: it marks a source as processed without paying anything.
  xp integer NOT NULL CHECK (xp BETWEEN 0 AND 10000),
  occurred_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, source_type, source_id)
);
CREATE INDEX idx_xp_events_user_time ON public.xp_events (user_id, occurred_at DESC, id DESC);

CREATE TABLE public.user_achievements (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  code text NOT NULL CHECK (length(code) BETWEEN 1 AND 60),
  unlocked_at timestamptz NOT NULL DEFAULT now(),
  xp_awarded integer NOT NULL DEFAULT 0 CHECK (xp_awarded BETWEEN 0 AND 10000),
  PRIMARY KEY (user_id, code)
);

ALTER TABLE public.xp_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_achievements ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students read own xp" ON public.xp_events
  FOR SELECT TO authenticated USING (user_id = auth.uid());
CREATE POLICY "students read own achievements" ON public.user_achievements
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.xp_events, public.user_achievements FROM anon, authenticated;
GRANT SELECT ON public.xp_events, public.user_achievements TO authenticated;
GRANT ALL ON public.xp_events, public.user_achievements TO service_role;

-- ============ Writing XP (service role only) ============
-- `_events`: [{ source_type, source_id, xp, occurred_at }]. Returns how many were new.
CREATE OR REPLACE FUNCTION public.record_xp_events(_user_id uuid, _events jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE v_inserted integer;
BEGIN
  IF jsonb_typeof(_events) <> 'array' THEN RAISE EXCEPTION 'invalid_events'; END IF;
  IF jsonb_array_length(_events) > 500 THEN RAISE EXCEPTION 'too_many_events'; END IF;
  INSERT INTO public.xp_events (user_id, source_type, source_id, xp, occurred_at)
  SELECT _user_id, e.source_type, e.source_id, e.xp, coalesce(e.occurred_at, now())
    FROM jsonb_to_recordset(_events) AS e(source_type text, source_id text, xp integer, occurred_at timestamptz)
  ON CONFLICT (user_id, source_type, source_id) DO NOTHING;
  GET DIAGNOSTICS v_inserted = ROW_COUNT;
  RETURN v_inserted;
END $$;

-- Unlocks achievements and pays their XP in one step. `_unlocks`: [{ code, xp, unlocked_at }].
-- Returns only the codes that were new, so a notification is sent once.
CREATE OR REPLACE FUNCTION public.unlock_achievements(_user_id uuid, _unlocks jsonb)
RETURNS text[]
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_codes text[] := '{}';
  r record;
BEGIN
  IF jsonb_typeof(_unlocks) <> 'array' THEN RAISE EXCEPTION 'invalid_unlocks'; END IF;
  IF jsonb_array_length(_unlocks) > 50 THEN RAISE EXCEPTION 'too_many_unlocks'; END IF;
  FOR r IN
    SELECT u.code, u.xp, coalesce(u.unlocked_at, now()) AS unlocked_at
      FROM jsonb_to_recordset(_unlocks) AS u(code text, xp integer, unlocked_at timestamptz)
  LOOP
    INSERT INTO public.user_achievements (user_id, code, unlocked_at, xp_awarded)
    VALUES (_user_id, r.code, r.unlocked_at, r.xp)
    ON CONFLICT (user_id, code) DO NOTHING;
    IF FOUND THEN
      INSERT INTO public.xp_events (user_id, source_type, source_id, xp, occurred_at)
      VALUES (_user_id, 'achievement', r.code, r.xp, r.unlocked_at)
      ON CONFLICT (user_id, source_type, source_id) DO NOTHING;
      v_codes := v_codes || r.code;
    END IF;
  END LOOP;
  RETURN v_codes;
END $$;

-- ============ Reading facts for the server's XP and achievement rules ============
CREATE OR REPLACE FUNCTION public.get_xp_total(_user_id uuid)
RETURNS bigint
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT coalesce(sum(xp), 0)::bigint FROM public.xp_events WHERE user_id = _user_id
$$;

-- Finished sessions whose XP has not been worked out yet, oldest first. `first_correct` counts the
-- answers that were right and are the first right answer this student has ever given to that
-- question (judged by the answer key, in completion order): repeating a question earns nothing.
CREATE OR REPLACE FUNCTION public.get_unawarded_sessions(_user_id uuid, _limit integer DEFAULT 50)
RETURNS TABLE (
  exam_id uuid, completed_at timestamptz, session_type text,
  answered integer, correct integer, first_correct integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH pending AS (
    SELECT e.id, e.completed_at, e.session_type
      FROM public.exams e
     WHERE e.user_id = _user_id AND e.status = 'completed'
       AND NOT EXISTS (
         SELECT 1 FROM public.xp_events x
          WHERE x.user_id = _user_id AND x.source_type = 'session' AND x.source_id = e.id::text)
     ORDER BY e.completed_at, e.id
     LIMIT least(greatest(_limit, 1), 200)
  )
  SELECT p.id, p.completed_at, p.session_type,
         (count(ea.id) FILTER (WHERE ea.user_answer IS NOT NULL))::integer,
         (count(ea.id) FILTER (
            WHERE upper(btrim(ea.user_answer)) = upper(btrim(q.correct_answer))))::integer,
         (count(ea.id) FILTER (
            WHERE upper(btrim(ea.user_answer)) = upper(btrim(q.correct_answer))
              AND NOT EXISTS (
                SELECT 1 FROM public.exam_answers ea2
                  JOIN public.exams e2 ON e2.id = ea2.exam_id
                 WHERE ea2.question_id = ea.question_id AND e2.user_id = _user_id
                   AND e2.status = 'completed'
                   AND (e2.completed_at, e2.id) < (p.completed_at, p.id)
                   AND upper(btrim(ea2.user_answer)) = upper(btrim(q.correct_answer)))))::integer
    FROM pending p
    LEFT JOIN public.exam_answers ea ON ea.exam_id = p.id
    LEFT JOIN public.questions q ON q.id = ea.question_id
   GROUP BY p.id, p.completed_at, p.session_type
   ORDER BY p.completed_at, p.id
$$;

-- Counters the achievement rules read. The thresholds belong to the server's rules and are passed in.
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
    'topics_practised', (SELECT count(*) FROM per_topic WHERE n >= _topic_min_attempts))
$$;

REVOKE ALL ON FUNCTION public.record_xp_events(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.unlock_achievements(uuid, jsonb) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_xp_total(uuid) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_unawarded_sessions(uuid, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.get_engagement_snapshot(uuid, integer, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_xp_events(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.unlock_achievements(uuid, jsonb) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_xp_total(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_unawarded_sessions(uuid, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_engagement_snapshot(uuid, integer, integer) TO service_role;
