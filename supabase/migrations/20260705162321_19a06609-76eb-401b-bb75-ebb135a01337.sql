-- EKZ1: EK-Zuordnungs-Werkbank — Verknüpfung sales_articles→articles
-- speichert Portions-/Gebinde-ml als Quelle der Wahrheit; ek_price_cents
-- bleibt bewusst materialisierter Cache (analog Pool-Snapshots).
ALTER TABLE public.sales_articles
  ADD COLUMN IF NOT EXISTS ek_source_article_id uuid
    REFERENCES public.articles(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS ek_portion_ml        integer
    CHECK (ek_portion_ml IS NULL OR ek_portion_ml > 0),
  ADD COLUMN IF NOT EXISTS ek_source_volume_ml  integer
    CHECK (ek_source_volume_ml IS NULL OR ek_source_volume_ml > 0),
  ADD COLUMN IF NOT EXISTS ek_match_ignored     boolean NOT NULL DEFAULT false;

-- Konsistenz: entweder beide ml-Felder gesetzt (Portion aus Gebinde) oder
-- beide NULL (1:1 Flasche / manueller EK ohne Verknüpfung). Nie nur eins.
ALTER TABLE public.sales_articles
  DROP CONSTRAINT IF EXISTS sales_articles_ek_ml_both_or_none;
ALTER TABLE public.sales_articles
  ADD CONSTRAINT sales_articles_ek_ml_both_or_none CHECK (
    (ek_portion_ml IS NULL AND ek_source_volume_ml IS NULL)
    OR (ek_portion_ml IS NOT NULL AND ek_source_volume_ml IS NOT NULL)
  );

-- Portion darf nie größer als das Gebinde sein.
ALTER TABLE public.sales_articles
  DROP CONSTRAINT IF EXISTS sales_articles_ek_portion_le_source;
ALTER TABLE public.sales_articles
  ADD CONSTRAINT sales_articles_ek_portion_le_source CHECK (
    ek_portion_ml IS NULL
    OR ek_source_volume_ml IS NULL
    OR ek_portion_ml <= ek_source_volume_ml
  );

-- Ignorieren + Verknüpfung schließen sich aus (Aufschlag/Hausmix bis Rezept-Welle).
ALTER TABLE public.sales_articles
  DROP CONSTRAINT IF EXISTS sales_articles_ek_ignore_or_link;
ALTER TABLE public.sales_articles
  ADD CONSTRAINT sales_articles_ek_ignore_or_link CHECK (
    ek_match_ignored = false OR ek_source_article_id IS NULL
  );

-- Index für Recalc-Sweep über verknüpfte Artikel.
CREATE INDEX IF NOT EXISTS sales_articles_ek_source_article_id_idx
  ON public.sales_articles(ek_source_article_id)
  WHERE ek_source_article_id IS NOT NULL;