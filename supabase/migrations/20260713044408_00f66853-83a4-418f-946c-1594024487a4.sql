ALTER TABLE public.pin_attempts ADD COLUMN IF NOT EXISTS ip text;
CREATE INDEX IF NOT EXISTS pin_attempts_ip_attempted_idx
  ON public.pin_attempts (ip, attempted_at DESC)
  WHERE ip IS NOT NULL;