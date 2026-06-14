-- B8: Lohnbüro-Rolle 'payroll' — Seitenrolle, NICHT in admin>manager>staff Hierarchie.
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'payroll';

-- Commit the new enum value before referencing it in functions/policies.
COMMIT;

BEGIN;

-- Hilfsfunktion: exakte Rollenprüfung (keine Hierarchie). Joint analog zu
-- current_role() über user_links, da role_assignments kein user_id hat.
CREATE OR REPLACE FUNCTION public.has_role(_role public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.role_assignments ra
    JOIN public.user_links ul
      ON ul.staff_id = ra.staff_id
     AND ul.organization_id = ra.organization_id
    WHERE ul.user_id = auth.uid()
      AND ra.role = _role
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_role(public.app_role) TO authenticated;

-- SELECT-Policies für payroll auf die für die Zeitübersicht nötigen Tabellen.
-- staff + staff_locations haben bereits org-weite SELECT-Policies — payroll
-- ist über user_links Teil der Organisation und sieht sie damit ohnehin.
CREATE POLICY periods_select_payroll ON public.periods
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_role('payroll'::public.app_role)
  );

CREATE POLICY payroll_notes_select_payroll ON public.payroll_notes
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_role('payroll'::public.app_role)
  );

CREATE POLICY time_entries_select_payroll ON public.time_entries
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_role('payroll'::public.app_role)
  );
