-- Admin privacy and question auditing (docs/live-tests-integration.md, Phase 1).
--
-- 1. Student data belongs to the central admin. Sub-admins manage questions and their own shared
--    tests; they never see another person's exams, payments, receipts or test-attempt emails, so the
--    database now says so instead of only the screens (ADR-0008 extended).
-- 2. An admin may delete a question for good only when no student has answered it (exam_answers keeps
--    the history and has no cascade). Every delete leaves a full copy in admin_audit_log.

-- 1. Central-admin-only reads of student data -------------------------------------------------------

DROP POLICY IF EXISTS "admins read exams" ON public.exams;
CREATE POLICY "central admin reads exams" ON public.exams
  FOR SELECT TO authenticated USING (public.has_role(auth.uid(), 'central_admin'));

DROP POLICY IF EXISTS "users view own payments or admins view all" ON public.subscription_payments;
CREATE POLICY "users view own payments or central admin" ON public.subscription_payments
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'central_admin'));

DROP POLICY IF EXISTS "users view own receipts" ON public.payment_receipts;
CREATE POLICY "users view own receipts or central admin" ON public.payment_receipts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'central_admin'));
DROP POLICY IF EXISTS "admins update receipts" ON public.payment_receipts;
CREATE POLICY "central admin updates receipts" ON public.payment_receipts
  FOR UPDATE TO authenticated USING (public.has_role(auth.uid(), 'central_admin'));

-- Shared-test attempts carry the taker's email. Test owners read their results through the server,
-- which masks emails for sub-admins; the browser sees only the caller's own attempts.
DROP POLICY IF EXISTS "Users view their custom test attempts" ON public.custom_test_attempts;
CREATE POLICY "users view own attempts or central admin" ON public.custom_test_attempts
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'central_admin'));
DROP POLICY IF EXISTS "Users view their custom test answers" ON public.custom_test_attempt_answers;
CREATE POLICY "users view own attempt answers or central admin" ON public.custom_test_attempt_answers
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.custom_test_attempts a
     WHERE a.id = attempt_id
       AND (a.user_id = auth.uid() OR public.has_role(auth.uid(), 'central_admin'))));

-- 2. Audit log and permanent delete -----------------------------------------------------------------

CREATE TABLE public.admin_audit_log (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  actor_id uuid NOT NULL,
  action text NOT NULL,
  target_id uuid,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX admin_audit_log_target_idx ON public.admin_audit_log (target_id);
ALTER TABLE public.admin_audit_log ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.admin_audit_log FROM PUBLIC, anon, authenticated;
GRANT SELECT, INSERT ON public.admin_audit_log TO service_role;

-- Named failures: not_authorized, question_not_found, question_in_use:<answers>.
CREATE OR REPLACE FUNCTION public.admin_delete_question(_admin_id uuid, _question_id uuid)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  q public.questions%ROWTYPE;
  v_answers integer;
BEGIN
  IF NOT public.is_any_admin(_admin_id) THEN RAISE EXCEPTION 'not_authorized'; END IF;
  SELECT * INTO q FROM public.questions WHERE id = _question_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'question_not_found'; END IF;
  SELECT count(*) INTO v_answers FROM public.exam_answers WHERE question_id = _question_id;
  IF v_answers > 0 THEN RAISE EXCEPTION 'question_in_use:%', v_answers; END IF;

  INSERT INTO public.admin_audit_log (actor_id, action, target_id, details)
  VALUES (_admin_id, 'question.delete', _question_id, jsonb_build_object('question', to_jsonb(q)));
  DELETE FROM public.questions WHERE id = _question_id;
END $$;

REVOKE ALL ON FUNCTION public.admin_delete_question(uuid, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.admin_delete_question(uuid, uuid) TO service_role;
