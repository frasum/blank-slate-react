-- ============ periods ============
DROP POLICY IF EXISTS periods_select_manager ON public.periods;
DROP POLICY IF EXISTS periods_select_payroll ON public.periods;
DROP POLICY IF EXISTS periods_insert_admin  ON public.periods;
DROP POLICY IF EXISTS periods_update_admin  ON public.periods;
DROP POLICY IF EXISTS periods_delete_admin  ON public.periods;

CREATE POLICY periods_select_view ON public.periods
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_permission('time.period.view'::public.app_permission)
  );

CREATE POLICY periods_insert_manage ON public.periods
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.has_permission('time.period.manage'::public.app_permission)
  );

-- Update: erlaubt entweder vollständige Verwaltung ODER reines Sperren/Entsperren
CREATE POLICY periods_update_manage_or_lock ON public.periods
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND (
      public.has_permission('time.period.manage'::public.app_permission)
      OR public.has_permission('time.period.lock'::public.app_permission)
    )
  )
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND (
      public.has_permission('time.period.manage'::public.app_permission)
      OR public.has_permission('time.period.lock'::public.app_permission)
    )
  );

CREATE POLICY periods_delete_manage ON public.periods
  FOR DELETE TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_permission('time.period.manage'::public.app_permission)
  );

-- ============ time_entries ============
DROP POLICY IF EXISTS time_entries_select_own     ON public.time_entries;
DROP POLICY IF EXISTS time_entries_select_payroll ON public.time_entries;

-- Eigene Buchungen immer sichtbar (Default time.entry.view_self ist im Code,
-- aber das eigene Tupel ist hier die strengere und sichere Bedingung).
CREATE POLICY time_entries_select_own ON public.time_entries
  FOR SELECT TO authenticated
  USING (staff_id = public.current_staff_id());

-- Fremde Buchungen mit time.entry.view_all (standortspezifisch einschränkbar).
CREATE POLICY time_entries_select_view_all ON public.time_entries
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_permission('time.entry.view_all'::public.app_permission, location_id)
  );

-- ============ payroll_notes ============
DROP POLICY IF EXISTS payroll_notes_select_manager ON public.payroll_notes;
DROP POLICY IF EXISTS payroll_notes_select_payroll ON public.payroll_notes;
DROP POLICY IF EXISTS payroll_notes_insert_manager ON public.payroll_notes;
DROP POLICY IF EXISTS payroll_notes_update_manager ON public.payroll_notes;

CREATE POLICY payroll_notes_select_view ON public.payroll_notes
  FOR SELECT TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_permission('time.payroll_note.view'::public.app_permission)
  );

CREATE POLICY payroll_notes_insert_edit ON public.payroll_notes
  FOR INSERT TO authenticated
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.has_permission('time.payroll_note.edit'::public.app_permission)
  );

CREATE POLICY payroll_notes_update_edit ON public.payroll_notes
  FOR UPDATE TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_permission('time.payroll_note.edit'::public.app_permission)
  )
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.has_permission('time.payroll_note.edit'::public.app_permission)
  );