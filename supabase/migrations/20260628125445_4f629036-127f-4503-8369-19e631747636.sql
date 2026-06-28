ALTER TABLE public.waiter_settlements
  ADD COLUMN IF NOT EXISTS kassiert_brutto_cents BIGINT NOT NULL DEFAULT 0;

UPDATE public.waiter_settlements
   SET kassiert_brutto_cents = pos_sales_cents
 WHERE kassiert_brutto_cents = 0
   AND pos_sales_cents IS NOT NULL;

NOTIFY pgrst, 'reload schema';