-- Defaults
INSERT INTO public.permission_role_defaults (role, permission) VALUES
  ('admin'::public.app_role, 'payroll.compensation.view'::public.app_permission),
  ('admin'::public.app_role, 'payroll.compensation.edit'::public.app_permission),
  ('admin'::public.app_role, 'payroll.personal.view'::public.app_permission),
  ('admin'::public.app_role, 'payroll.personal.edit'::public.app_permission),
  ('admin'::public.app_role, 'payroll.personal.import'::public.app_permission),
  ('admin'::public.app_role, 'payroll.calc.run'::public.app_permission),
  ('admin'::public.app_role, 'payroll.period.view'::public.app_permission),
  ('payroll'::public.app_role, 'payroll.compensation.view'::public.app_permission),
  ('payroll'::public.app_role, 'payroll.compensation.edit'::public.app_permission),
  ('payroll'::public.app_role, 'payroll.personal.view'::public.app_permission),
  ('payroll'::public.app_role, 'payroll.personal.import'::public.app_permission),
  ('payroll'::public.app_role, 'payroll.calc.run'::public.app_permission),
  ('payroll'::public.app_role, 'payroll.period.view'::public.app_permission)
ON CONFLICT (role, permission) DO NOTHING;

-- staff_compensation: SELECT-Policy auf has_permission umstellen
DROP POLICY IF EXISTS comp_select_admin ON public.staff_compensation;
DROP POLICY IF EXISTS comp_insert_admin ON public.staff_compensation;
DROP POLICY IF EXISTS comp_update_admin ON public.staff_compensation;
DROP POLICY IF EXISTS comp_delete_admin ON public.staff_compensation;

CREATE POLICY comp_select_view ON public.staff_compensation
  FOR SELECT
  USING (
    organization_id = public.current_organization_id()
    AND public.has_permission('payroll.compensation.view'::public.app_permission)
  );

-- staff_personal_details: SELECT-Policy auf has_permission umstellen
DROP POLICY IF EXISTS details_select_admin_payroll ON public.staff_personal_details;
DROP POLICY IF EXISTS details_insert_admin ON public.staff_personal_details;
DROP POLICY IF EXISTS details_update_admin ON public.staff_personal_details;
DROP POLICY IF EXISTS details_delete_admin ON public.staff_personal_details;

CREATE POLICY details_select_view ON public.staff_personal_details
  FOR SELECT
  USING (
    organization_id = public.current_organization_id()
    AND public.has_permission('payroll.personal.view'::public.app_permission)
  );