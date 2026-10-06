
-- Assign tier (central_admin only)
CREATE OR REPLACE FUNCTION app_private.assign_user_tier(_user_id uuid, _tier user_tier, _days int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app_private.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _tier = 'novice' THEN
    UPDATE public.profiles SET tier = 'novice', expiry_date = NULL WHERE id = _user_id;
  ELSE
    UPDATE public.profiles
      SET tier = _tier,
          expiry_date = CASE WHEN _days IS NULL OR _days <= 0 THEN NULL ELSE now() + (_days || ' days')::interval END
      WHERE id = _user_id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION public.assign_user_tier(_user_id uuid, _tier user_tier, _days int)
RETURNS void LANGUAGE sql SET search_path = public, app_private AS $$
  SELECT app_private.assign_user_tier(_user_id, _tier, _days)
$$;
GRANT EXECUTE ON FUNCTION public.assign_user_tier(uuid, user_tier, int) TO authenticated;

-- Daily maintenance: reset counters + auto-expire tiers
CREATE OR REPLACE FUNCTION app_private.daily_reset()
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
    SET tier = 'novice', expiry_date = NULL
    WHERE expiry_date IS NOT NULL AND expiry_date < now() AND tier <> 'novice';
  UPDATE public.profiles
    SET questions_today = 0, last_question_date = CURRENT_DATE
    WHERE questions_today <> 0 OR last_question_date IS DISTINCT FROM CURRENT_DATE;
END $$;

CREATE OR REPLACE FUNCTION public.daily_reset()
RETURNS void LANGUAGE sql SET search_path = public, app_private AS $$
  SELECT app_private.daily_reset()
$$;
REVOKE ALL ON FUNCTION public.daily_reset() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.daily_reset() TO service_role;

-- Daily leaderboard: aggregates today's completed exams for users >= 100 attempts
CREATE OR REPLACE FUNCTION public.get_daily_leaderboard()
RETURNS TABLE(user_id uuid, username text, avg_score numeric, attempted int, correct int)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  WITH today_answers AS (
    SELECT e.user_id, ea.user_answer, ea.is_correct, e.score_pct
    FROM public.exams e
    JOIN public.exam_answers ea ON ea.exam_id = e.id
    WHERE e.status = 'completed'
      AND e.completed_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
  ),
  per_user AS (
    SELECT user_id,
      COUNT(*) FILTER (WHERE user_answer IS NOT NULL)::int AS attempted,
      COUNT(*) FILTER (WHERE is_correct = true)::int AS correct
    FROM today_answers GROUP BY user_id
  ),
  scores AS (
    SELECT e.user_id, AVG(e.score_pct) AS avg_score
    FROM public.exams e
    WHERE e.status = 'completed'
      AND e.completed_at >= date_trunc('day', now() AT TIME ZONE 'UTC')
      AND e.score_pct IS NOT NULL
    GROUP BY e.user_id
  )
  SELECT p.user_id, COALESCE(pr.username, 'Anonymous'),
         COALESCE(s.avg_score, 0)::numeric, p.attempted, p.correct
  FROM per_user p
  LEFT JOIN scores s ON s.user_id = p.user_id
  LEFT JOIN public.profiles pr ON pr.id = p.user_id
  WHERE p.attempted >= 100
  ORDER BY s.avg_score DESC NULLS LAST, p.correct DESC
  LIMIT 50;
$$;
GRANT EXECUTE ON FUNCTION public.get_daily_leaderboard() TO authenticated, anon;

-- Schedule daily midnight UTC reset via pg_cron
CREATE EXTENSION IF NOT EXISTS pg_cron;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'nursegenius_daily_reset') THEN
    PERFORM cron.unschedule('nursegenius_daily_reset');
  END IF;
  PERFORM cron.schedule(
    'nursegenius_daily_reset',
    '0 0 * * *',
    $cron$ SELECT app_private.daily_reset(); $cron$
  );
END $$;
