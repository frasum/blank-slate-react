ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS idx_locations_org_active
  ON public.locations (organization_id) WHERE is_active;