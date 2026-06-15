ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS guest_count integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vouchers_sold_cents integer NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS vouchers_redeemed_cents integer NOT NULL DEFAULT 0;

ALTER TABLE public.sessions
  ADD CONSTRAINT sessions_guest_count_nonneg CHECK (guest_count >= 0),
  ADD CONSTRAINT sessions_vouchers_sold_nonneg CHECK (vouchers_sold_cents >= 0),
  ADD CONSTRAINT sessions_vouchers_redeemed_nonneg CHECK (vouchers_redeemed_cents >= 0);