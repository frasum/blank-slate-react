-- Telegram-Verknüpfung pro Mitarbeiter (Variante B).
CREATE TABLE public.staff_telegram_links (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id uuid NOT NULL UNIQUE REFERENCES public.staff(id) ON DELETE CASCADE,
  telegram_chat_id bigint,
  telegram_username text,
  link_token text NOT NULL UNIQUE,
  token_expires_at timestamptz,
  linked_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_staff_telegram_links_org ON public.staff_telegram_links(organization_id);
CREATE INDEX idx_staff_telegram_links_chat ON public.staff_telegram_links(telegram_chat_id);

GRANT SELECT, DELETE ON public.staff_telegram_links TO authenticated;
GRANT ALL ON public.staff_telegram_links TO service_role;

ALTER TABLE public.staff_telegram_links ENABLE ROW LEVEL SECURITY;

-- Staff darf eigene Zeile sehen.
CREATE POLICY "staff read own telegram link"
  ON public.staff_telegram_links FOR SELECT
  TO authenticated
  USING (staff_id = public.current_staff_id());

-- Staff darf eigene Zeile löschen (Trennen).
CREATE POLICY "staff delete own telegram link"
  ON public.staff_telegram_links FOR DELETE
  TO authenticated
  USING (staff_id = public.current_staff_id());

-- Admin darf alle Zeilen sehen und löschen.
CREATE POLICY "admin read all telegram links"
  ON public.staff_telegram_links FOR SELECT
  TO authenticated
  USING (public.is_admin());

CREATE POLICY "admin delete all telegram links"
  ON public.staff_telegram_links FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- INSERT/UPDATE bleibt ausschließlich der service_role überlassen (Server-Funktion/Webhook).

-- Bot-Username pro Organisation (für Deep-Link https://t.me/<name>?start=<token>).
ALTER TABLE public.organization_settings
  ADD COLUMN IF NOT EXISTS telegram_bot_username text;