-- Fix pass / L4: historical score integrity.
--
-- Before the session engine the browser wrote exams.score_pct and exam_answers.is_correct, so scores
-- on legacy exams cannot be trusted. Nothing is deleted or rewritten. Instead each completed exam is
-- recomputed from the answer key and flagged score_verified only when the stored score and every stored
-- is_correct flag agree with it. Exams completed by the server from now on are verified by a trigger
-- (finalize_exam is the only path that completes an exam, and it scores from the key). The leaderboards
-- count verified exams only. Students hold no write privilege on exams, so they cannot set the flag.

ALTER TABLE public.exams ADD COLUMN score_verified boolean NOT NULL DEFAULT false;

WITH recomputed AS (
  SELECT ea.exam_id,
         count(*) AS total,
         count(*) FILTER (WHERE ea.user_answer IS NOT NULL
                            AND upper(btrim(ea.user_answer)) = upper(btrim(q.correct_answer))) AS correct,
         bool_and(coalesce(ea.is_correct, false) =
                  (ea.user_answer IS NOT NULL AND upper(btrim(ea.user_answer)) = upper(btrim(q.correct_answer)))) AS flags_match
  FROM public.exam_answers ea
  JOIN public.questions q ON q.id = ea.question_id
  GROUP BY ea.exam_id
)
UPDATE public.exams e
   SET score_verified = true
  FROM recomputed r
 WHERE r.exam_id = e.id
   AND e.status = 'completed'
   AND r.total > 0
   AND r.flags_match
   AND e.score_pct IS NOT NULL
   AND abs(e.score_pct - round(r.correct::numeric * 100 / r.total, 2)) <= 0.01;

CREATE OR REPLACE FUNCTION app_private.mark_score_verified() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  NEW.score_verified := true;
  RETURN NEW;
END $$;
REVOKE ALL ON FUNCTION app_private.mark_score_verified() FROM PUBLIC, anon, authenticated;

CREATE TRIGGER exams_mark_score_verified
  BEFORE UPDATE OF status ON public.exams
  FOR EACH ROW WHEN (NEW.status = 'completed' AND OLD.status IS DISTINCT FROM 'completed')
  EXECUTE FUNCTION app_private.mark_score_verified();

-- Leaderboards: the same ranking as before, over verified exams only.
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
    WHERE e.status = 'completed' AND e.score_verified
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
    WHERE e.status = 'completed' AND e.score_verified
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
    WHERE e.status = 'completed' AND e.score_verified
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
    WHERE e.status = 'completed' AND e.score_verified
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
