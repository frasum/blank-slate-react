-- =====================================================================
-- B0: Mandantenbasis (organizations, locations) + Geschäftstag-Funktion
-- =====================================================================
-- Bezug: docs/gruendungsdokument.md §4.1 (Mandantenmodell) und
-- Qualitätsstandards (RLS ab Erstellung, Helper statt Inline-Logik).
-- Diese Migration enthält AUSSCHLIESSLICH die unten genannten Objekte.

-- ---------------------------------------------------------------------
-- organizations
-- ---------------------------------------------------------------------
CREATE TABLE public.organizations (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name        text NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.organizations TO authenticated;
GRANT ALL ON public.organizations TO service_role;

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;

-- PLATZHALTER-POLICY (B0):
-- Verweigert in dieser Phase JEDEN Zugriff für die Rolle authenticated.
-- In B1 wird sie durch eine echte Policy ersetzt, die über user_links
-- und role_assignments auf den Mandanten des angemeldeten Nutzers
-- einschränkt. Bewusst restriktiv, damit kein Mandanten-Leak entsteht,
-- bevor das Identitätsmodell steht.
CREATE POLICY "b0_placeholder_deny_all"
  ON public.organizations
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- ---------------------------------------------------------------------
-- locations
-- ---------------------------------------------------------------------
CREATE TABLE public.locations (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE RESTRICT,
  name             text NOT NULL,
  timezone         text NOT NULL DEFAULT 'Europe/Berlin',
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX locations_organization_id_idx ON public.locations (organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.locations TO authenticated;
GRANT ALL ON public.locations TO service_role;

ALTER TABLE public.locations ENABLE ROW LEVEL SECURITY;

-- PLATZHALTER-POLICY (B0): siehe Erläuterung bei organizations.
CREATE POLICY "b0_placeholder_deny_all"
  ON public.locations
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

-- ---------------------------------------------------------------------
-- current_business_date(): Geschäftstag mit 3-Uhr-Cutoff Europe/Berlin
-- ---------------------------------------------------------------------
-- TS-Spiegelung: src/lib/business-date.ts (businessDateOf).
-- Beide Implementierungen MÜSSEN semantisch synchron bleiben.
CREATE OR REPLACE FUNCTION public.current_business_date()
RETURNS date
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT ((now() AT TIME ZONE 'Europe/Berlin') - interval '3 hours')::date
$$;

REVOKE ALL ON FUNCTION public.current_business_date() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.current_business_date() TO authenticated;
GRANT EXECUTE ON FUNCTION public.current_business_date() TO service_role;