CREATE TABLE public.display_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id UUID NOT NULL UNIQUE REFERENCES public.locations(id) ON DELETE CASCADE,
  display_token TEXT NOT NULL UNIQUE DEFAULT encode(gen_random_bytes(32), 'hex'),
  is_enabled BOOLEAN NOT NULL DEFAULT true,
  refresh_interval_seconds INTEGER NOT NULL DEFAULT 60,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.display_settings TO authenticated;
GRANT ALL ON public.display_settings TO service_role;

ALTER TABLE public.display_settings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "display_settings_select_own_org"
  ON public.display_settings FOR SELECT
  TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_min_permission('manager'::public.app_role)
  );

CREATE POLICY "display_settings_insert_own_org"
  ON public.display_settings FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.has_min_permission('manager'::public.app_role)
  );

CREATE POLICY "display_settings_update_own_org"
  ON public.display_settings FOR UPDATE
  TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_min_permission('manager'::public.app_role)
  )
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.has_min_permission('manager'::public.app_role)
  );

CREATE POLICY "display_settings_delete_own_org"
  ON public.display_settings FOR DELETE
  TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.has_min_permission('manager'::public.app_role)
  );

CREATE TRIGGER tg_display_settings_set_updated_at
  BEFORE UPDATE ON public.display_settings
  FOR EACH ROW
  EXECUTE FUNCTION public.tg_set_updated_at();