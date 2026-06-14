ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS vectron_daily_total_cents bigint NOT NULL DEFAULT 0;

ALTER TABLE public.sessions
  ADD COLUMN IF NOT EXISTS cash_actual_cents bigint NULL;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS cash_balance_target_cents bigint NOT NULL DEFAULT 200000;

ALTER TABLE public.organizations
  ADD COLUMN IF NOT EXISTS opening_safe_balance_cents bigint NOT NULL DEFAULT 200000;