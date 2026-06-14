-- P1: Stammdaten-Fundament Trinkgeld-/Provisionsverteilung.
-- Schema only — keine Berechnung, keine UI. Idempotent (IF [NOT] EXISTS).

-- =========================================================================
-- 1) staff_department Enum
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'staff_department') THEN
    CREATE TYPE public.staff_department AS ENUM ('kitchen', 'service', 'gl');
  END IF;
END$$;

-- =========================================================================
-- 2) staff_locations.department (nullable -> backfill 'service' -> NOT NULL)
--    Unique-Wechsel: (staff_id, location_id) -> (staff_id, location_id, department)
-- =========================================================================
ALTER TABLE public.staff_locations
  ADD COLUMN IF NOT EXISTS department public.staff_department;

UPDATE public.staff_locations
  SET department = 'service'::public.staff_department
  WHERE department IS NULL;

ALTER TABLE public.staff_locations
  ALTER COLUMN department SET NOT NULL;

-- Alten Unique-Constraint droppen (Name aus Tabellen-DDL: implizit
-- "staff_locations_staff_id_location_id_key").
ALTER TABLE public.staff_locations
  DROP CONSTRAINT IF EXISTS staff_locations_staff_id_location_id_key;

-- Neuer Unique inkl. department, idempotent via UNIQUE INDEX.
CREATE UNIQUE INDEX IF NOT EXISTS staff_locations_staff_loc_dept_uniq
  ON public.staff_locations (staff_id, location_id, department);

-- =========================================================================
-- 3) staff.participates_in_pool
--    Bedeutung: Ausnahme-Schalter unter Küche/Service. GL ist über die
--    Abteilung ausgeschlossen, NICHT über dieses Flag.
-- =========================================================================
ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS participates_in_pool boolean NOT NULL DEFAULT true;

-- =========================================================================
-- 4) revenue_channels.is_takeaway + neuer Kind 'delivery_vectron'
-- =========================================================================
ALTER TABLE public.revenue_channels
  ADD COLUMN IF NOT EXISTS is_takeaway boolean NOT NULL DEFAULT false;

-- CHECK auf kind erweitern (vorher: ohne delivery_vectron).
ALTER TABLE public.revenue_channels
  DROP CONSTRAINT IF EXISTS revenue_channels_kind_check;
ALTER TABLE public.revenue_channels
  ADD CONSTRAINT revenue_channels_kind_check CHECK (kind IN (
    'pos',
    'delivery_souse',
    'delivery_wolt',
    'delivery_vectron',
    'voucher_sold',
    'voucher_redeemed',
    'finedine',
    'einladung',
    'sonstige'
  ));

-- Takeaway-Backfill: bestehende Liefer-Kanäle markieren.
UPDATE public.revenue_channels
  SET is_takeaway = true
  WHERE kind IN ('delivery_souse', 'delivery_wolt', 'delivery_vectron')
    AND is_takeaway = false;

-- Vectron-Kanal je bestehender Location einfügen (idempotent).
-- Wir nutzen die Spalten der bestehenden Tabelle: label/display_name.
-- sort_order wird auf max+1 je Location gesetzt, damit die UI-Reihenfolge
-- deterministisch bleibt.
INSERT INTO public.revenue_channels
  (organization_id, location_id, label, kind, is_takeaway, sort_order)
SELECT
  l.organization_id,
  l.id AS location_id,
  'Vectron' AS label,
  'delivery_vectron' AS kind,
  true AS is_takeaway,
  COALESCE(
    (SELECT MAX(rc.sort_order) + 1
       FROM public.revenue_channels rc
      WHERE rc.location_id = l.id),
    100
  ) AS sort_order
FROM public.locations l
ON CONFLICT (organization_id, location_id, kind) DO NOTHING;

-- =========================================================================
-- 5) location_department_defaults (Standard-Eincheckzeit je Standort+Abt.)
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.location_department_defaults (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id  uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id      uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  department       public.staff_department NOT NULL,
  default_checkin  time NOT NULL,
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, department)
);

CREATE INDEX IF NOT EXISTS location_department_defaults_org_idx
  ON public.location_department_defaults (organization_id);
CREATE INDEX IF NOT EXISTS location_department_defaults_loc_idx
  ON public.location_department_defaults (location_id);

-- GRANTs: SELECT für authenticated, ALL für service_role. Kein anon.
-- Writes laufen ausschließlich über service_role (DENY-ALL via fehlender
-- Policies + fehlender INSERT/UPDATE/DELETE GRANTs für authenticated).
GRANT SELECT ON public.location_department_defaults TO authenticated;
GRANT ALL    ON public.location_department_defaults TO service_role;

ALTER TABLE public.location_department_defaults ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS ldd_select_org ON public.location_department_defaults;
CREATE POLICY ldd_select_org ON public.location_department_defaults
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());

-- updated_at-Trigger (nutzt die generische Funktion aus der Code-Basis,
-- vorher: tg_time_entries_set_updated_at — gleiche Signatur trigger-fn).
CREATE OR REPLACE FUNCTION public.tg_set_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS tg_ldd_updated_at ON public.location_department_defaults;
CREATE TRIGGER tg_ldd_updated_at
  BEFORE UPDATE ON public.location_department_defaults
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Seed je bestehender Location: kitchen=15:00, service=16:00. Kein gl-Seed.
INSERT INTO public.location_department_defaults
  (organization_id, location_id, department, default_checkin)
SELECT l.organization_id, l.id, 'kitchen'::public.staff_department, time '15:00'
  FROM public.locations l
ON CONFLICT (location_id, department) DO NOTHING;

INSERT INTO public.location_department_defaults
  (organization_id, location_id, department, default_checkin)
SELECT l.organization_id, l.id, 'service'::public.staff_department, time '16:00'
  FROM public.locations l
ON CONFLICT (location_id, department) DO NOTHING;
