CREATE TABLE IF NOT EXISTS public.bwa_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  entity text NOT NULL,
  cost_center text NOT NULL,
  month date NOT NULL,
  umsatz_cents bigint NOT NULL,
  getraenke_cents bigint NOT NULL DEFAULT 0,
  speisen_haus_cents bigint NOT NULL DEFAULT 0,
  speisen_ausser_haus_cents bigint NOT NULL DEFAULT 0,
  sonstige_erloese_cents bigint NOT NULL DEFAULT 0,
  sonst_ertraege_cents bigint NOT NULL DEFAULT 0,
  wareneinsatz_cents bigint NOT NULL,
  personal_cents bigint NOT NULL,
  sachkosten_cents bigint NOT NULL,
  anlage_cents bigint NOT NULL DEFAULT 0,
  abschreibung_cents bigint NOT NULL DEFAULT 0,
  betriebsergebnis_cents bigint NOT NULL,
  sachkosten_detail jsonb,
  source text NOT NULL DEFAULT 'manual'
    CHECK (source IN ('manual','pdf','import')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bwa_month_is_first_of_month
    CHECK (month = date_trunc('month', month)::date),
  CONSTRAINT bwa_monthly_unique
    UNIQUE (organization_id, entity, cost_center, month)
);

GRANT SELECT ON public.bwa_monthly TO authenticated;
GRANT ALL ON public.bwa_monthly TO service_role;

ALTER TABLE public.bwa_monthly ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bwa_monthly_select ON public.bwa_monthly;
CREATE POLICY bwa_monthly_select ON public.bwa_monthly
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('admin'));

DROP TRIGGER IF EXISTS trg_bwa_monthly_updated_at ON public.bwa_monthly;
CREATE TRIGGER trg_bwa_monthly_updated_at
  BEFORE UPDATE ON public.bwa_monthly
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX IF NOT EXISTS bwa_monthly_org_entity_cc_month_idx
  ON public.bwa_monthly (organization_id, entity, cost_center, month DESC);