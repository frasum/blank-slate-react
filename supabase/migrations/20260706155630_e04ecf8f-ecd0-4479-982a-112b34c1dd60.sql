-- Rollen-Defaults: admin + manager erhalten recipes.manage automatisch.
INSERT INTO public.permission_role_defaults (role, permission) VALUES
  ('admin'::public.app_role, 'recipes.manage'::public.app_permission),
  ('manager'::public.app_role, 'recipes.manage'::public.app_permission)
ON CONFLICT DO NOTHING;

-- A) Inhalt je Inventureinheit auf Einkaufsartikeln
ALTER TABLE public.articles
  ADD COLUMN content_quantity numeric(12,3),
  ADD COLUMN content_unit text,
  ADD CONSTRAINT articles_content_unit_chk
    CHECK (content_unit IS NULL OR content_unit IN ('g','ml','stk')),
  ADD CONSTRAINT articles_content_pair_chk
    CHECK ((content_quantity IS NULL) = (content_unit IS NULL)),
  ADD CONSTRAINT articles_content_qty_chk
    CHECK (content_quantity IS NULL OR content_quantity > 0);

-- B) Rezepte
CREATE TABLE public.recipes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id),
  name text NOT NULL,
  kind text NOT NULL CHECK (kind IN ('dish','sub')),
  yield_quantity numeric(12,3) CHECK (yield_quantity IS NULL OR yield_quantity > 0),
  yield_unit text CHECK (yield_unit IS NULL OR yield_unit IN ('g','ml','stk')),
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT recipes_yield_chk
    CHECK ((kind = 'sub') = (yield_quantity IS NOT NULL AND yield_unit IS NOT NULL))
);
CREATE UNIQUE INDEX recipes_org_name_uq ON public.recipes (organization_id, lower(name));
CREATE INDEX recipes_org_kind_idx ON public.recipes (organization_id, kind);

REVOKE ALL ON public.recipes FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.recipes TO service_role;
ALTER TABLE public.recipes ENABLE ROW LEVEL SECURITY;

CREATE TRIGGER recipes_set_updated_at
  BEFORE UPDATE ON public.recipes
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- C) Rezept-Zutaten
CREATE TABLE public.recipe_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  recipe_id uuid NOT NULL REFERENCES public.recipes(id) ON DELETE CASCADE,
  position int NOT NULL DEFAULT 0,
  article_id uuid REFERENCES public.articles(id) ON DELETE RESTRICT,
  sub_recipe_id uuid REFERENCES public.recipes(id) ON DELETE RESTRICT,
  quantity numeric(12,3) NOT NULL CHECK (quantity > 0),
  unit text NOT NULL CHECK (unit IN ('g','ml','stk')),
  loss_percent numeric(5,2) NOT NULL DEFAULT 0 CHECK (loss_percent >= 0 AND loss_percent <= 90),
  CONSTRAINT recipe_items_source_xor CHECK ((article_id IS NULL) <> (sub_recipe_id IS NULL)),
  CONSTRAINT recipe_items_no_self CHECK (sub_recipe_id IS DISTINCT FROM recipe_id)
);
CREATE INDEX recipe_items_recipe_idx ON public.recipe_items (recipe_id, position);
CREATE INDEX recipe_items_article_idx ON public.recipe_items (article_id) WHERE article_id IS NOT NULL;
CREATE INDEX recipe_items_sub_idx ON public.recipe_items (sub_recipe_id) WHERE sub_recipe_id IS NOT NULL;

REVOKE ALL ON public.recipe_items FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.recipe_items TO service_role;
ALTER TABLE public.recipe_items ENABLE ROW LEVEL SECURITY;

-- D) Verkaufsartikel-Anschluss: dritte EK-Herkunft
ALTER TABLE public.sales_articles
  ADD COLUMN recipe_id uuid REFERENCES public.recipes(id) ON DELETE RESTRICT;

-- Nicht gleichzeitig 1:1-Link UND Rezept.
ALTER TABLE public.sales_articles
  ADD CONSTRAINT sales_articles_ek_source_xor
    CHECK (NOT (ek_source_article_id IS NOT NULL AND recipe_id IS NOT NULL));

-- Bestehenden Ignoriert-Guard erweitern: ignoriert schließt jetzt auch recipe_id aus.
-- Alt: (ek_match_ignored = false) OR (ek_source_article_id IS NULL)
-- Neu: (ek_match_ignored = false) OR (ek_source_article_id IS NULL AND recipe_id IS NULL)
ALTER TABLE public.sales_articles DROP CONSTRAINT sales_articles_ek_ignore_or_link;
ALTER TABLE public.sales_articles
  ADD CONSTRAINT sales_articles_ek_ignore_or_link
    CHECK (ek_match_ignored = false OR (ek_source_article_id IS NULL AND recipe_id IS NULL));

CREATE INDEX sales_articles_recipe_idx ON public.sales_articles (recipe_id) WHERE recipe_id IS NOT NULL;