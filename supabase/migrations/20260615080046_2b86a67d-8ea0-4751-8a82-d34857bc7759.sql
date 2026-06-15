-- Idempotent: re-add NOT NULL DEFAULTs and CHECK-Constraints für sessions
ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS guest_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vouchers_sold_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vouchers_redeemed_cents integer NOT NULL DEFAULT 0;

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_guest_count_nonneg,
  ADD CONSTRAINT sessions_guest_count_nonneg CHECK (guest_count >= 0);

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_vouchers_sold_nonneg,
  ADD CONSTRAINT sessions_vouchers_sold_nonneg CHECK (vouchers_sold_cents >= 0);

ALTER TABLE public.sessions
  DROP CONSTRAINT IF EXISTS sessions_vouchers_redeemed_nonneg,
  ADD CONSTRAINT sessions_vouchers_redeemed_nonneg CHECK (vouchers_redeemed_cents >= 0);

-- PostgREST-Schema-Cache neu laden (Fix für PGRST204 im CI nach sessions-Erweiterung)
NOTIFY pgrst, 'reload schema';