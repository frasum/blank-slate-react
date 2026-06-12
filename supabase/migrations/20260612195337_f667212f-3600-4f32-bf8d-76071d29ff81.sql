-- B1c: minimal append-only audit_log
CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  actor_user_id uuid,
  actor_staff_id uuid,
  action text NOT NULL,
  entity text NOT NULL,
  entity_id uuid,
  meta jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Grants: service_role only; explicit DENY-ALL for clients (no grants at all)
GRANT ALL ON public.audit_log TO service_role;
-- Intentionally NO grants to anon or authenticated.

ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
-- Intentionally NO policies for anon/authenticated => DENY-ALL for clients.

CREATE INDEX audit_log_org_created_idx ON public.audit_log (organization_id, created_at DESC);
CREATE INDEX audit_log_entity_idx ON public.audit_log (entity, entity_id);