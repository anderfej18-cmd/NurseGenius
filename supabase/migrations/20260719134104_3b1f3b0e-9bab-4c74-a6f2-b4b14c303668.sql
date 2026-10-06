
-- Daily leaderboard: sort by avg score desc, then attempted desc (tie-breaker)
CREATE OR REPLACE FUNCTION public.get_daily_leaderboard()
RETURNS TABLE(user_id uuid, username text, avg_score numeric, attempted integer, correct integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
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
  ORDER BY COALESCE(s.avg_score, 0) DESC, p.attempted DESC, p.correct DESC
  LIMIT 50;
$function$;

-- Weekly leaderboard (Mon–Sun, UTC) with 4-of-7 consistency rule
CREATE OR REPLACE FUNCTION public.get_weekly_leaderboard()
RETURNS TABLE(user_id uuid, username text, avg_score numeric, attempted integer, correct integer, active_days integer)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH week_bounds AS (
    SELECT date_trunc('week', now() AT TIME ZONE 'UTC') AS wk_start
  ),
  week_answers AS (
    SELECT e.user_id,
           (e.completed_at AT TIME ZONE 'UTC')::date AS day,
           ea.user_answer, ea.is_correct
    FROM public.exams e
    JOIN public.exam_answers ea ON ea.exam_id = e.id, week_bounds w
    WHERE e.status = 'completed'
      AND e.completed_at >= w.wk_start
      AND e.completed_at < w.wk_start + interval '7 days'
  ),
  per_user_day AS (
    SELECT user_id, day, COUNT(*) FILTER (WHERE user_answer IS NOT NULL)::int AS attempted
    FROM week_answers GROUP BY user_id, day
  ),
  qualifying AS (
    SELECT user_id, COUNT(*)::int AS active_days
    FROM per_user_day WHERE attempted >= 100 GROUP BY user_id HAVING COUNT(*) >= 4
  ),
  totals AS (
    SELECT user_id,
      COUNT(*) FILTER (WHERE user_answer IS NOT NULL)::int AS attempted,
      COUNT(*) FILTER (WHERE is_correct = true)::int AS correct
    FROM week_answers GROUP BY user_id
  ),
  scores AS (
    SELECT e.user_id, AVG(e.score_pct) AS avg_score
    FROM public.exams e, week_bounds w
    WHERE e.status = 'completed'
      AND e.completed_at >= w.wk_start
      AND e.completed_at < w.wk_start + interval '7 days'
      AND e.score_pct IS NOT NULL
    GROUP BY e.user_id
  )
  SELECT q.user_id, COALESCE(pr.username, 'Anonymous'),
         COALESCE(s.avg_score, 0)::numeric, t.attempted, t.correct, q.active_days
  FROM qualifying q
  JOIN totals t ON t.user_id = q.user_id
  LEFT JOIN scores s ON s.user_id = q.user_id
  LEFT JOIN public.profiles pr ON pr.id = q.user_id
  ORDER BY COALESCE(s.avg_score, 0) DESC, t.attempted DESC, t.correct DESC
  LIMIT 100;
$function$;

GRANT EXECUTE ON FUNCTION public.get_weekly_leaderboard() TO authenticated;

-- Ensure exams table is in realtime publication for live leaderboard updates
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime' AND schemaname = 'public' AND tablename = 'exams'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.exams';
  END IF;
END $$;

-- Schedule Sunday-night reset (Mon 00:00 UTC = end of Sunday) — daily_reset already handles counters
SELECT cron.unschedule('weekly-reset') WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'weekly-reset');
SELECT cron.schedule('weekly-reset', '0 0 * * 1', $$SELECT public.daily_reset();$$);
