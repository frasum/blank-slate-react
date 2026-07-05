
CREATE TABLE public.sales_pos_group_overrides (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  nummer integer NOT NULL,
  warengruppe text,
  product_group integer,
  untergruppe text,
  untergruppe_nr integer,
  hauptgruppe text,
  hauptgruppe_nr integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, nummer)
);

CREATE INDEX sales_pos_group_overrides_org_loc_idx
  ON public.sales_pos_group_overrides (organization_id, location_id);

GRANT ALL ON public.sales_pos_group_overrides TO service_role;

ALTER TABLE public.sales_pos_group_overrides ENABLE ROW LEVEL SECURITY;

-- DENY-ALL: kein direkter Client-Zugriff, alle Wege über Server-Fn (supabaseAdmin, manager+).
CREATE POLICY "sales_pos_group_overrides_deny_all"
  ON public.sales_pos_group_overrides
  FOR ALL
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE TRIGGER sales_pos_group_overrides_set_updated_at
  BEFORE UPDATE ON public.sales_pos_group_overrides
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
