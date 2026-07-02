-- Sicherstellen, dass pro Standort und Geschäftstag höchstens EINE offene Session existiert.
-- Partial Unique Index: greift nur für Zeilen mit status='open'; geschlossene/locked Sessions
-- der Vergangenheit bleiben davon unberührt.
CREATE UNIQUE INDEX IF NOT EXISTS sessions_one_open_per_location
  ON public.sessions (organization_id, location_id, business_date)
  WHERE status = 'open';