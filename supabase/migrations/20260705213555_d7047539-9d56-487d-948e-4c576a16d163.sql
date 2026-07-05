ALTER TABLE public.display_reminders
  ADD COLUMN until_time time NOT NULL DEFAULT '01:00';

COMMENT ON COLUMN public.display_reminders.until_time IS
  'DP1b: Ende der Anzeige. until_time <= from_time bedeutet: über Mitternacht in den frühen Morgen desselben GESCHÄFTSTAGS (max. 03:00-Cutoff).';