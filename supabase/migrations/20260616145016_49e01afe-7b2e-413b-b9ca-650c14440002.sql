-- staff_personal_details: SELECT-Policy von manager+ auf admin/payroll umstellen
-- und Schreib-Policies für admin ergänzen.

DROP POLICY IF EXISTS details_select_manager ON public.staff_personal_details;

CREATE POLICY details_select_admin_payroll
  ON public.staff_personal_details
  FOR SELECT
  TO authenticated
  USING (
    (public.has_role('admin'::public.app_role) OR public.has_role('payroll'::public.app_role))
    AND organization_id = public.current_organization_id()
  );

CREATE POLICY details_insert_admin
  ON public.staff_personal_details
  FOR INSERT
  TO authenticated
  WITH CHECK (
    public.has_role('admin'::public.app_role)
    AND organization_id = public.current_organization_id()
  );

CREATE POLICY details_update_admin
  ON public.staff_personal_details
  FOR UPDATE
  TO authenticated
  USING (
    public.has_role('admin'::public.app_role)
    AND organization_id = public.current_organization_id()
  )
  WITH CHECK (
    public.has_role('admin'::public.app_role)
    AND organization_id = public.current_organization_id()
  );

CREATE POLICY details_delete_admin
  ON public.staff_personal_details
  FOR DELETE
  TO authenticated
  USING (
    public.has_role('admin'::public.app_role)
    AND organization_id = public.current_organization_id()
  );

GRANT INSERT, UPDATE, DELETE ON public.staff_personal_details TO authenticated;