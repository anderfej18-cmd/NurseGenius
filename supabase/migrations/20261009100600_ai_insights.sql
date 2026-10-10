-- AI learning features / storage for explanations and readiness history (ADR-0011).
--
-- ai_insights: the latest AI-written explanation of a student's measured facts, one row per student
-- and kind. Only the facts_hash (a digest, not the facts), the validated narrative, and the model and
-- prompt version are kept, so a repeat view costs nothing and a changed prompt or changed facts
-- regenerates it. Nothing here is a score: scores, mastery and readiness are always recomputed from
-- the student's answers. Written by the server only; no client role can read or write it.
--
-- readiness_snapshots: each distinct readiness assessment, so the student can see when it was made and
-- whether it moved. The latest 30 per student and exam type are kept.

CREATE TABLE public.ai_insights (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('recommendation', 'readiness', 'plan', 'performance')),
  facts_hash text NOT NULL CHECK (length(facts_hash) = 64),
  narrative jsonb NOT NULL,
  model text NOT NULL CHECK (length(model) BETWEEN 1 AND 100),
  prompt_version text NOT NULL CHECK (length(prompt_version) BETWEEN 1 AND 40),
  prompt_tokens integer NOT NULL DEFAULT 0 CHECK (prompt_tokens >= 0),
  completion_tokens integer NOT NULL DEFAULT 0 CHECK (completion_tokens >= 0),
  generated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (user_id, kind)
);
ALTER TABLE public.ai_insights ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.ai_insights FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.ai_insights TO service_role;

CREATE TABLE public.readiness_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  exam_type public.exam_type NOT NULL,
  assessed_at timestamptz NOT NULL DEFAULT now(),
  score numeric(4, 1) CHECK (score IS NULL OR score BETWEEN 0 AND 100),
  band text NOT NULL CHECK (length(band) BETWEEN 1 AND 40),
  attempts integer NOT NULL CHECK (attempts >= 0),
  completeness numeric(4, 3) NOT NULL CHECK (completeness BETWEEN 0 AND 1),
  components jsonb NOT NULL DEFAULT '{}'::jsonb
);
CREATE INDEX idx_readiness_snapshots_latest
  ON public.readiness_snapshots (user_id, exam_type, assessed_at DESC);
ALTER TABLE public.readiness_snapshots ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.readiness_snapshots FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.readiness_snapshots TO service_role;

-- Records the assessment if the evidence changed since the last one (a different score or a different
-- number of answers), keeps the latest 30, and returns the latest two, newest first, so the caller can
-- show when the assessment was made and how it moved.
CREATE OR REPLACE FUNCTION public.record_readiness_snapshot(
  _user_id uuid, _exam_type public.exam_type, _band text,
  _attempts integer, _completeness numeric, _components jsonb, _score numeric DEFAULT NULL)
RETURNS TABLE (assessed_at timestamptz, score numeric, band text, attempts integer)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_latest record;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtextextended(_user_id::text || ':' || _exam_type::text, 0));

  SELECT s.score, s.attempts INTO v_latest
    FROM public.readiness_snapshots s
   WHERE s.user_id = _user_id AND s.exam_type = _exam_type
   ORDER BY s.assessed_at DESC LIMIT 1;

  IF NOT FOUND OR v_latest.attempts <> _attempts OR v_latest.score IS DISTINCT FROM round(_score, 1) THEN
    INSERT INTO public.readiness_snapshots (user_id, exam_type, score, band, attempts, completeness, components)
    VALUES (_user_id, _exam_type, round(_score, 1), _band, _attempts, round(_completeness, 3),
            coalesce(_components, '{}'::jsonb));

    DELETE FROM public.readiness_snapshots d
     WHERE d.user_id = _user_id AND d.exam_type = _exam_type
       AND d.id NOT IN (SELECT k.id FROM public.readiness_snapshots k
                         WHERE k.user_id = _user_id AND k.exam_type = _exam_type
                         ORDER BY k.assessed_at DESC LIMIT 30);
  END IF;

  RETURN QUERY
    SELECT s.assessed_at, s.score, s.band, s.attempts
      FROM public.readiness_snapshots s
     WHERE s.user_id = _user_id AND s.exam_type = _exam_type
     ORDER BY s.assessed_at DESC LIMIT 2;
END $$;
REVOKE ALL ON FUNCTION public.record_readiness_snapshot(uuid, public.exam_type, text, integer, numeric, jsonb, numeric)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.record_readiness_snapshot(uuid, public.exam_type, text, integer, numeric, jsonb, numeric)
  TO service_role;
