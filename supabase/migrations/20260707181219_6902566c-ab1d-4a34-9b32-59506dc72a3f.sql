
CREATE TABLE public.ki_usage_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  model text NOT NULL,
  input_tokens integer NOT NULL DEFAULT 0,
  output_tokens integer NOT NULL DEFAULT 0,
  tool_rounds integer NOT NULL DEFAULT 0,
  cost_microcents bigint NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX ki_usage_log_org_created_idx
  ON public.ki_usage_log (organization_id, created_at DESC);

GRANT SELECT ON public.ki_usage_log TO authenticated;
GRANT ALL   ON public.ki_usage_log TO service_role;

ALTER TABLE public.ki_usage_log ENABLE ROW LEVEL SECURITY;

-- Nur Admins der eigenen Organisation dürfen die Nutzungs-/Kostenprotokolle lesen.
-- Schreiben ausschließlich serverseitig (service_role); keine INSERT/UPDATE/DELETE-Policy.
CREATE POLICY "ki_usage_log_select_admin"
  ON public.ki_usage_log FOR SELECT
  TO authenticated
  USING (organization_id = public.current_organization_id() AND public.is_admin());
