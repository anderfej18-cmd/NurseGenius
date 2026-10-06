CREATE OR REPLACE FUNCTION public.central_admin_search_users(_search text)
RETURNS TABLE(user_id uuid, username text, email text, tier public.user_tier, is_admin boolean)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private
AS $$
  SELECT p.id,
         p.username,
         p.email,
         p.tier,
         EXISTS (
           SELECT 1 FROM public.user_roles ur
           WHERE ur.user_id = p.id AND ur.role = 'admin'::public.app_role
         ) AS is_admin
  FROM public.profiles p
  WHERE app_private.has_role(auth.uid(), 'central_admin'::public.app_role)
    AND lower(coalesce(p.username, '')) LIKE '%' || lower(trim(_search)) || '%'
  ORDER BY lower(coalesce(p.username, '')), p.id;
$$;

CREATE OR REPLACE FUNCTION public.get_subadmin_user_directory()
RETURNS TABLE(username text, tier public.user_tier)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, app_private
AS $$
  SELECT p.username, p.tier
  FROM public.profiles p
  WHERE app_private.is_any_admin(auth.uid())
  ORDER BY lower(coalesce(p.username, '')), p.id;
$$;

GRANT EXECUTE ON FUNCTION public.central_admin_search_users(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_subadmin_user_directory() TO authenticated;
REVOKE EXECUTE ON FUNCTION public.central_admin_search_users(text) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_subadmin_user_directory() FROM PUBLIC;

DROP POLICY IF EXISTS "users view own profile" ON public.profiles;
CREATE POLICY "users view own profile or central admin"
ON public.profiles
FOR SELECT
TO authenticated
USING (id = auth.uid() OR app_private.has_role(auth.uid(), 'central_admin'::public.app_role));