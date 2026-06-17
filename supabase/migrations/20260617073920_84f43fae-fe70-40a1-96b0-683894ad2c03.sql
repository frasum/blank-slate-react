ALTER TABLE public.waiter_settlements
  ADD COLUMN IF NOT EXISTS second_waiter_name text,
  ADD COLUMN IF NOT EXISTS additional_waiters jsonb NOT NULL DEFAULT '[]'::jsonb;