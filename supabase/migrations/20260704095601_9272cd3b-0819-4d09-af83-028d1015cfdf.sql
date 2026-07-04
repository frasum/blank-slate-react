ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS telegram_report_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS telegram_report_hour smallint NOT NULL DEFAULT 7,
  ADD COLUMN IF NOT EXISTS telegram_report_flags jsonb NOT NULL DEFAULT '{"umsatz":true,"gaeste":true,"kontrolle":true,"kellner":true,"kueche":true,"notizen":true,"excludedLocationIds":[]}'::jsonb,
  ADD COLUMN IF NOT EXISTS telegram_report_last_sent date;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.check_constraints
    WHERE constraint_schema = 'public'
      AND constraint_name = 'organization_settings_telegram_report_hour_check'
  ) THEN
    ALTER TABLE public.organization_settings
      ADD CONSTRAINT organization_settings_telegram_report_hour_check
      CHECK (telegram_report_hour BETWEEN 0 AND 23);
  END IF;
END $$;

ALTER TABLE public.staff_telegram_links
  ADD COLUMN IF NOT EXISTS receives_daily_report boolean NOT NULL DEFAULT false;