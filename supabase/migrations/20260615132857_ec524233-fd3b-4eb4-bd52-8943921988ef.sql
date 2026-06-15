ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS order_email_reply_to text,
  ADD COLUMN IF NOT EXISTS order_email_bcc text;

ALTER TABLE public.orders
  ADD COLUMN IF NOT EXISTS email_sent boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS email_error text,
  ADD COLUMN IF NOT EXISTS email_message_id text;