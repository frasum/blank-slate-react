CREATE TABLE public.roster_availability (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  date date NOT NULL,
  type text NOT NULL DEFAULT 'unavailable' CHECK (type IN ('unavailable')),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, date)
);

CREATE INDEX roster_availability_org_date_idx
  ON public.roster_availability (organization_id, date);

GRANT SELECT ON public.roster_availability TO authenticated;
GRANT ALL ON public.roster_availability TO service_role;

ALTER TABLE public.roster_availability ENABLE ROW LEVEL SECURITY;

CREATE POLICY roster_availability_select_org ON public.roster_availability
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());

ALTER TABLE public.roster_availability REPLICA IDENTITY FULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_publication_tables
    WHERE pubname = 'supabase_realtime'
      AND schemaname = 'public'
      AND tablename = 'roster_availability'
  ) THEN
    EXECUTE 'ALTER PUBLICATION supabase_realtime ADD TABLE public.roster_availability';
  END IF;
END$$;