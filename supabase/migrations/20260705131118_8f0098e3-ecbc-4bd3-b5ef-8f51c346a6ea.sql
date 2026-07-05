ALTER TABLE public.sales_articles
  ADD COLUMN IF NOT EXISTS ek_price_cents bigint
  CHECK (ek_price_cents IS NULL OR ek_price_cents >= 0);