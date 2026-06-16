
-- 1) Fix current_staff_id / current_organization_id: deterministic single-row result.
CREATE OR REPLACE FUNCTION public.current_staff_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT staff_id
  FROM public.user_links
  WHERE user_id = auth.uid()
  ORDER BY staff_id
  LIMIT 1
$function$;

CREATE OR REPLACE FUNCTION public.current_organization_id()
 RETURNS uuid
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $function$
  SELECT organization_id
  FROM public.user_links
  WHERE user_id = auth.uid()
  ORDER BY organization_id
  LIMIT 1
$function$;

-- 2) Lock down SECURITY DEFINER functions that should not be publicly executable.

-- Event trigger function — must never be callable directly.
REVOKE EXECUTE ON FUNCTION public.rls_auto_enable() FROM PUBLIC, anon, authenticated;

-- Trigger function — only fired by table trigger, not callable directly.
REVOKE EXECUTE ON FUNCTION public.tg_organizations_create_settings() FROM PUBLIC, anon, authenticated;

-- create_order_from_cart: anon must not be able to call it; only authenticated.
REVOKE EXECUTE ON FUNCTION public.create_order_from_cart(uuid, uuid, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_order_from_cart(uuid, uuid, text, uuid) TO authenticated;

-- has_role: anon must not query roles.
REVOKE EXECUTE ON FUNCTION public.has_role(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_role(public.app_role) TO authenticated;
