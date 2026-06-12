-- Stellt current_business_date() von SECURITY DEFINER auf SECURITY INVOKER um.
--
-- Begründung: Die Funktion liest ausschließlich now() und greift auf KEINE
-- RLS-geschützten Tabellen zu. SECURITY DEFINER ist hier nicht nötig und löst
-- nur Linter-Warnungen aus.
--
-- WICHTIG (Vermerk für künftige Phasen, kein Präzedenzfall):
-- Dies gilt ausschließlich für Funktionen OHNE Tabellenzugriff. Die in B1
-- folgenden Helper (current_staff_id, has_min_permission, is_admin) lesen
-- RLS-geschützte Tabellen (z. B. staff, user_roles) und MÜSSEN zwingend
-- SECURITY DEFINER + SET search_path verwenden, damit sie innerhalb von
-- RLS-Policies ohne Endlosrekursion benutzt werden können. Diese Migration
-- ist also keine generelle Abkehr von SECURITY DEFINER.

CREATE OR REPLACE FUNCTION public.current_business_date()
RETURNS date
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = pg_catalog, public
AS $$
  SELECT ((now() AT TIME ZONE 'Europe/Berlin') - interval '3 hours')::date
$$;

-- Aufrufrechte unverändert: nur authenticated und service_role.
REVOKE ALL ON FUNCTION public.current_business_date() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.current_business_date() FROM anon;
GRANT EXECUTE ON FUNCTION public.current_business_date() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_business_date() TO service_role;