CREATE TABLE public.staff_personal_details (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  staff_id uuid NOT NULL UNIQUE REFERENCES public.staff(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone text,
  email text,
  address text,
  date_of_birth date,
  place_of_birth text,
  salutation text,
  nationality text,
  tax_class text CHECK (tax_class IS NULL OR tax_class IN ('I','II','III','IV','V','VI')),
  tax_id text,
  social_security_number text,
  is_minijob boolean,
  is_sv_exempt boolean,
  health_insurance text,
  church_tax_liable boolean,
  child_tax_allowances numeric,
  iban text,
  bank_name text,
  account_holder text,
  employment_start_date date,
  employment_end_date date,
  personnel_group text,
  job_title text,
  vacation_days_contractual integer,
  vacation_days_previous_year integer,
  vacation_days_current_year integer,
  vacation_days_taken integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX staff_personal_details_org_idx
  ON public.staff_personal_details (organization_id);

GRANT SELECT ON public.staff_personal_details TO authenticated;
GRANT ALL ON public.staff_personal_details TO service_role;

ALTER TABLE public.staff_personal_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY details_select_manager
  ON public.staff_personal_details
  FOR SELECT
  TO authenticated
  USING (
    public.has_min_permission('manager'::public.app_role)
    AND organization_id = public.current_organization_id()
  );

CREATE TRIGGER tg_staff_personal_details_set_updated_at
  BEFORE UPDATE ON public.staff_personal_details
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
