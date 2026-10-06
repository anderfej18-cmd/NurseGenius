CREATE OR REPLACE FUNCTION public.activate_verified_subscription(_user_id uuid, _tier public.user_tier, _reference text, _amount numeric)
RETURNS timestamptz
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, app_private
AS $$
DECLARE
  _days integer;
  _expiry timestamptz;
  _existing public.subscription_payments%ROWTYPE;
BEGIN
  IF _tier NOT IN ('erudite', 'scholar') THEN RAISE EXCEPTION 'invalid tier'; END IF;
  IF length(trim(coalesce(_reference, ''))) < 4 THEN RAISE EXCEPTION 'invalid payment reference'; END IF;
  IF _amount <= 0 THEN RAISE EXCEPTION 'invalid payment amount'; END IF;

  SELECT * INTO _existing FROM public.subscription_payments WHERE reference = trim(_reference) LIMIT 1;
  IF FOUND THEN
    IF _existing.user_id <> _user_id OR _existing.plan_name <> _tier::text OR _existing.amount_ngn <> _amount THEN
      RAISE EXCEPTION 'payment reference already used';
    END IF;
    SELECT expiry_date INTO _expiry FROM public.profiles WHERE id = _user_id;
    RETURN _expiry;
  END IF;

  SELECT duration_days INTO _days FROM public.plans WHERE name = _tier::text AND is_active AND price_ngn = _amount;
  IF _days IS NULL THEN RAISE EXCEPTION 'plan or amount does not match an active plan'; END IF;
  _expiry := now() + (_days || ' days')::interval;

  UPDATE public.profiles SET tier = _tier, expiry_date = _expiry WHERE id = _user_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'profile not found'; END IF;

  INSERT INTO public.subscription_payments (user_id, plan_name, amount_ngn, duration_days, reference)
  VALUES (_user_id, _tier::text, _amount, _days, trim(_reference));
  RETURN _expiry;
END;
$$;
REVOKE ALL ON FUNCTION public.activate_verified_subscription(uuid, public.user_tier, text, numeric) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activate_verified_subscription(uuid, public.user_tier, text, numeric) TO service_role;