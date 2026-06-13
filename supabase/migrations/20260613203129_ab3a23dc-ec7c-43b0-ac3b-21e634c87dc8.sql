-- B3-Modellkorrektur Teil B (Befund 2): Kanal-Kinds + Transfer-Richtungen.
--
-- 1. revenue_channels.kind als fester CHECK-Enum, NOT NULL.
--    Werte technisch-neutral (kein Anbietername), Anbieter ändern sich
--    (Beispiel "ordersmart" → "SOUSE"), label trägt den Anzeigenamen.
-- 2. register_transfer_direction um 'to_safe' + 'to_other' erweitern;
--    'from_restaurant' bleibt als Legacy-Wert (gleiche Semantik wie
--    'to_safe' / 'to_other' = outflow), kein Drop nötig.
--
-- Bestandsdaten: B3 ist noch nicht produktiv; bestehende Test-/Seed-
-- Zeilen werden auf 'pos' gebackfillt, danach wird der DEFAULT entfernt,
-- damit neue Inserts den Kind explizit setzen müssen.

-- 1a. Spalte mit DEFAULT anlegen (Backfill atomar).
ALTER TABLE public.revenue_channels
  ADD COLUMN kind text;

UPDATE public.revenue_channels SET kind = 'pos' WHERE kind IS NULL;

-- 1b. CHECK + NOT NULL festziehen.
ALTER TABLE public.revenue_channels
  ALTER COLUMN kind SET NOT NULL,
  ADD CONSTRAINT revenue_channels_kind_check CHECK (kind IN (
    'pos',
    'delivery_souse',
    'delivery_wolt',
    'voucher_sold',
    'voucher_redeemed',
    'finedine',
    'einladung',
    'sonstige'
  ));

-- 1c. Unique (organization_id, location_id, kind) — pro Location genau
-- eine Zeile je Kind (Seeding-Invariante laut Plan B3-Modellkorrektur).
CREATE UNIQUE INDEX revenue_channels_org_location_kind_uniq
  ON public.revenue_channels (organization_id, location_id, kind);

-- 2. Neue Transfer-Richtungen.
ALTER TYPE public.register_transfer_direction ADD VALUE IF NOT EXISTS 'to_safe';
ALTER TYPE public.register_transfer_direction ADD VALUE IF NOT EXISTS 'to_other';
