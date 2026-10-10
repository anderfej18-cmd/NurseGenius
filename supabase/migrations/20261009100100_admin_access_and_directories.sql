-- Fix pass / roles and browser-facing reads (ADR-0008).
--
-- 1. Granting a paid tier is a central-admin act. The function's own comment said so, its sibling
--    reset_user_to_novice already enforces it, and the UI shows the control only to central admins,
--    but the check was is_any_admin, so any sub-admin could grant tiers.
-- 2. The leaderboards and the sub-admin directory had EXECUTE revoked from browser roles (a security
--    migration on 2026-09-06) while the browser kept calling them. They are now read through
--    server functions, so they are granted to the service role explicitly, and the directory gets
--    paged, field-limited replacements.

CREATE OR REPLACE FUNCTION app_private.assign_user_tier(_user_id uuid, _tier user_tier, _days int)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT app_private.has_role(auth.uid(), 'central_admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
  IF _tier = 'novice' THEN
    UPDATE public.profiles SET tier = 'novice', expiry_date = NULL WHERE id = _user_id;
  ELSE
    UPDATE public.profiles
      SET tier = _tier,
          expiry_date = CASE WHEN _days IS NULL OR _days <= 0 THEN NULL ELSE now() + (_days || ' days')::interval END
      WHERE id = _user_id;
  END IF;
END $$;

CREATE OR REPLACE FUNCTION app_private.approve_receipt(_receipt_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  r RECORD;
  s RECORD;
  days INT;
BEGIN
  IF NOT app_private.has_role(auth.uid(), 'central_admin') THEN RAISE EXCEPTION 'Not authorized'; END IF;
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

-- The two boards are bounded (50 and 100 rows) and take no parameters; only the server reads them.
GRANT EXECUTE ON FUNCTION public.get_daily_leaderboard() TO service_role;
GRANT EXECUTE ON FUNCTION public.get_weekly_leaderboard() TO service_role;

-- The sub-admin directory: a username and a tier, nothing else, a page at a time. The caller's role
-- is checked by the server function (the service role has no auth.uid() to check here).
DROP FUNCTION IF EXISTS public.get_subadmin_user_directory();

CREATE OR REPLACE FUNCTION public.list_user_directory(_limit integer, _offset integer)
RETURNS TABLE (username text, tier public.user_tier)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.username, p.tier
    FROM public.profiles p
   ORDER BY lower(coalesce(p.username, '')), p.id
   LIMIT least(greatest(coalesce(_limit, 50), 1), 200) OFFSET greatest(coalesce(_offset, 0), 0)
$$;

CREATE OR REPLACE FUNCTION public.count_users_by_tier()
RETURNS TABLE (tier public.user_tier, total integer)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT p.tier, count(*)::integer FROM public.profiles p GROUP BY p.tier ORDER BY p.tier
$$;

REVOKE ALL ON FUNCTION public.list_user_directory(integer, integer) FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.count_users_by_tier() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.list_user_directory(integer, integer) TO service_role;
GRANT EXECUTE ON FUNCTION public.count_users_by_tier() TO service_role;
