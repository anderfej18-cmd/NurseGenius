-- 1. Harden flag_receipt_and_revoke with in-function authorization
CREATE OR REPLACE FUNCTION public.flag_receipt_and_revoke(_receipt_id uuid, _reason text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public', 'app_private'
AS $function$
DECLARE _uid uuid; _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT user_id INTO _uid FROM public.payment_receipts WHERE id = _receipt_id;
  IF _uid IS NULL THEN RETURN; END IF;

  IF _uid <> _caller AND NOT app_private.is_any_admin(_caller) THEN
    RAISE EXCEPTION 'not authorized';
  END IF;

  UPDATE public.payment_receipts
    SET status = 'rejected',
        flag_reason = _reason,
        reviewed_at = now(),
        reviewed_by = _caller
   WHERE id = _receipt_id;

  PERFORM app_private.reset_user_to_novice(_uid);
END $function$;

-- 2. Harden record_receipt_fingerprint (owner only)
CREATE OR REPLACE FUNCTION public.record_receipt_fingerprint(_receipt_id uuid, _fingerprint text, _extracted_text text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  _uid uuid;
  _dup_user uuid;
  _caller uuid := auth.uid();
BEGIN
  IF _caller IS NULL THEN RAISE EXCEPTION 'not authenticated'; END IF;

  SELECT user_id INTO _uid FROM public.payment_receipts WHERE id = _receipt_id;
  IF _uid IS NULL THEN RETURN false; END IF;
  IF _uid <> _caller THEN RAISE EXCEPTION 'not authorized'; END IF;

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
END $function$;

-- 3. Trigger-only function must not be callable via the API
REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;

-- 4. Maintenance / privileged routines: no API callers at all
REVOKE ALL ON FUNCTION public.daily_reset() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.reset_user_to_novice(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.daily_reset() TO service_role;
GRANT EXECUTE ON FUNCTION public.reset_user_to_novice(uuid) TO service_role;

-- 5. Everything else: signed-in users only (no anon execution)
REVOKE ALL ON FUNCTION public.approve_receipt(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.assign_user_tier(uuid, user_tier, integer) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.auto_upgrade_from_receipt(text, user_tier, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.check_expire_tier(uuid) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.flag_receipt_and_revoke(uuid, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.record_receipt_fingerprint(uuid, text, text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.redeem_admin_code(text) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_daily_leaderboard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_weekly_leaderboard() FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.has_role(uuid, app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_any_admin(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.approve_receipt(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.assign_user_tier(uuid, user_tier, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.auto_upgrade_from_receipt(text, user_tier, numeric) TO authenticated;
GRANT EXECUTE ON FUNCTION public.check_expire_tier(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.flag_receipt_and_revoke(uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.record_receipt_fingerprint(uuid, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.redeem_admin_code(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_daily_leaderboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_weekly_leaderboard() TO authenticated;
GRANT EXECUTE ON FUNCTION public.has_role(uuid, app_role) TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_any_admin(uuid) TO authenticated;

-- 6. admin_codes: explicit, restricted read policy for central admins only
DROP POLICY IF EXISTS "Central admins can view admin codes" ON public.admin_codes;
CREATE POLICY "Central admins can view admin codes"
  ON public.admin_codes
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'central_admin'));

REVOKE ALL ON TABLE public.admin_codes FROM anon;