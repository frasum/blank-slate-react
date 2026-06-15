-- Welle 3-A: Wein-Felder auf articles (additiv, nullable)
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS grape_variety      text,
  ADD COLUMN IF NOT EXISTS origin_country     text,
  ADD COLUMN IF NOT EXISTS food_pairings      text,
  ADD COLUMN IF NOT EXISTS special_attributes text[];

-- Welle 3-B: Wein-Quiz Leaderboard
CREATE TABLE IF NOT EXISTS public.wine_quiz_scores (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id    uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id           uuid REFERENCES public.staff(id) ON DELETE SET NULL,
  staff_name         text NOT NULL,
  score              integer NOT NULL DEFAULT 0,
  questions_answered integer NOT NULL DEFAULT 0,
  correct_answers    integer NOT NULL DEFAULT 0,
  level_reached      integer NOT NULL DEFAULT 0,
  played_at          timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS wine_quiz_scores_org_score_idx
  ON public.wine_quiz_scores (organization_id, score DESC);

GRANT SELECT, INSERT, DELETE ON public.wine_quiz_scores TO authenticated;
GRANT ALL ON public.wine_quiz_scores TO service_role;

ALTER TABLE public.wine_quiz_scores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "wqs_select_org" ON public.wine_quiz_scores;
CREATE POLICY "wqs_select_org" ON public.wine_quiz_scores
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS "wqs_insert_org" ON public.wine_quiz_scores;
CREATE POLICY "wqs_insert_org" ON public.wine_quiz_scores
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_organization_id());

DROP POLICY IF EXISTS "wqs_delete_admin" ON public.wine_quiz_scores;
CREATE POLICY "wqs_delete_admin" ON public.wine_quiz_scores
  FOR DELETE TO authenticated
  USING (organization_id = public.current_organization_id() AND public.is_admin());