
CREATE TABLE IF NOT EXISTS public.payroll_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  period_start date NOT NULL,
  period_end date NOT NULL,
  vorschuss numeric(10,2) NOT NULL DEFAULT 0,
  besonderheiten text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, location_id, period_start, period_end)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.payroll_notes TO authenticated;
GRANT ALL ON public.payroll_notes TO service_role;

ALTER TABLE public.payroll_notes ENABLE ROW LEVEL SECURITY;

CREATE POLICY "payroll_notes_select_manager"
  ON public.payroll_notes
  FOR SELECT
  TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_min_permission('manager')
  );

CREATE POLICY "payroll_notes_insert_manager"
  ON public.payroll_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.has_min_permission('manager')
  );

CREATE POLICY "payroll_notes_update_manager"
  ON public.payroll_notes
  FOR UPDATE
  TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_min_permission('manager')
  )
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.has_min_permission('manager')
  );

CREATE TRIGGER payroll_notes_set_updated_at
  BEFORE UPDATE ON public.payroll_notes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
