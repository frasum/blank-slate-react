-- SP1: Tagesbetrieb-Schalter + Planungsfenster (Mittag/Abend) an Dienstplan-Schichten.

ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS day_service_enabled boolean NOT NULL DEFAULT false;

ALTER TABLE public.roster_shifts
  ADD COLUMN IF NOT EXISTS service_period text NOT NULL DEFAULT 'abend';

ALTER TABLE public.roster_shifts
  DROP CONSTRAINT IF EXISTS roster_shifts_service_period_check;
ALTER TABLE public.roster_shifts
  ADD CONSTRAINT roster_shifts_service_period_check
  CHECK (service_period IN ('mittag','abend'));

-- Unique-Constraint um service_period erweitern. DROP vor CREATE (Hausmuster).
ALTER TABLE public.roster_shifts
  DROP CONSTRAINT IF EXISTS roster_shifts_staff_id_location_id_shift_date_area_key;
ALTER TABLE public.roster_shifts
  DROP CONSTRAINT IF EXISTS roster_shifts_staff_id_location_id_shift_date_area_service_p_key;
ALTER TABLE public.roster_shifts
  ADD CONSTRAINT roster_shifts_staff_loc_date_area_period_key
  UNIQUE (staff_id, location_id, shift_date, area, service_period);