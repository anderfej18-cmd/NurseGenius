-- Fix pass / hints_used (requirement: track hints per answer).
--
-- The app has no hint feature yet, so this is the recording capability only. A hint is reported as an
-- event ("a hint was shown"), never as a total: the database adds one per report, up to a ceiling, so a
-- client cannot choose or inflate the number. It affects neither the answer nor the score. The column
-- is written only by save_exam_answer; students hold no write privilege on exam_answers.

ALTER TABLE public.exam_answers
  ADD COLUMN hints_used integer NOT NULL DEFAULT 0 CHECK (hints_used BETWEEN 0 AND 10);

DROP FUNCTION public.save_exam_answer(uuid, uuid, uuid, integer, char, text, boolean, integer);

CREATE OR REPLACE FUNCTION public.save_exam_answer(
  _user_id uuid, _exam_id uuid, _question_id uuid, _grace_seconds integer,
  _answer char(1) DEFAULT NULL, _confidence text DEFAULT NULL,
  _flagged boolean DEFAULT NULL, _time_spent_ms integer DEFAULT NULL,
  _hint_used boolean DEFAULT NULL)
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
    hints_used = least(hints_used + CASE WHEN _hint_used IS TRUE THEN 1 ELSE 0 END, 10),
    time_spent_ms = CASE
      WHEN _time_spent_ms IS NULL THEN time_spent_ms
      ELSE greatest(coalesce(time_spent_ms, 0), least(_time_spent_ms, v_elapsed_ms)::integer) END
  WHERE id = a.id;
  RETURN 'ok';
END $$;

REVOKE ALL ON FUNCTION public.save_exam_answer(uuid, uuid, uuid, integer, char, text, boolean, integer, boolean) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_exam_answer(uuid, uuid, uuid, integer, char, text, boolean, integer, boolean) TO service_role;
