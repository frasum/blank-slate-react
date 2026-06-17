-- Teil A — Login-Umbau: Erst-Login mit Standardpasswort, Zwangswechsel.
-- Badge bleibt als Tabelle erhalten (Audit), wird aber nicht mehr verwendet.

ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS must_change_password boolean NOT NULL DEFAULT true;

-- Backfill: bestehende Mitarbeiter mit verknüpftem Auth-User gelten als
-- "Passwort bereits selbst gesetzt" → kein Zwangswechsel.
UPDATE public.staff s
SET must_change_password = false
WHERE EXISTS (
  SELECT 1 FROM public.user_links ul
  WHERE ul.staff_id = s.id
    AND ul.organization_id = s.organization_id
);

COMMENT ON COLUMN public.staff.must_change_password IS
  'true = Mitarbeiter muss beim nächsten Login ein neues Passwort setzen (Standardpasswort wurde vom Admin vergeben).';
