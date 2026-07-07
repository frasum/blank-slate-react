
-- B2a: Zeiterfassung — Kerntabelle time_entries
-- Geschäftsregeln im Code (server-side); RLS verbietet jeden Client-Schreibzugriff.

-- BFIX4: enthält auch die 2 später ergänzten Werte (import, pool);
-- ALTER TYPE ADD VALUE IF NOT EXISTS weiter unten in der Kette sind No-ops.
CREATE TYPE public.time_entry_source AS ENUM ('clock', 'manual', 'import', 'pool');

CREATE TABLE public.time_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  staff_id UUID NOT NULL REFERENCES public.staff(id) ON DELETE RESTRICT,
  location_id UUID NULL REFERENCES public.locations(id) ON DELETE SET NULL,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ NULL,
  business_date DATE NOT NULL,
  source public.time_entry_source NOT NULL DEFAULT 'clock',
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CONSTRAINT time_entries_ended_after_started CHECK (ended_at IS NULL OR ended_at > started_at)
);

-- Höchstens ein offener Eintrag pro Mitarbeiter
CREATE UNIQUE INDEX time_entries_one_open_per_staff
  ON public.time_entries (staff_id)
  WHERE ended_at IS NULL;

CREATE INDEX time_entries_staff_business_date_idx
  ON public.time_entries (staff_id, business_date DESC);

CREATE INDEX time_entries_org_business_date_idx
  ON public.time_entries (organization_id, business_date DESC);

-- GRANTs: Clients dürfen NUR lesen, niemals schreiben.
GRANT SELECT ON public.time_entries TO authenticated;
GRANT ALL ON public.time_entries TO service_role;

-- RLS wird durch rls_auto_enable Event-Trigger aktiviert; sicherheitshalber:
ALTER TABLE public.time_entries ENABLE ROW LEVEL SECURITY;

-- Lese-Policy: nur eigene Einträge.
CREATE POLICY "time_entries_select_own"
ON public.time_entries
FOR SELECT
TO authenticated
USING (staff_id = public.current_staff_id());

-- Bewusst KEINE INSERT/UPDATE/DELETE-Policy für authenticated.
-- Alle Schreibvorgänge laufen via service_role aus geprüften Server-Functions.

-- updated_at-Trigger
CREATE OR REPLACE FUNCTION public.tg_time_entries_set_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

CREATE TRIGGER time_entries_set_updated_at
BEFORE UPDATE ON public.time_entries
FOR EACH ROW
EXECUTE FUNCTION public.tg_time_entries_set_updated_at();
