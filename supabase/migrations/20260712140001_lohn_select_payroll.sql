-- Paragraf-42-Paritaet: 'payroll' ist Seitenrolle (B8) und liest ueber
-- explizite has_role-Policies (Muster: periods/time_entries in
-- 20260614163244). Bei den lohn-SELECT-Policies (20260707144410) fehlte
-- payroll -> Tests 'SELECT als payroll -> 1 Zeile' schlugen fehl.
DROP POLICY IF EXISTS lohn_absence_days_select_payroll ON public.lohn_absence_days;
CREATE POLICY lohn_absence_days_select_payroll ON public.lohn_absence_days
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_role('payroll'::public.app_role)
  );

DROP POLICY IF EXISTS lohn_recurring_zeilen_select_payroll ON public.lohn_recurring_zeilen;
CREATE POLICY lohn_recurring_zeilen_select_payroll ON public.lohn_recurring_zeilen
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_role('payroll'::public.app_role)
  );
