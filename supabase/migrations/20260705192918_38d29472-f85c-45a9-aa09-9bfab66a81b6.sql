ALTER TABLE public.time_entries
  ADD COLUMN department public.staff_department NULL;

COMMENT ON COLUMN public.time_entries.department IS
  'Z3: Abteilungs-Kontext des Eintrags. NULL = unbestimmt (Stempel/Batch/Pool) → Anzeige auf der Primär-Abteilung.';

CREATE INDEX time_entries_department_idx
  ON public.time_entries (staff_id, business_date, department);