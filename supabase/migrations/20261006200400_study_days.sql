-- Milestone 3 / streaks: the days a student studied, as facts for the server's streak calculation.
-- Streaks are derived from attempt history (docs/adr/0002), so nothing is stored.

-- One row per UTC day with at least one answered question in a completed session, oldest first.
-- Executable by the service role only; the server passes the verified user id.
CREATE OR REPLACE FUNCTION public.get_study_days(_user_id uuid, _since date DEFAULT NULL)
RETURNS TABLE (study_day date, answered integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT (coalesce(ea.answered_at, e.completed_at) AT TIME ZONE 'UTC')::date AS study_day,
         count(*)::integer AS answered
    FROM public.exams e
    JOIN public.exam_answers ea ON ea.exam_id = e.id
   WHERE e.user_id = _user_id
     AND e.status = 'completed'
     AND ea.user_answer IS NOT NULL
     AND (_since IS NULL
          OR (coalesce(ea.answered_at, e.completed_at) AT TIME ZONE 'UTC')::date >= _since)
   GROUP BY 1
   ORDER BY 1
$$;
REVOKE ALL ON FUNCTION public.get_study_days(uuid, date) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_study_days(uuid, date) TO service_role;
