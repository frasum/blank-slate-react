ALTER TABLE public.sales_articles
  ADD COLUMN IF NOT EXISTS warengruppe     text,
  ADD COLUMN IF NOT EXISTS untergruppe     text,
  ADD COLUMN IF NOT EXISTS untergruppe_nr  integer,
  ADD COLUMN IF NOT EXISTS hauptgruppe     text,
  ADD COLUMN IF NOT EXISTS hauptgruppe_nr  integer;

CREATE INDEX IF NOT EXISTS idx_sales_articles_gruppen
  ON public.sales_articles (location_id, hauptgruppe_nr, untergruppe_nr, product_group);