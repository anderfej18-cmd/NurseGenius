REVOKE ALL ON FUNCTION public.handle_new_user() FROM PUBLIC, anon, authenticated;
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