ALTER TABLE public.staff_personal_details
  ADD COLUMN IF NOT EXISTS kk_zusatzbeitrag numeric,
  ADD COLUMN IF NOT EXISTS children_count integer,
  ADD COLUMN IF NOT EXISTS has_parent_status boolean;