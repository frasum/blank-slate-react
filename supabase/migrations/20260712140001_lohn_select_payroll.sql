-- Paragraf-42-Paritaet: payroll darf Lohn-Basistabellen lesen. Muster wie
-- staff_compensation/staff_personal_details (M4, 20260618064251):
-- has_permission('payroll.compensation.view') - die Rolle payroll hat den
-- Key per Default-Matrix. has_role() existiert seit 20260702152005 nicht
-- mehr (als verwaist entfernt), daher NICHT das B8-Muster verwenden.
DROP POLICY IF EXISTS lohn_absence_days_select_payroll ON public.lohn_absence_days;
CREATE POLICY lohn_absence_days_select_payroll ON public.lohn_absence_days
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_permission('payroll.compensation.view'::public.app_permission)
  );

DROP POLICY IF EXISTS lohn_recurring_zeilen_select_payroll ON public.lohn_recurring_zeilen;
CREATE POLICY lohn_recurring_zeilen_select_payroll ON public.lohn_recurring_zeilen
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_permission('payroll.compensation.view'::public.app_permission)
  );
