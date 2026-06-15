
-- Welle 2: Inventur (Restaurant) — zwei Tabellen + RLS

CREATE TABLE public.inventory_sessions (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id   uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id       uuid NOT NULL REFERENCES public.locations(id) ON DELETE RESTRICT,
  user_id           uuid NOT NULL REFERENCES auth.users(id) ON DELETE RESTRICT,
  name              text NOT NULL DEFAULT 'Inventur',
  status            text NOT NULL DEFAULT 'in_progress'
                      CHECK (status IN ('in_progress','completed')),
  notes             text,
  total_value_cents bigint NOT NULL DEFAULT 0,
  completed_at      timestamptz,
  created_at        timestamptz NOT NULL DEFAULT now(),
  updated_at        timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_sessions TO authenticated;
GRANT ALL ON public.inventory_sessions TO service_role;

ALTER TABLE public.inventory_sessions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_sessions_select_org" ON public.inventory_sessions
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());

CREATE POLICY "inv_sessions_insert_mgr" ON public.inventory_sessions
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('manager')
              AND user_id = auth.uid());

CREATE POLICY "inv_sessions_update_mgr" ON public.inventory_sessions
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('manager'))
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('manager'));

CREATE POLICY "inv_sessions_delete_admin" ON public.inventory_sessions
  FOR DELETE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.is_admin());

CREATE INDEX idx_inv_sessions_org_loc_created
  ON public.inventory_sessions (organization_id, location_id, created_at DESC);

CREATE TRIGGER trg_inv_sessions_updated_at
  BEFORE UPDATE ON public.inventory_sessions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE public.inventory_items (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  session_id       uuid NOT NULL REFERENCES public.inventory_sessions(id) ON DELETE CASCADE,
  article_id       uuid NOT NULL REFERENCES public.articles(id) ON DELETE CASCADE,
  storage_1        numeric NOT NULL DEFAULT 0 CHECK (storage_1 >= 0),
  storage_2        numeric NOT NULL DEFAULT 0 CHECK (storage_2 >= 0),
  total_qty        numeric GENERATED ALWAYS AS (storage_1 + storage_2) STORED,
  unit_price_cents bigint NOT NULL DEFAULT 0,
  line_value_cents bigint NOT NULL DEFAULT 0,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (session_id, article_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.inventory_items TO authenticated;
GRANT ALL ON public.inventory_items TO service_role;

ALTER TABLE public.inventory_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "inv_items_select_org" ON public.inventory_items
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id()
         AND EXISTS (SELECT 1 FROM public.inventory_sessions s
                     WHERE s.id = inventory_items.session_id
                       AND s.organization_id = public.current_organization_id()));

CREATE POLICY "inv_items_write_mgr" ON public.inventory_items
  FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('manager')
         AND EXISTS (SELECT 1 FROM public.inventory_sessions s
                     WHERE s.id = inventory_items.session_id
                       AND s.organization_id = public.current_organization_id()))
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('manager')
              AND EXISTS (SELECT 1 FROM public.inventory_sessions s
                          WHERE s.id = inventory_items.session_id
                            AND s.organization_id = public.current_organization_id()));

CREATE INDEX idx_inv_items_session ON public.inventory_items (session_id);
CREATE INDEX idx_inv_items_article ON public.inventory_items (article_id);

CREATE TRIGGER trg_inv_items_updated_at
  BEFORE UPDATE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
