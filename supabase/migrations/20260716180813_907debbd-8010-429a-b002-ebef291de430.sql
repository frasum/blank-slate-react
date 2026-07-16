-- LG1: Bereichs-Stundenlöhne (Service / Küche / GL) je Mitarbeiter
--
-- Dokumentierte Domänen-Ausnahme: hourly_rate ist numeric(10,2) in Euro
-- (statt BIGINT-Cents). Grund: Konsistenz mit der bestehenden Spalte
-- staff_compensation.hourly_rate; Domänen-Konsistenz schlägt Neubeginn.
-- Der Resolver in src/lib/lohn/rate-resolver.ts liefert nach außen Cents.
--
-- DENY-ALL für Client: Zugriff läuft ausschließlich über Server-Functions
-- (getStaffCompensation / upsertStaffCompensation) mit requireSupabaseAuth
-- und has_permission-Check. Keine Grants an authenticated, keine Policies
-- für authenticated. Konsistent mit MA1 (§96) und der Doktrin für
-- Geld-Tabellen.

CREATE TABLE public.staff_compensation_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  department public.staff_department NOT NULL,
  hourly_rate numeric(10,2) NOT NULL CHECK (hourly_rate >= 0),
  valid_from date NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, department, valid_from)
);

COMMENT ON TABLE public.staff_compensation_rates IS
  'LG1: Bereichs-Stundenlöhne (Service/Küche/GL) je Mitarbeiter mit Historie via valid_from. DENY-ALL für Client — Zugriff nur via Server-Functions.';
COMMENT ON COLUMN public.staff_compensation_rates.hourly_rate IS
  'Dokumentierte Domänen-Ausnahme: Euro in numeric(10,2) statt BIGINT-Cents, konsistent mit staff_compensation.hourly_rate.';

CREATE INDEX idx_staff_comp_rates_org ON public.staff_compensation_rates(organization_id);
CREATE INDEX idx_staff_comp_rates_staff ON public.staff_compensation_rates(staff_id);
CREATE INDEX idx_staff_comp_rates_lookup ON public.staff_compensation_rates(staff_id, department, valid_from DESC);

-- Nur service_role — Client hat keinerlei direkten Zugriff.
GRANT ALL ON public.staff_compensation_rates TO service_role;

ALTER TABLE public.staff_compensation_rates ENABLE ROW LEVEL SECURITY;

-- Keine Policies für authenticated/anon — RLS verweigert damit sämtlichen
-- Client-Zugriff. service_role bypasst RLS.

CREATE TRIGGER trg_staff_comp_rates_updated_at
  BEFORE UPDATE ON public.staff_compensation_rates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
