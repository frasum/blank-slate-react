-- B8 (Teil 2): has_role + payroll-SELECT-Policies. Ausgelagert aus
-- 20260614163243, damit der neue Enum-Wert 'payroll' vor der Verwendung
-- committet ist, OHNE nackte COMMIT;/BEGIN;-Statements (CLI-Reset-Bug).
-- Idempotent: auf der Live-DB ein No-op.

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
DROP POLICY IF EXISTS periods_select_payroll ON public.periods;
CREATE POLICY periods_select_payroll ON public.periods
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_role('payroll'::public.app_role)
  );

DROP POLICY IF EXISTS payroll_notes_select_payroll ON public.payroll_notes;
CREATE POLICY payroll_notes_select_payroll ON public.payroll_notes
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_role('payroll'::public.app_role)
  );

DROP POLICY IF EXISTS time_entries_select_payroll ON public.time_entries;
CREATE POLICY time_entries_select_payroll ON public.time_entries
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_role('payroll'::public.app_role)
  );
