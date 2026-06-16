ALTER TABLE public.staff
  ADD COLUMN IF NOT EXISTS can_easyorder_auto_send boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.staff.can_easyorder_auto_send IS
  'Wenn true, löst EasyOrder beim Absenden direkt den Mailversand an den Lieferanten aus. Sonst bleibt die Bestellung pending und muss vom Admin manuell versendet werden.';