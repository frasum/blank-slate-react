CREATE TABLE public.order_email_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  sent_at timestamptz NOT NULL DEFAULT now(),
  mode text NOT NULL CHECK (mode IN ('production','test')),
  recipient_email text NOT NULL,
  supplier_email_snapshot text,
  subject text NOT NULL,
  status text NOT NULL CHECK (status IN ('sent','failed')),
  http_status int,
  provider_message_id text,
  response_body text,
  error_message text,
  triggered_by_user_id uuid,
  is_resend boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX order_email_log_order_id_sent_at_idx
  ON public.order_email_log (order_id, sent_at DESC);
CREATE INDEX order_email_log_org_sent_at_idx
  ON public.order_email_log (organization_id, sent_at DESC);

GRANT SELECT, INSERT ON public.order_email_log TO authenticated;
GRANT ALL ON public.order_email_log TO service_role;

ALTER TABLE public.order_email_log ENABLE ROW LEVEL SECURITY;

-- SELECT: nur Manager+ der eigenen Organisation dürfen den Log lesen.
CREATE POLICY "order_email_log_select_manager"
  ON public.order_email_log
  FOR SELECT
  TO authenticated
  USING (
    public.has_min_permission('manager'::public.app_role)
    AND organization_id = public.current_organization_id()
  );

-- Kein INSERT-Policy für authenticated: Inserts laufen ausschließlich
-- über sendOrderEmailWithAdmin (service_role, RLS-bypass).