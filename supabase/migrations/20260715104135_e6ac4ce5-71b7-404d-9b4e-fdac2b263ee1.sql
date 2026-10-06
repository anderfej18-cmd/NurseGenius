CREATE SCHEMA IF NOT EXISTS app_private;
GRANT USAGE ON SCHEMA app_private TO authenticated, service_role;

CREATE OR REPLACE FUNCTION app_private.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role = _role)
$$;

CREATE OR REPLACE FUNCTION app_private.is_any_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS(SELECT 1 FROM public.user_roles WHERE user_id = _user_id AND role IN ('admin','central_admin'))
$$;

CREATE OR REPLACE FUNCTION app_private.check_expire_tier(_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  UPDATE public.profiles
  SET tier = 'novice', expiry_date = NULL
  WHERE id = _user_id AND expiry_date IS NOT NULL AND expiry_date < now() AND tier <> 'novice';
END $$;

CREATE OR REPLACE FUNCTION app_private.approve_receipt(_receipt_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  s RECORD;
  days INT;
BEGIN
  IF NOT app_private.is_any_admin(auth.uid()) THEN RAISE EXCEPTION 'Not authorized'; END IF;
  SELECT * INTO r FROM public.payment_receipts WHERE id = _receipt_id;
  IF NOT FOUND THEN RAISE EXCEPTION 'Receipt not found'; END IF;
  SELECT * INTO s FROM public.app_settings WHERE id = 1;
  days := CASE WHEN r.target_tier = 'erudite' THEN s.erudite_days ELSE s.scholar_days END;
  UPDATE public.profiles
    SET tier = r.target_tier, expiry_date = now() + (days || ' days')::interval
    WHERE id = r.user_id;
  UPDATE public.payment_receipts
    SET status = 'approved', reviewed_by = auth.uid(), reviewed_at = now()
    WHERE id = _receipt_id;
END $$;

CREATE OR REPLACE FUNCTION app_private.reset_user_to_novice(_user_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app_private.has_role(auth.uid(), 'central_admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  UPDATE public.profiles SET tier = 'novice', expiry_date = NULL WHERE id = _user_id;
END $$;

CREATE OR REPLACE FUNCTION app_private.redeem_admin_code(_code TEXT)
RETURNS BOOLEAN LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE c RECORD;
BEGIN
  SELECT * INTO c FROM public.admin_codes WHERE code = _code AND used_by IS NULL;
  IF NOT FOUND THEN RETURN false; END IF;
  UPDATE public.admin_codes SET used_by = auth.uid(), used_at = now() WHERE id = c.id;
  INSERT INTO public.user_roles (user_id, role) VALUES (auth.uid(), 'admin') ON CONFLICT DO NOTHING;
  RETURN true;
END $$;

REVOKE ALL ON FUNCTION app_private.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.is_any_admin(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.check_expire_tier(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.approve_receipt(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.reset_user_to_novice(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION app_private.redeem_admin_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION app_private.has_role(UUID, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.is_any_admin(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.check_expire_tier(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.approve_receipt(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.reset_user_to_novice(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION app_private.redeem_admin_code(TEXT) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.has_role(_user_id UUID, _role public.app_role)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY INVOKER SET search_path = public, app_private AS $$
  SELECT app_private.has_role(_user_id, _role)
$$;

CREATE OR REPLACE FUNCTION public.is_any_admin(_user_id UUID)
RETURNS BOOLEAN LANGUAGE SQL STABLE SECURITY INVOKER SET search_path = public, app_private AS $$
  SELECT app_private.is_any_admin(_user_id)
$$;

CREATE OR REPLACE FUNCTION public.check_expire_tier(_user_id UUID)
RETURNS VOID LANGUAGE SQL SECURITY INVOKER SET search_path = public, app_private AS $$
  SELECT app_private.check_expire_tier(_user_id)
$$;

CREATE OR REPLACE FUNCTION public.approve_receipt(_receipt_id UUID)
RETURNS VOID LANGUAGE SQL SECURITY INVOKER SET search_path = public, app_private AS $$
  SELECT app_private.approve_receipt(_receipt_id)
$$;

CREATE OR REPLACE FUNCTION public.reset_user_to_novice(_user_id UUID)
RETURNS VOID LANGUAGE SQL SECURITY INVOKER SET search_path = public, app_private AS $$
  SELECT app_private.reset_user_to_novice(_user_id)
$$;

CREATE OR REPLACE FUNCTION public.redeem_admin_code(_code TEXT)
RETURNS BOOLEAN LANGUAGE SQL SECURITY INVOKER SET search_path = public, app_private AS $$
  SELECT app_private.redeem_admin_code(_code)
$$;

REVOKE ALL ON FUNCTION public.has_role(UUID, public.app_role) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.is_any_admin(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.check_expire_tier(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.approve_receipt(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.reset_user_to_novice(UUID) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.redeem_admin_code(TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(UUID, public.app_role) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_any_admin(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_expire_tier(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.approve_receipt(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reset_user_to_novice(UUID) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.redeem_admin_code(TEXT) TO authenticated, service_role;