ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS batch_weekday_start time NOT NULL DEFAULT '17:00',
  ADD COLUMN IF NOT EXISTS batch_weekday_end   time NOT NULL DEFAULT '01:00',
  ADD COLUMN IF NOT EXISTS batch_sunhol_start  time NOT NULL DEFAULT '15:00',
  ADD COLUMN IF NOT EXISTS batch_sunhol_end    time NOT NULL DEFAULT '02:00';