-- VA1: Tabelle für POS-Verkaufsartikel je Standort (Vectron-Basis).
-- DENY-ALL: keine Policies; Zugriff ausschließlich über Server-Functions
-- (loadAdminCaller("manager") + supabaseAdmin). Full-Unique auf
-- (location_id, name) als Idempotenz-Anker für Frank's Import-SQL.

CREATE TABLE public.sales_articles (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id      uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  location_id          uuid NOT NULL REFERENCES public.locations(id),
  name                 text NOT NULL,
  product_group        int,
  price_cents          bigint CHECK (price_cents IS NULL OR price_cents >= 0),
  takeaway_price_cents bigint CHECK (takeaway_price_cents IS NULL OR takeaway_price_cents >= 0),
  is_active            boolean NOT NULL DEFAULT true,
  created_at           timestamptz NOT NULL DEFAULT now(),
  updated_at           timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX sales_articles_location_name_unique
  ON public.sales_articles (location_id, name);

CREATE INDEX sales_articles_org_location_idx
  ON public.sales_articles (organization_id, location_id);

-- Zugriff nur über service_role (Server-Functions mit supabaseAdmin).
-- Kein GRANT für anon/authenticated → DENY-ALL für die Data-API.
GRANT ALL ON public.sales_articles TO service_role;

ALTER TABLE public.sales_articles ENABLE ROW LEVEL SECURITY;
-- Bewusst keine Policies: DENY-ALL für alle Nicht-service_role-Rollen.

-- updated_at automatisch aktualisieren (bestehender Trigger-Helper).
CREATE TRIGGER trg_sales_articles_updated_at
  BEFORE UPDATE ON public.sales_articles
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();