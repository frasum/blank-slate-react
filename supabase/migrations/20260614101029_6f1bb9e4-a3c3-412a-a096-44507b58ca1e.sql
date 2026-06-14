ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS perso_nr integer,
  ADD COLUMN IF NOT EXISTS contracted_hours_per_month numeric;