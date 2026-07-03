-- Design-Entwurf F4a (Welle: Jahresabschluss / Bilanzbericht).
-- Diese Datei ist BEWUSST keine ausführbare Supabase-Migration und liegt
-- nicht unter supabase/migrations/. Sie beschreibt Schema + RLS + RPC für
-- die Tabellen bilanz_positions / bilanz_konten, damit Frank die finale
-- Migration selbst anlegen kann (Muster: 20260703073048 für bwa_monthly).
--
-- Regeln:
--   * organization_id + entity + fiscal_year in allen Zeilen; kein
--     Kostenstellen-Konzept (Jahresabschluss ist entity-weit).
--   * Geld in BIGINT cents (Ehrlichkeitsregel Modul-Guardrails).
--   * Keine Client-Schreib-Policies; Schreiben ausschliesslich per
--     service_role (Server-Functions in src/lib/bwa/bilanz.functions.ts).
--   * Atomarer Jahres-Austausch nur via SECURITY-DEFINER-RPC
--     replace_bilanz_year, EXECUTE nur an service_role.

CREATE TABLE IF NOT EXISTS public.bilanz_positions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  entity text NOT NULL,
  fiscal_year int NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2100),
  statement text NOT NULL CHECK (statement IN ('aktiva','passiva','guv')),
  code text NOT NULL,
  parent_code text,
  label text NOT NULL,
  level int NOT NULL CHECK (level BETWEEN 0 AND 3),
  sort_order int NOT NULL,
  betrag_cents bigint NOT NULL,
  vorjahr_cents bigint,
  source text NOT NULL DEFAULT 'pdf' CHECK (source IN ('pdf','manual')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bilanz_positions_unique
    UNIQUE (organization_id, entity, fiscal_year, statement, code)
);

CREATE TABLE IF NOT EXISTS public.bilanz_konten (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  entity text NOT NULL,
  fiscal_year int NOT NULL CHECK (fiscal_year BETWEEN 2000 AND 2100),
  statement text NOT NULL CHECK (statement IN ('aktiva','passiva','guv')),
  position_code text NOT NULL,
  konto_nr text NOT NULL,
  label text NOT NULL,
  betrag_cents bigint NOT NULL,
  vorjahr_cents bigint,
  sort_order int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT bilanz_konten_unique
    UNIQUE (organization_id, entity, fiscal_year, statement, konto_nr)
);

GRANT SELECT ON public.bilanz_positions TO authenticated;
GRANT ALL    ON public.bilanz_positions TO service_role;
GRANT SELECT ON public.bilanz_konten    TO authenticated;
GRANT ALL    ON public.bilanz_konten    TO service_role;

ALTER TABLE public.bilanz_positions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.bilanz_konten    ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bilanz_positions_select ON public.bilanz_positions;
CREATE POLICY bilanz_positions_select ON public.bilanz_positions
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('admin'));

DROP POLICY IF EXISTS bilanz_konten_select ON public.bilanz_konten;
CREATE POLICY bilanz_konten_select ON public.bilanz_konten
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('admin'));

DROP TRIGGER IF EXISTS trg_bilanz_positions_updated_at ON public.bilanz_positions;
CREATE TRIGGER trg_bilanz_positions_updated_at
  BEFORE UPDATE ON public.bilanz_positions
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

CREATE INDEX IF NOT EXISTS bilanz_positions_org_entity_year_idx
  ON public.bilanz_positions (organization_id, entity, fiscal_year);
CREATE INDEX IF NOT EXISTS bilanz_konten_org_entity_year_idx
  ON public.bilanz_konten (organization_id, entity, fiscal_year);

-- Atomarer Austausch (delete + bulk-insert beider Tabellen in EINER Tx).
-- Muster: create_order_from_cart in bestehendem Schema.
CREATE OR REPLACE FUNCTION public.replace_bilanz_year(
  p_organization_id uuid,
  p_entity          text,
  p_fiscal_year     int,
  p_positions       jsonb,   -- Array<{code,parent_code,label,level,sort_order,statement,betrag_cents,vorjahr_cents,source}>
  p_konten          jsonb    -- Array<{statement,position_code,konto_nr,label,betrag_cents,vorjahr_cents,sort_order}>
) RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = ''
AS $$
BEGIN
  DELETE FROM public.bilanz_konten
   WHERE organization_id = p_organization_id
     AND entity = p_entity
     AND fiscal_year = p_fiscal_year;
  DELETE FROM public.bilanz_positions
   WHERE organization_id = p_organization_id
     AND entity = p_entity
     AND fiscal_year = p_fiscal_year;

  INSERT INTO public.bilanz_positions
    (organization_id, entity, fiscal_year, statement, code, parent_code,
     label, level, sort_order, betrag_cents, vorjahr_cents, source)
  SELECT p_organization_id, p_entity, p_fiscal_year,
         (e->>'statement'),
         (e->>'code'),
         NULLIF(e->>'parent_code',''),
         (e->>'label'),
         (e->>'level')::int,
         (e->>'sort_order')::int,
         (e->>'betrag_cents')::bigint,
         NULLIF(e->>'vorjahr_cents','')::bigint,
         COALESCE(NULLIF(e->>'source',''), 'pdf')
    FROM jsonb_array_elements(p_positions) AS e;

  INSERT INTO public.bilanz_konten
    (organization_id, entity, fiscal_year, statement, position_code,
     konto_nr, label, betrag_cents, vorjahr_cents, sort_order)
  SELECT p_organization_id, p_entity, p_fiscal_year,
         (e->>'statement'),
         (e->>'position_code'),
         (e->>'konto_nr'),
         (e->>'label'),
         (e->>'betrag_cents')::bigint,
         NULLIF(e->>'vorjahr_cents','')::bigint,
         (e->>'sort_order')::int
    FROM jsonb_array_elements(p_konten) AS e;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_bilanz_year(uuid,text,int,jsonb,jsonb) FROM public;
REVOKE ALL ON FUNCTION public.replace_bilanz_year(uuid,text,int,jsonb,jsonb) FROM anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.replace_bilanz_year(uuid,text,int,jsonb,jsonb) TO service_role;