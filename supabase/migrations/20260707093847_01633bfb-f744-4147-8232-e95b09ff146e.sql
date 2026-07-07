-- BFIX7: Schema-Parität Live ↔ Kette. Spalte wurde seinerzeit direkt auf der
-- Live-DB angelegt; live ist dieses Statement ein No-op.
ALTER TABLE public.payment_terminals
  ADD COLUMN IF NOT EXISTS is_gl boolean NOT NULL DEFAULT false;