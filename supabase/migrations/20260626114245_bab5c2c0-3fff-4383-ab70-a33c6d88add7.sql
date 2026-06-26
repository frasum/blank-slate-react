ALTER TABLE public.staff_personal_details
ADD COLUMN IF NOT EXISTS soll_hours_per_day numeric NOT NULL DEFAULT 8
CHECK (soll_hours_per_day > 0 AND soll_hours_per_day <= 24);