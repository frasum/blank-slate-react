-- SP2 — Fenster-Katalog um 'frueh' erweitern
ALTER TABLE public.roster_shifts DROP CONSTRAINT IF EXISTS roster_shifts_service_period_check;
ALTER TABLE public.roster_shifts
  ADD CONSTRAINT roster_shifts_service_period_check
  CHECK (service_period IN ('frueh','mittag','abend'));

-- Konfigurierbare Fenster-Liste je Standort
ALTER TABLE public.locations
  ADD COLUMN enabled_service_periods text[] NOT NULL DEFAULT ARRAY['abend']::text[];

ALTER TABLE public.locations
  ADD CONSTRAINT locations_service_periods_chk
  CHECK (
    enabled_service_periods <@ ARRAY['frueh','mittag','abend']::text[]
    AND array_length(enabled_service_periods, 1) >= 1
  );

-- Bestandsübernahme: bisher aktivierter Tagesbetrieb → Mittag+Abend
UPDATE public.locations
  SET enabled_service_periods = ARRAY['mittag','abend']::text[]
  WHERE day_service_enabled = true;

-- Alten Boolean entfernen (durch Liste ersetzt)
ALTER TABLE public.locations DROP COLUMN day_service_enabled;