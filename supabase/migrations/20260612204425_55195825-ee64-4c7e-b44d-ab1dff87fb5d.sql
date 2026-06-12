GRANT SELECT ON public.user_links TO authenticated;
GRANT ALL ON public.user_links TO service_role;

GRANT SELECT ON public.role_assignments TO authenticated;
GRANT ALL ON public.role_assignments TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_compensation TO authenticated;
GRANT ALL ON public.staff_compensation TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_locations TO authenticated;
GRANT ALL ON public.staff_locations TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated;
GRANT ALL ON public.locations TO service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

GRANT SELECT ON public.audit_log TO authenticated;
GRANT ALL ON public.audit_log TO service_role;

GRANT ALL ON public.staff_pins TO service_role;
GRANT ALL ON public.access_tokens TO service_role;
GRANT ALL ON public.pin_attempts TO service_role;