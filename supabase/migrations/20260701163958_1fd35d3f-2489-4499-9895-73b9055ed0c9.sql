
-- 1) Scope permissive SELECT policies to authenticated only (remove anon exposure)
ALTER POLICY roster_shifts_select_view ON public.roster_shifts TO authenticated;
ALTER POLICY roster_absence_select_view ON public.roster_absence TO authenticated;
ALTER POLICY roster_availability_select_view ON public.roster_availability TO authenticated;
ALTER POLICY day_off_wishes_select_view ON public.day_off_wishes TO authenticated;
ALTER POLICY leave_requests_select_view ON public.leave_requests TO authenticated;
ALTER POLICY comp_select_view ON public.staff_compensation TO authenticated;
ALTER POLICY details_select_view ON public.staff_personal_details TO authenticated;

-- 2) Revoke EXECUTE from anon on SECURITY DEFINER helper functions (auth-only)
REVOKE EXECUTE ON FUNCTION public._effective_user_id() FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.effective_permissions(uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_permission(public.app_permission, uuid) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.has_permission(public.app_permission, uuid, public.staff_department) FROM anon, public;
REVOKE EXECUTE ON FUNCTION public.is_real_admin() FROM anon, public;
GRANT EXECUTE ON FUNCTION public._effective_user_id() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.effective_permissions(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(public.app_permission, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.has_permission(public.app_permission, uuid, public.staff_department) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.is_real_admin() TO authenticated, service_role;

-- 3) Restrict orders.confirmation_token to service_role only (hide from authenticated org members)
REVOKE SELECT ON public.orders FROM authenticated;
GRANT SELECT (
  id, organization_id, supplier_id, location_id, order_number, status,
  total_amount_cents, delivery_date, time_window, delivery_address, notes,
  email_sent, email_sent_at, confirmed_at, created_at, updated_at,
  email_error, email_message_id
) ON public.orders TO authenticated;
GRANT INSERT, UPDATE, DELETE ON public.orders TO authenticated;

-- 4) Enable leaked-password protection (HIBP) in Auth
-- Note: This is an Auth service setting; adjust via Supabase Dashboard if not applied.
