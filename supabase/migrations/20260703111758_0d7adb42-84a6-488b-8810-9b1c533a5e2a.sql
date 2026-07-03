
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS arbeitgeber_name text,
  ADD COLUMN IF NOT EXISTS arbeitgeber_adresse text,
  ADD COLUMN IF NOT EXISTS arbeitgeber_vertreter text;

CREATE TABLE IF NOT EXISTS public.document_templates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  doc_type text NOT NULL CHECK (doc_type IN
    ('arbeitsvertrag','arbeitszeugnis_einfach','arbeitsbescheinigung')),
  name text NOT NULL,
  content text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

GRANT ALL ON public.document_templates TO service_role;
ALTER TABLE public.document_templates ENABLE ROW LEVEL SECURITY;

DROP TRIGGER IF EXISTS trg_document_templates_updated_at ON public.document_templates;
CREATE TRIGGER trg_document_templates_updated_at
  BEFORE UPDATE ON public.document_templates
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE TABLE IF NOT EXISTS public.generated_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  staff_id uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  template_id uuid REFERENCES public.document_templates(id) ON DELETE SET NULL,
  doc_type text NOT NULL,
  title text NOT NULL,
  content text NOT NULL,
  metadata jsonb NOT NULL DEFAULT '{}',
  created_by uuid NOT NULL REFERENCES public.staff(id),
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_generated_documents_org_staff
  ON public.generated_documents (organization_id, staff_id, created_at DESC);

GRANT ALL ON public.generated_documents TO service_role;
ALTER TABLE public.generated_documents ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.staff_documents
  DROP CONSTRAINT IF EXISTS staff_documents_doc_type_check;
ALTER TABLE public.staff_documents
  ADD CONSTRAINT staff_documents_doc_type_check CHECK (doc_type IN
    ('passport','visa','work_permit','health_certificate','contract','other'));
