
-- Part 2: Legal Full Name on profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS legal_full_name text;

-- Part 3: Receipt anti-duplicate table
CREATE TABLE IF NOT EXISTS public.receipt_fingerprints (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  receipt_id uuid NOT NULL REFERENCES public.payment_receipts(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  fingerprint text NOT NULL,
  extracted_text text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS receipt_fingerprints_fp_idx ON public.receipt_fingerprints(fingerprint);

GRANT SELECT ON public.receipt_fingerprints TO authenticated;
GRANT ALL ON public.receipt_fingerprints TO service_role;
ALTER TABLE public.receipt_fingerprints ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "admins read fingerprints" ON public.receipt_fingerprints;
CREATE POLICY "admins read fingerprints" ON public.receipt_fingerprints
  FOR SELECT TO authenticated USING (public.is_any_admin(auth.uid()));

-- Extra columns on payment_receipts for auto-verification
ALTER TABLE public.payment_receipts
  ADD COLUMN IF NOT EXISTS auto_approved boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS flag_reason text,
  ADD COLUMN IF NOT EXISTS verified_at timestamptz,
  ADD COLUMN IF NOT EXISTS extracted_text text;

-- Auto upgrade RPC: called by user on receipt submit.
-- Instantly grants the selected tier for the admin-configured duration,
-- and records the receipt as auto_approved.
CREATE OR REPLACE FUNCTION public.auto_upgrade_from_receipt(
  _file_path text,
  _tier public.user_tier,
  _amount numeric
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  _uid uuid := auth.uid();
  _receipt_id uuid;
  _days int;
BEGIN
  IF _uid IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;
  IF _tier NOT IN ('erudite','scholar') THEN RAISE EXCEPTION 'invalid tier'; END IF;

  SELECT CASE _tier
           WHEN 'erudite' THEN erudite_days
           WHEN 'scholar' THEN scholar_days
           ELSE 30
         END
    INTO _days
  FROM public.app_settings WHERE id = 1;

  INSERT INTO public.payment_receipts
    (user_id, file_path, amount, target_tier, status, auto_approved)
  VALUES
    (_uid, _file_path, _amount, _tier, 'approved', true)
  RETURNING id INTO _receipt_id;

  PERFORM app_private.assign_user_tier(_uid, _tier, COALESCE(_days, 30));
  RETURN _receipt_id;
END $$;

GRANT EXECUTE ON FUNCTION public.auto_upgrade_from_receipt(text, public.user_tier, numeric) TO authenticated;

-- Admin manual revoke (also used by auto guard on flag)
CREATE OR REPLACE FUNCTION public.flag_receipt_and_revoke(
  _receipt_id uuid,
  _reason text
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE _uid uuid;
BEGIN
  SELECT user_id INTO _uid FROM public.payment_receipts WHERE id = _receipt_id;
  IF _uid IS NULL THEN RETURN; END IF;

  UPDATE public.payment_receipts
    SET status = 'rejected',
        flag_reason = _reason,
        reviewed_at = now(),
        reviewed_by = auth.uid()
   WHERE id = _receipt_id;

  PERFORM app_private.reset_user_to_novice(_uid);
END $$;

GRANT EXECUTE ON FUNCTION public.flag_receipt_and_revoke(uuid, text) TO authenticated;

-- Save fingerprint (called by server-side verifier via service role; also allow authenticated for own receipts as a safety net)
CREATE OR REPLACE FUNCTION public.record_receipt_fingerprint(
  _receipt_id uuid,
  _fingerprint text,
  _extracted_text text
) RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _uid uuid;
  _dup_user uuid;
BEGIN
  SELECT user_id INTO _uid FROM public.payment_receipts WHERE id = _receipt_id;
  IF _uid IS NULL THEN RETURN false; END IF;

  -- Duplicate check: any prior fingerprint from a DIFFERENT user
  SELECT user_id INTO _dup_user
    FROM public.receipt_fingerprints
   WHERE fingerprint = _fingerprint AND user_id <> _uid
   LIMIT 1;

  INSERT INTO public.receipt_fingerprints (receipt_id, user_id, fingerprint, extracted_text)
    VALUES (_receipt_id, _uid, _fingerprint, _extracted_text);

  UPDATE public.payment_receipts
    SET extracted_text = _extracted_text,
        verified_at = now()
   WHERE id = _receipt_id;

  RETURN _dup_user IS NOT NULL;
END $$;

GRANT EXECUTE ON FUNCTION public.record_receipt_fingerprint(uuid, text, text) TO authenticated, service_role;
