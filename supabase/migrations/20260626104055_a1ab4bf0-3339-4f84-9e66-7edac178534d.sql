ALTER TABLE staff_personal_details
  ADD COLUMN IF NOT EXISTS meal_allowance boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS sachbezug_monthly_cents integer NOT NULL DEFAULT 0
    CHECK (sachbezug_monthly_cents >= 0);