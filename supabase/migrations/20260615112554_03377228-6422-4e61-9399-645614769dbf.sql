CREATE TABLE public.session_tip_pool_entries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  session_id uuid NOT NULL REFERENCES public.sessions(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  department public.staff_department NOT NULL,
  hours_minutes integer NOT NULL CHECK (hours_minutes >= 0 AND hours_minutes <= 1440),
  note text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, staff_id)
);

CREATE INDEX idx_stpe_session ON public.session_tip_pool_entries (session_id);
CREATE INDEX idx_stpe_org ON public.session_tip_pool_entries (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.session_tip_pool_entries TO authenticated;
GRANT ALL ON public.session_tip_pool_entries TO service_role;

ALTER TABLE public.session_tip_pool_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "stpe_select_manager"
  ON public.session_tip_pool_entries FOR SELECT
  TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_min_permission('manager'::public.app_role)
  );

CREATE POLICY "stpe_insert_manager"
  ON public.session_tip_pool_entries FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.has_min_permission('manager'::public.app_role)
  );

CREATE POLICY "stpe_update_manager"
  ON public.session_tip_pool_entries FOR UPDATE
  TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_min_permission('manager'::public.app_role)
  )
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.has_min_permission('manager'::public.app_role)
  );

CREATE POLICY "stpe_delete_manager"
  ON public.session_tip_pool_entries FOR DELETE
  TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_min_permission('manager'::public.app_role)
  );

CREATE TRIGGER trg_stpe_updated_at
  BEFORE UPDATE ON public.session_tip_pool_entries
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();