ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS tip_pool_min_hours numeric(4,2) NOT NULL DEFAULT 2.50;

COMMENT ON COLUMN public.organization_settings.tip_pool_min_hours IS
  'Mindeststunden pro Geschäftstag (Tagessumme), damit ein Mitarbeiter am Trinkgeldpool teilnimmt. Exklusive Grenze: hours >= min_hours nimmt teil.';
