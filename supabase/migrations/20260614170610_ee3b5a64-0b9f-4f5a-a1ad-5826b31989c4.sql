CREATE TABLE public.roster_shifts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  shift_date date NOT NULL,
  area public.staff_department NOT NULL,
  skill_id uuid REFERENCES public.skills(id) ON DELETE SET NULL,
  status text NOT NULL DEFAULT 'planned' CHECK (status IN ('planned','confirmed')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, location_id, shift_date, area)
);

CREATE INDEX roster_shifts_org_loc_date_idx
  ON public.roster_shifts (organization_id, location_id, shift_date);

GRANT SELECT ON public.roster_shifts TO authenticated;
GRANT ALL ON public.roster_shifts TO service_role;

ALTER TABLE public.roster_shifts ENABLE ROW LEVEL SECURITY;

CREATE POLICY roster_shifts_select_org ON public.roster_shifts
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());

CREATE TRIGGER tg_roster_shifts_updated_at
  BEFORE UPDATE ON public.roster_shifts
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();