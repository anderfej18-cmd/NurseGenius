-- Milestone 1 / step 1-2: lock down what students can write or read directly, and extend the
-- question bank with the metadata the catalog filters on. Existing rows keep their values; new
-- columns are empty or default (no content is invented).

-- ============ PROFILES: students may edit only their onboarding fields ============
-- Column grants do not subtract from a table-level grant, so the table grant is revoked first.
REVOKE INSERT, UPDATE, DELETE ON public.profiles FROM anon, authenticated;
GRANT UPDATE (first_name, last_name, username, exam_date, exam_preference, onboarded)
  ON public.profiles TO authenticated;

-- ============ SUBTOPICS (empty until admins create them) ============
CREATE TABLE public.subtopics (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  exam_type public.exam_type NOT NULL,
  topic text NOT NULL,
  name text NOT NULL CHECK (length(btrim(name)) BETWEEN 1 AND 120),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (exam_type, topic, name)
);
ALTER TABLE public.subtopics ENABLE ROW LEVEL SECURITY;
CREATE POLICY "authenticated read subtopics" ON public.subtopics
  FOR SELECT TO authenticated USING (true);
REVOKE ALL ON public.subtopics FROM anon, authenticated;
GRANT SELECT ON public.subtopics TO authenticated;
GRANT ALL ON public.subtopics TO service_role;

-- ============ QUESTIONS: catalog metadata ============
ALTER TABLE public.questions
  ADD COLUMN difficulty text CHECK (difficulty IN ('easy', 'medium', 'hard')),
  ADD COLUMN status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'retired')),
  ADD COLUMN tags text[] NOT NULL DEFAULT '{}',
  ADD COLUMN source text CHECK (source IS NULL OR length(source) <= 200),
  ADD COLUMN subtopic_id uuid REFERENCES public.subtopics(id) ON DELETE SET NULL,
  ADD COLUMN updated_at timestamptz NOT NULL DEFAULT now();

CREATE TRIGGER update_questions_updated_at BEFORE UPDATE ON public.questions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE INDEX idx_questions_catalog ON public.questions (exam_type, status, topic, difficulty, year);
CREATE INDEX idx_questions_subtopic ON public.questions (subtopic_id) WHERE subtopic_id IS NOT NULL;

-- Students read only active questions and never the answer key. Column grants (not the app) enforce
-- this: correct_answer, rationale and created_by are not granted to client roles. Admins that need
-- the key use the server-side admin functions (service role).
DROP POLICY IF EXISTS "any authenticated reads questions" ON public.questions;
DROP POLICY IF EXISTS "any authenticated read questions" ON public.questions;
CREATE POLICY "students read active questions, admins read all" ON public.questions
  FOR SELECT TO authenticated
  USING (status = 'active' OR public.is_any_admin(auth.uid()));

REVOKE SELECT ON public.questions FROM anon, authenticated;
GRANT SELECT (
  id, exam_type, topic, year, question_text, option_a, option_b, option_c, option_d,
  created_at, updated_at, difficulty, status, tags, source, subtopic_id
) ON public.questions TO authenticated;

-- ============ Topic counts (one grouped query instead of paging every row) ============
CREATE OR REPLACE FUNCTION public.get_question_topic_counts(_exam_type public.exam_type)
RETURNS TABLE(topic text, total integer)
LANGUAGE sql STABLE SET search_path = public AS $$
  SELECT q.topic, count(*)::integer
  FROM public.questions q
  WHERE q.exam_type = _exam_type AND q.status = 'active'
  GROUP BY q.topic
  ORDER BY q.topic
$$;
REVOKE ALL ON FUNCTION public.get_question_topic_counts(public.exam_type) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.get_question_topic_counts(public.exam_type) TO service_role;
