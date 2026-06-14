CREATE TABLE public.periods (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  label text NOT NULL,
  start_date date NOT NULL,
  end_date date NOT NULL,
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'locked')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, start_date)
);

CREATE INDEX periods_org_idx ON public.periods (organization_id);

GRANT SELECT ON public.periods TO authenticated;
GRANT ALL ON public.periods TO service_role;

ALTER TABLE public.periods ENABLE ROW LEVEL SECURITY;

CREATE POLICY periods_select_manager ON public.periods
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('manager'));

CREATE POLICY periods_insert_admin ON public.periods
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('admin'));

CREATE POLICY periods_update_admin ON public.periods
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('admin'))
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('admin'));

CREATE POLICY periods_delete_admin ON public.periods
  FOR DELETE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('admin'));

CREATE TRIGGER tg_periods_set_updated_at
  BEFORE UPDATE ON public.periods
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();