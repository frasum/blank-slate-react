-- 1) Idempotenz-Schlüssel auf time_entries
ALTER TABLE public.time_entries
  ADD COLUMN IF NOT EXISTS import_key TEXT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS time_entries_import_key_unique
  ON public.time_entries (organization_id, import_key)
  WHERE source = 'import' AND import_key IS NOT NULL;

-- 2) import_runs
CREATE TABLE public.import_runs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  source_system TEXT NOT NULL CHECK (source_system IN ('tagesabrechnung', 'bunker')),
  file_hash TEXT NOT NULL,
  mode TEXT NOT NULL CHECK (mode IN ('dry_run', 'commit')),
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ NULL,
  counters JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX import_runs_org_started_idx
  ON public.import_runs (organization_id, started_at DESC);

GRANT SELECT ON public.import_runs TO authenticated;
GRANT ALL ON public.import_runs TO service_role;

ALTER TABLE public.import_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "import_runs_select_admin"
ON public.import_runs
FOR SELECT
TO authenticated
USING (
  organization_id = public.current_organization_id()
  AND public.is_admin()
);

-- 3) staff_identity_map
CREATE TABLE public.staff_identity_map (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  source_system TEXT NOT NULL CHECK (source_system IN ('tagesabrechnung', 'bunker')),
  alt_id TEXT NOT NULL,
  alt_name TEXT NOT NULL,
  staff_id UUID NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  confirmed_at TIMESTAMPTZ NULL,
  confirmed_by UUID NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (organization_id, source_system, alt_id)
);

CREATE INDEX staff_identity_map_org_idx
  ON public.staff_identity_map (organization_id, source_system);

GRANT SELECT ON public.staff_identity_map TO authenticated;
GRANT ALL ON public.staff_identity_map TO service_role;

ALTER TABLE public.staff_identity_map ENABLE ROW LEVEL SECURITY;

CREATE POLICY "staff_identity_map_select_admin"
ON public.staff_identity_map
FOR SELECT
TO authenticated
USING (
  organization_id = public.current_organization_id()
  AND public.is_admin()
);

CREATE TRIGGER staff_identity_map_set_updated_at
BEFORE UPDATE ON public.staff_identity_map
FOR EACH ROW
EXECUTE FUNCTION public.tg_time_entries_set_updated_at();