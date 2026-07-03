
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS betriebsnummer text;

CREATE TABLE IF NOT EXISTS public.sofortmeldung (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  staff_id uuid NOT NULL UNIQUE REFERENCES public.staff(id) ON DELETE CASCADE,
  required boolean NOT NULL DEFAULT true,
  reported_at timestamptz,
  reported_by uuid REFERENCES public.staff(id),
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_sofortmeldung_org
  ON public.sofortmeldung (organization_id);

GRANT ALL ON public.sofortmeldung TO service_role;

ALTER TABLE public.sofortmeldung ENABLE ROW LEVEL SECURITY;

-- DENY-ALL für Clients: KEINE Policies. Zugriff nur über Server-Functions (service_role).

DROP TRIGGER IF EXISTS trg_sofortmeldung_set_updated_at ON public.sofortmeldung;
CREATE TRIGGER trg_sofortmeldung_set_updated_at
  BEFORE UPDATE ON public.sofortmeldung
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
