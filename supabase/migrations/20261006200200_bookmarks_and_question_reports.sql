-- Milestone 1 / steps 6-7: bookmarks and question reports. Students may read their own rows; every
-- write goes through server functions (service role), which enforce ownership, limits and validation.

-- ============ BOOKMARKS ============
CREATE TABLE public.bookmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  note text CHECK (note IS NULL OR length(note) <= 500),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (user_id, question_id)
);
CREATE INDEX idx_bookmarks_user_created ON public.bookmarks (user_id, created_at DESC);
CREATE INDEX idx_bookmarks_question ON public.bookmarks (question_id);

ALTER TABLE public.bookmarks ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students read own bookmarks" ON public.bookmarks
  FOR SELECT TO authenticated USING (user_id = auth.uid());
REVOKE ALL ON public.bookmarks FROM anon, authenticated;
GRANT SELECT ON public.bookmarks TO authenticated;
GRANT ALL ON public.bookmarks TO service_role;

-- ============ QUESTION REPORTS ============
CREATE TABLE public.question_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  question_id uuid NOT NULL REFERENCES public.questions(id) ON DELETE CASCADE,
  reporter_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  reason text NOT NULL CHECK (reason IN
    ('incorrect_answer', 'bad_question', 'duplicate', 'unclear', 'wrong_topic', 'typo', 'other')),
  details text CHECK (details IS NULL OR length(details) <= 1000),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'resolved', 'dismissed')),
  resolution_note text CHECK (resolution_note IS NULL OR length(resolution_note) <= 1000),
  resolved_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK ((status = 'open') = (resolved_at IS NULL))
);
-- A student cannot flood the queue with the same complaint about the same question.
CREATE UNIQUE INDEX uq_question_reports_open
  ON public.question_reports (reporter_id, question_id, reason) WHERE status = 'open';
CREATE INDEX idx_question_reports_status_created ON public.question_reports (status, created_at DESC);
CREATE INDEX idx_question_reports_reporter ON public.question_reports (reporter_id, created_at DESC);
CREATE INDEX idx_question_reports_question ON public.question_reports (question_id);

ALTER TABLE public.question_reports ENABLE ROW LEVEL SECURITY;
CREATE POLICY "students read own reports, admins read all" ON public.question_reports
  FOR SELECT TO authenticated
  USING (reporter_id = auth.uid() OR public.is_any_admin(auth.uid()));
REVOKE ALL ON public.question_reports FROM anon, authenticated;
GRANT SELECT ON public.question_reports TO authenticated;
GRANT ALL ON public.question_reports TO service_role;
