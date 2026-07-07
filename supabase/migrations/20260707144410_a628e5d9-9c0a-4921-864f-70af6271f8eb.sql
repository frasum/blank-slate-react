DROP POLICY IF EXISTS lohn_absence_days_select ON public.lohn_absence_days;
CREATE POLICY lohn_absence_days_select ON public.lohn_absence_days
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_min_permission('manager'::public.app_role)
  );

DROP POLICY IF EXISTS lohn_recurring_zeilen_select ON public.lohn_recurring_zeilen;
CREATE POLICY lohn_recurring_zeilen_select ON public.lohn_recurring_zeilen
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_min_permission('manager'::public.app_role)
  );