
-- Wiederkehrende Ruhetage je Standort (ISO-Wochentag: 1=Mo … 7=So)
CREATE TABLE public.location_rest_days (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  weekday int NOT NULL CHECK (weekday BETWEEN 1 AND 7),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, weekday)
);

REVOKE ALL ON public.location_rest_days FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.location_rest_days TO service_role;
ALTER TABLE public.location_rest_days ENABLE ROW LEVEL SECURITY;

CREATE INDEX location_rest_days_org_loc_idx
  ON public.location_rest_days (organization_id, location_id);

-- Einmalige Kalender-Ausnahmen: Schließtag ODER Sonderöffnung
CREATE TABLE public.location_calendar_exceptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  date date NOT NULL,
  kind text NOT NULL CHECK (kind IN ('closed','open')),
  reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (location_id, date)
);

REVOKE ALL ON public.location_calendar_exceptions FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.location_calendar_exceptions TO service_role;
ALTER TABLE public.location_calendar_exceptions ENABLE ROW LEVEL SECURITY;

CREATE INDEX location_calendar_exceptions_org_loc_date_idx
  ON public.location_calendar_exceptions (organization_id, location_id, date);

CREATE TRIGGER tg_location_calendar_exceptions_updated_at
  BEFORE UPDATE ON public.location_calendar_exceptions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- Org-Setting: zählen Feiertage als Urlaubstage? Default: nein.
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS count_holidays_as_leave boolean NOT NULL DEFAULT false;
