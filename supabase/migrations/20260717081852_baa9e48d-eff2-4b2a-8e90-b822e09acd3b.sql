alter table public.suppliers
  add column if not exists first_live_order_email_at timestamptz;