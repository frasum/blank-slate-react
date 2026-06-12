-- Phase B1b: Auth-Infrastruktur (siehe docs/gruendungsdokument.md §4.2)
-- Enthält NUR: access_tokens, staff_pins, pin_attempts und das token_type-Enum.
-- KEINE Edge Functions, KEINE Auth-Flow-Logik, KEINE Seeds — diese Migration
-- ist reine Datenstruktur.
--
-- Sicherheitsmodell ("staff_pins-Muster"):
--   * RLS ist auf allen drei Tabellen aktiviert.
--   * Es gibt KEINE Policies für die Rollen authenticated oder anon.
--     Damit kann WEDER ein eingeloggter Endnutzer noch ein anonymer
--     Aufruf irgendetwas lesen oder schreiben. Validierung läuft
--     ausschließlich serverseitig in TanStack-Server-Functions, die
--     supabaseAdmin (service_role) verwenden.
--   * Zur Absicherung in doppelter Tiefe geben wir auch keine Table-
--     GRANTs an authenticated/anon. Nur service_role bekommt Zugriff.

-- =========================================================================
-- 1. Enum token_type
--    Vorerst nur 'badge_login'. Weitere Werte (z.B. supplier_portal,
--    photo_capture) kommen mit den jeweiligen Modulen per ALTER TYPE.
-- =========================================================================
CREATE TYPE public.token_type AS ENUM ('badge_login');

-- =========================================================================
-- 2. access_tokens — das EINE Token-System
-- =========================================================================
CREATE TABLE public.access_tokens (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  token           text NOT NULL UNIQUE,
  token_type      public.token_type NOT NULL,
  staff_id        uuid REFERENCES public.staff(id) ON DELETE CASCADE,
  expires_at      timestamptz,
  used_at         timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX access_tokens_organization_id_idx ON public.access_tokens(organization_id);
CREATE INDEX access_tokens_staff_id_idx        ON public.access_tokens(staff_id);
CREATE INDEX access_tokens_type_active_idx
  ON public.access_tokens(token_type)
  WHERE used_at IS NULL;

-- KEINE GRANTs an authenticated/anon: Validierung läuft ausschließlich
-- serverseitig (supabaseAdmin / service_role).
GRANT ALL ON public.access_tokens TO service_role;
ALTER TABLE public.access_tokens ENABLE ROW LEVEL SECURITY;
-- Bewusst KEINE Policies für authenticated/anon (DENY ALL).

-- =========================================================================
-- 3. staff_pins — gehashter PIN pro Mitarbeiter (bcrypt)
-- =========================================================================
CREATE TABLE public.staff_pins (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id        uuid NOT NULL UNIQUE REFERENCES public.staff(id) ON DELETE CASCADE,
  pin_hash        text NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_pins_organization_id_idx ON public.staff_pins(organization_id);

GRANT ALL ON public.staff_pins TO service_role;
ALTER TABLE public.staff_pins ENABLE ROW LEVEL SECURITY;
-- Bewusst KEINE Policies für authenticated/anon (DENY ALL).

-- =========================================================================
-- 4. pin_attempts — append-only Log fehlgeschlagener PIN-Versuche
--    Wird in der Server-Function ausgewertet (max 5 Fehlversuche / 15 Min
--    pro staff). Append-only, kein Update/Delete im Normalbetrieb.
-- =========================================================================
CREATE TABLE public.pin_attempts (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id        uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  attempted_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX pin_attempts_staff_attempted_idx ON public.pin_attempts(staff_id, attempted_at DESC);
CREATE INDEX pin_attempts_organization_id_idx ON public.pin_attempts(organization_id);

GRANT ALL ON public.pin_attempts TO service_role;
ALTER TABLE public.pin_attempts ENABLE ROW LEVEL SECURITY;
-- Bewusst KEINE Policies für authenticated/anon (DENY ALL).