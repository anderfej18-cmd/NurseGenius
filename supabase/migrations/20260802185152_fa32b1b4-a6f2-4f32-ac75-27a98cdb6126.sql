CREATE OR REPLACE FUNCTION public.auto_upgrade_from_receipt(_file_path text, _tier user_tier, _amount numeric)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'app_private'
AS $function$
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

  _days := COALESCE(_days, 30);

  INSERT INTO public.payment_receipts
    (user_id, file_path, amount, target_tier, status, auto_approved)
  VALUES
    (_uid, _file_path, _amount, _tier, 'approved', true)
  RETURNING id INTO _receipt_id;

  -- Self-service upgrade for the caller's own profile only.
  UPDATE public.profiles
     SET tier = _tier,
         expiry_date = now() + (_days || ' days')::interval
   WHERE id = _uid;

  RETURN _receipt_id;
END $function$;

REVOKE ALL ON FUNCTION public.auto_upgrade_from_receipt(text, user_tier, numeric) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.auto_upgrade_from_receipt(text, user_tier, numeric) TO authenticated, service_role;