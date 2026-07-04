ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS commission_enabled boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS commission_min_revenue_cents bigint NOT NULL DEFAULT 120000,
  ADD COLUMN IF NOT EXISTS commission_pct numeric(5,2) NOT NULL DEFAULT 5.00;

ALTER TABLE public.locations
  ADD CONSTRAINT locations_commission_min_revenue_nonneg
    CHECK (commission_min_revenue_cents >= 0),
  ADD CONSTRAINT locations_commission_pct_range
    CHECK (commission_pct >= 0 AND commission_pct <= 100);

COMMENT ON COLUMN public.locations.commission_enabled IS
  'Provision: Feature pro Standort an/aus (Default AUS). Wird von der Server-Function als Kurzschluss vor jeder Berechnung geprueft.';
COMMENT ON COLUMN public.locations.commission_min_revenue_cents IS
  'Provision: Mindestumsatz je Kellner/Tag in Cents (Legacy-Default 1.200 EUR = 120000).';
COMMENT ON COLUMN public.locations.commission_pct IS
  'Provision: Satz in Prozent auf den Umsatz oberhalb der Schwelle (Legacy-Default 5,00).';