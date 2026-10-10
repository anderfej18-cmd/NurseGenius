-- AI learning features / why a question was chosen (docs/formulas.md section 17).
--
-- One short code per answer row says which measured signal put the question in the session. It is
-- explanatory only: it affects neither the answer nor the score. Written by the server only, right
-- after a session starts; students hold no write privilege on exam_answers.

ALTER TABLE public.exam_answers
  ADD COLUMN selection_reason text
  CHECK (selection_reason IN (
    'random', 'weak_topic', 'due_review', 'previous_mistake',
    'new_question', 'recent_weakness', 'similar'));

-- Sets reasons from {"<question id>": "<code>"} for the student's own session. A question that is not
-- in the session, a session that is not the student's, and an answer that already has a reason are
-- left alone. Returns how many rows it set.
CREATE OR REPLACE FUNCTION public.record_selection_reasons(_user_id uuid, _exam_id uuid, _reasons jsonb)
RETURNS integer
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_set integer;
BEGIN
  IF _reasons IS NULL OR jsonb_typeof(_reasons) <> 'object' THEN RAISE EXCEPTION 'invalid_selection_reasons'; END IF;
  UPDATE public.exam_answers ea
     SET selection_reason = r.value
    FROM jsonb_each_text(_reasons) AS r(key, value), public.exams e
   WHERE e.id = _exam_id AND e.user_id = _user_id
     AND ea.exam_id = e.id AND ea.question_id::text = r.key
     AND ea.selection_reason IS NULL;
  GET DIAGNOSTICS v_set = ROW_COUNT;
  RETURN v_set;
END $$;
REVOKE ALL ON FUNCTION public.record_selection_reasons(uuid, uuid, jsonb) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_selection_reasons(uuid, uuid, jsonb) TO service_role;
