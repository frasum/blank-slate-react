
CREATE TABLE public.payroll_recurring_notes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  location_id uuid NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('rate','dauer')),
  text text NOT NULL CHECK (char_length(text) BETWEEN 1 AND 200),
  first_period_start date NOT NULL,
  periods_total integer NULL CHECK (periods_total IS NULL OR periods_total BETWEEN 1 AND 60),
  canceled_at timestamptz NULL,
  created_by_staff_id uuid NULL REFERENCES public.staff(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT prn_kind_periods_shape CHECK (
    (kind = 'rate'  AND periods_total IS NOT NULL) OR
    (kind = 'dauer' AND periods_total IS NULL)
  )
);

CREATE INDEX prn_org_staff_idx ON public.payroll_recurring_notes (organization_id, staff_id);
CREATE INDEX prn_org_active_idx ON public.payroll_recurring_notes (organization_id) WHERE canceled_at IS NULL;

GRANT SELECT, INSERT, UPDATE ON public.payroll_recurring_notes TO authenticated;
GRANT ALL ON public.payroll_recurring_notes TO service_role;

ALTER TABLE public.payroll_recurring_notes ENABLE ROW LEVEL SECURITY;

-- SELECT: manager/admin/payroll dürfen lesen (analog payroll_notes).
CREATE POLICY prn_select_manager_or_payroll
  ON public.payroll_recurring_notes
  FOR SELECT
  TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND (
      public.has_min_permission('manager')
      OR public.current_role() = 'payroll'::public.app_role
    )
  );

-- INSERT: nur manager/admin.
CREATE POLICY prn_insert_manager
  ON public.payroll_recurring_notes
  FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.has_min_permission('manager')
  );

-- UPDATE (nur canceled_at + updated_at werden vom Server geschrieben): nur manager/admin.
CREATE POLICY prn_update_manager
  ON public.payroll_recurring_notes
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

CREATE TRIGGER prn_set_updated_at
  BEFORE UPDATE ON public.payroll_recurring_notes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
