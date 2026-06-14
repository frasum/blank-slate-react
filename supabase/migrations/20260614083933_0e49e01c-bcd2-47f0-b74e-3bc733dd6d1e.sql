-- Teil X: Skills-Schema für Stammdaten-Übernahme aus tagesabrechnung.
-- Idempotent. RLS + GRANTs nach Projektstandard. DENY-ALL Client-Writes.

-- =========================================================================
-- 1) skill_category Enum
-- =========================================================================
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'skill_category') THEN
    CREATE TYPE public.skill_category AS ENUM ('kitchen', 'service', 'gl', 'other');
  END IF;
END$$;

-- =========================================================================
-- 2) skills
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.skills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name            text NOT NULL,
  category        public.skill_category NOT NULL,
  color           text,
  sort_order      integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS skills_org_idx ON public.skills (organization_id);

GRANT SELECT ON public.skills TO authenticated;
GRANT ALL    ON public.skills TO service_role;

ALTER TABLE public.skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS skills_select_org ON public.skills;
CREATE POLICY skills_select_org ON public.skills
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());

DROP TRIGGER IF EXISTS tg_skills_updated_at ON public.skills;
CREATE TRIGGER tg_skills_updated_at
  BEFORE UPDATE ON public.skills
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- 3) staff_skills
-- =========================================================================
CREATE TABLE IF NOT EXISTS public.staff_skills (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id        uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  skill_id        uuid NOT NULL REFERENCES public.skills(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, skill_id)
);

CREATE INDEX IF NOT EXISTS staff_skills_org_idx   ON public.staff_skills (organization_id);
CREATE INDEX IF NOT EXISTS staff_skills_staff_idx ON public.staff_skills (staff_id);
CREATE INDEX IF NOT EXISTS staff_skills_skill_idx ON public.staff_skills (skill_id);

GRANT SELECT ON public.staff_skills TO authenticated;
GRANT ALL    ON public.staff_skills TO service_role;

ALTER TABLE public.staff_skills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS staff_skills_select_org ON public.staff_skills;
CREATE POLICY staff_skills_select_org ON public.staff_skills
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());

DROP TRIGGER IF EXISTS tg_staff_skills_updated_at ON public.staff_skills;
CREATE TRIGGER tg_staff_skills_updated_at
  BEFORE UPDATE ON public.staff_skills
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- =========================================================================
-- 4) Seed-Funktion + Trigger für neue Organisationen
-- =========================================================================
CREATE OR REPLACE FUNCTION public.tg_organizations_seed_skills()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public'
AS $$
BEGIN
  INSERT INTO public.skills (organization_id, name, category, sort_order) VALUES
    (NEW.id, 'VS',         'kitchen', 10),
    (NEW.id, 'PASS',       'kitchen', 20),
    (NEW.id, 'SPÜLEN',     'kitchen', 30),
    (NEW.id, 'CO',         'kitchen', 40),
    (NEW.id, 'SERVICE',    'service', 50),
    (NEW.id, 'BAR',        'service', 60),
    (NEW.id, 'GL',         'gl',      70),
    (NEW.id, 'Hausmeister','other',   80)
  ON CONFLICT (organization_id, name) DO NOTHING;
  RETURN NEW;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.tg_organizations_seed_skills() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.tg_organizations_seed_skills() FROM anon;
REVOKE EXECUTE ON FUNCTION public.tg_organizations_seed_skills() FROM authenticated;

DROP TRIGGER IF EXISTS tg_organizations_seed_skills ON public.organizations;
CREATE TRIGGER tg_organizations_seed_skills
  AFTER INSERT ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.tg_organizations_seed_skills();

-- =========================================================================
-- 5) Backfill für bestehende Organisationen
-- =========================================================================
INSERT INTO public.skills (organization_id, name, category, sort_order)
SELECT o.id, v.name, v.category::public.skill_category, v.sort_order
FROM public.organizations o
CROSS JOIN (VALUES
  ('VS',         'kitchen', 10),
  ('PASS',       'kitchen', 20),
  ('SPÜLEN',     'kitchen', 30),
  ('CO',         'kitchen', 40),
  ('SERVICE',    'service', 50),
  ('BAR',        'service', 60),
  ('GL',         'gl',      70),
  ('Hausmeister','other',   80)
) AS v(name, category, sort_order)
ON CONFLICT (organization_id, name) DO NOTHING;
