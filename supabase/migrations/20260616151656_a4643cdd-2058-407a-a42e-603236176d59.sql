-- staff_compensation: Sichtbarkeit/Schreiben auf admin verschärfen
DROP POLICY IF EXISTS comp_select_manager ON public.staff_compensation;
DROP POLICY IF EXISTS comp_insert_manager ON public.staff_compensation;
DROP POLICY IF EXISTS comp_update_manager ON public.staff_compensation;
DROP POLICY IF EXISTS comp_delete_manager ON public.staff_compensation;

CREATE POLICY comp_select_admin ON public.staff_compensation
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.is_admin());

CREATE POLICY comp_insert_admin ON public.staff_compensation
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.is_admin());

CREATE POLICY comp_update_admin ON public.staff_compensation
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.is_admin())
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.is_admin());

CREATE POLICY comp_delete_admin ON public.staff_compensation
  FOR DELETE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.is_admin());