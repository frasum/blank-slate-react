-- === 1) Konfession ===
ALTER TABLE public.staff_personal_details
  ADD COLUMN IF NOT EXISTS konfession text;

-- === 2) Änderungsanträge ===
CREATE TABLE IF NOT EXISTS public.staff_data_change_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  note text,
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','rejected')),
  review_note text,
  reviewed_by uuid REFERENCES public.staff(id),
  reviewed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_sdcr_org_status
  ON public.staff_data_change_requests (organization_id, status, created_at DESC);
CREATE UNIQUE INDEX IF NOT EXISTS sdcr_one_pending_per_staff
  ON public.staff_data_change_requests (staff_id) WHERE status = 'pending';

ALTER TABLE public.staff_data_change_requests ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.staff_data_change_requests TO service_role;

-- === 3) Dokumente ===
CREATE TABLE IF NOT EXISTS public.staff_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  doc_type text NOT NULL
    CHECK (doc_type IN ('passport','visa','work_permit','health_certificate','other')),
  file_path text NOT NULL UNIQUE,
  original_filename text NOT NULL,
  mime_type text NOT NULL,
  size_bytes bigint NOT NULL CHECK (size_bytes > 0),
  valid_until date,
  note text,
  uploaded_by uuid NOT NULL REFERENCES public.staff(id),
  verified_by uuid REFERENCES public.staff(id),
  verified_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_staff_documents_org_staff
  ON public.staff_documents (organization_id, staff_id, doc_type);
CREATE INDEX IF NOT EXISTS idx_staff_documents_valid_until
  ON public.staff_documents (organization_id, valid_until)
  WHERE valid_until IS NOT NULL;

ALTER TABLE public.staff_documents ENABLE ROW LEVEL SECURITY;
GRANT ALL ON public.staff_documents TO service_role;

-- === 4) Nachzug: Lohn-RLS-Härtung (idempotent) ===
DROP POLICY IF EXISTS lohn_absence_days_select ON public.lohn_absence_days;
CREATE POLICY lohn_absence_days_select ON public.lohn_absence_days
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('manager'));

DROP POLICY IF EXISTS lohn_recurring_zeilen_select ON public.lohn_recurring_zeilen;
CREATE POLICY lohn_recurring_zeilen_select ON public.lohn_recurring_zeilen
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('manager'));