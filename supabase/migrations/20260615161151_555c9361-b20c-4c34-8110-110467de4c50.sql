
CREATE TABLE public.staff_easyorder_access (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id        uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  location_id     uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  can_add_free_items boolean NOT NULL DEFAULT false,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, location_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_easyorder_access TO authenticated;
GRANT ALL ON public.staff_easyorder_access TO service_role;

ALTER TABLE public.staff_easyorder_access ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seo_access_select_org" ON public.staff_easyorder_access
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());

CREATE POLICY "seo_access_write_mgr" ON public.staff_easyorder_access
  FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('manager'))
  WITH CHECK (organization_id = public.current_organization_id()
             AND public.has_min_permission('manager'));

CREATE INDEX ON public.staff_easyorder_access (organization_id, staff_id);

CREATE TRIGGER trg_staff_easyorder_access_updated_at
  BEFORE UPDATE ON public.staff_easyorder_access
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();


CREATE TABLE public.staff_easyorder_suppliers (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id        uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  location_id     uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  supplier_id     uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, location_id, supplier_id)
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_easyorder_suppliers TO authenticated;
GRANT ALL ON public.staff_easyorder_suppliers TO service_role;

ALTER TABLE public.staff_easyorder_suppliers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "seo_suppliers_select_org" ON public.staff_easyorder_suppliers
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());

CREATE POLICY "seo_suppliers_write_mgr" ON public.staff_easyorder_suppliers
  FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('manager'))
  WITH CHECK (organization_id = public.current_organization_id()
             AND public.has_min_permission('manager'));

CREATE INDEX ON public.staff_easyorder_suppliers (organization_id, staff_id, location_id);
