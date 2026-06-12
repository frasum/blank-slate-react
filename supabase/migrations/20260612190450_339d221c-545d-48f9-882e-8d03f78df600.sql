-- Phase B1a: Identitätskern (siehe docs/gruendungsdokument.md §4.2)
-- Diese Migration enthält NUR: Schema des Identitätskerns + Helper + echte Policies.
-- NICHT enthalten (kommt in B1b): access_tokens, Edge Functions, Auth-Flüsse, Seeds, UI.

-- =========================================================================
-- 1. Enum app_role
-- =========================================================================
CREATE TYPE public.app_role AS ENUM ('admin', 'manager', 'staff');

-- =========================================================================
-- 2. Tabellen (alle mit organization_id; RLS wird per Event-Trigger
--    rls_auto_enable automatisch aktiviert, wir setzen es zusätzlich explizit.)
-- =========================================================================

-- staff: Mitarbeiter-Stammdaten
CREATE TABLE public.staff (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  first_name      text NOT NULL,
  last_name       text NOT NULL,
  display_name    text NOT NULL,
  email           text,
  phone           text,
  is_active       boolean NOT NULL DEFAULT true,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_organization_id_idx ON public.staff(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff TO authenticated;
GRANT ALL ON public.staff TO service_role;
ALTER TABLE public.staff ENABLE ROW LEVEL SECURITY;

-- staff_locations: n:m staff <-> location
CREATE TABLE public.staff_locations (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id        uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  location_id     uuid NOT NULL REFERENCES public.locations(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, location_id)
);
CREATE INDEX staff_locations_organization_id_idx ON public.staff_locations(organization_id);
CREATE INDEX staff_locations_staff_id_idx        ON public.staff_locations(staff_id);
CREATE INDEX staff_locations_location_id_idx     ON public.staff_locations(location_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_locations TO authenticated;
GRANT ALL ON public.staff_locations TO service_role;
ALTER TABLE public.staff_locations ENABLE ROW LEVEL SECURITY;

-- staff_compensation: Vergütung BEWUSST in separater Tabelle (§4.2)
CREATE TABLE public.staff_compensation (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id        uuid NOT NULL UNIQUE REFERENCES public.staff(id) ON DELETE CASCADE,
  hourly_rate     numeric(10,2) NOT NULL,
  valid_from      date NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX staff_compensation_organization_id_idx ON public.staff_compensation(organization_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.staff_compensation TO authenticated;
GRANT ALL ON public.staff_compensation TO service_role;
ALTER TABLE public.staff_compensation ENABLE ROW LEVEL SECURITY;

-- user_links: Verknüpfung auth.users <-> staff
CREATE TABLE public.user_links (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id         uuid NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  staff_id        uuid NOT NULL UNIQUE REFERENCES public.staff(id) ON DELETE CASCADE,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX user_links_organization_id_idx ON public.user_links(organization_id);
CREATE INDEX user_links_staff_id_idx        ON public.user_links(staff_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_links TO authenticated;
GRANT ALL ON public.user_links TO service_role;
ALTER TABLE public.user_links ENABLE ROW LEVEL SECURITY;

-- role_assignments: Rolle pro staff+organization
CREATE TABLE public.role_assignments (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id        uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  role            public.app_role NOT NULL,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE (staff_id, organization_id)
);
CREATE INDEX role_assignments_organization_id_idx ON public.role_assignments(organization_id);
CREATE INDEX role_assignments_staff_id_idx        ON public.role_assignments(staff_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.role_assignments TO authenticated;
GRANT ALL ON public.role_assignments TO service_role;
ALTER TABLE public.role_assignments ENABLE ROW LEVEL SECURITY;

-- =========================================================================
-- 3. Helper-Funktionen
--    SECURITY DEFINER, weil sie RLS-geschützte Tabellen (user_links,
--    role_assignments) lesen müssen und in Policies eben dieser Tabellen
--    verwendet werden (Vermeidung von Rekursion). Vermerk aus der INVOKER-
--    Migration von current_business_date(): SECURITY DEFINER ist hier
--    zwingend, weil Tabellenzugriff stattfindet.
-- =========================================================================

CREATE OR REPLACE FUNCTION public.current_staff_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT staff_id
  FROM public.user_links
  WHERE user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.current_staff_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_staff_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_organization_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT organization_id
  FROM public.user_links
  WHERE user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.current_organization_id() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_organization_id() TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.current_role()
RETURNS public.app_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT ra.role
  FROM public.role_assignments ra
  JOIN public.user_links ul
    ON ul.staff_id = ra.staff_id
   AND ul.organization_id = ra.organization_id
  WHERE ul.user_id = auth.uid()
$$;
REVOKE ALL ON FUNCTION public.current_role() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.current_role() TO authenticated, service_role;

-- has_min_permission: EXPLIZITES Rang-Mapping (nicht über Enum-Reihenfolge),
-- damit Umsortierung der Enum-Werte die Semantik nicht versehentlich kippt.
-- Rang: admin > manager > staff.
CREATE OR REPLACE FUNCTION public.has_min_permission(_min public.app_role)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT COALESCE(
    (CASE public.current_role()
       WHEN 'admin'   THEN 3
       WHEN 'manager' THEN 2
       WHEN 'staff'   THEN 1
     END)
    >=
    (CASE _min
       WHEN 'admin'   THEN 3
       WHEN 'manager' THEN 2
       WHEN 'staff'   THEN 1
     END),
    false
  )
$$;
REVOKE ALL ON FUNCTION public.has_min_permission(public.app_role) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.has_min_permission(public.app_role) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT public.current_role() = 'admin'::public.app_role
$$;
REVOKE ALL ON FUNCTION public.is_admin() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.is_admin() TO authenticated, service_role;

-- =========================================================================
-- 4. Policies
-- =========================================================================

-- 4.1 organizations: B0-Platzhalter ersetzen
DROP POLICY IF EXISTS b0_placeholder_deny_all ON public.organizations;

CREATE POLICY org_select_members ON public.organizations
  FOR SELECT TO authenticated
  USING (id = public.current_organization_id());

CREATE POLICY org_insert_admin ON public.organizations
  FOR INSERT TO authenticated
  WITH CHECK (public.is_admin());

CREATE POLICY org_update_admin ON public.organizations
  FOR UPDATE TO authenticated
  USING (id = public.current_organization_id() AND public.is_admin())
  WITH CHECK (id = public.current_organization_id() AND public.is_admin());

CREATE POLICY org_delete_admin ON public.organizations
  FOR DELETE TO authenticated
  USING (id = public.current_organization_id() AND public.is_admin());

-- 4.2 locations: B0-Platzhalter ersetzen
DROP POLICY IF EXISTS b0_placeholder_deny_all ON public.locations;

CREATE POLICY loc_select_members ON public.locations
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());

CREATE POLICY loc_insert_admin ON public.locations
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_organization_id() AND public.is_admin());

CREATE POLICY loc_update_admin ON public.locations
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_organization_id() AND public.is_admin())
  WITH CHECK (organization_id = public.current_organization_id() AND public.is_admin());

CREATE POLICY loc_delete_admin ON public.locations
  FOR DELETE TO authenticated
  USING (organization_id = public.current_organization_id() AND public.is_admin());

-- 4.3 staff: SELECT Org-Mitglieder, Schreiben Manager+
CREATE POLICY staff_select_org ON public.staff
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());

CREATE POLICY staff_insert_manager ON public.staff
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('manager'));

CREATE POLICY staff_update_manager ON public.staff
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('manager'))
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('manager'));

CREATE POLICY staff_delete_manager ON public.staff
  FOR DELETE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('manager'));

-- 4.4 staff_locations: SELECT Org, Schreiben Manager+
CREATE POLICY staff_loc_select_org ON public.staff_locations
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());

CREATE POLICY staff_loc_insert_manager ON public.staff_locations
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('manager'));

CREATE POLICY staff_loc_update_manager ON public.staff_locations
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('manager'))
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('manager'));

CREATE POLICY staff_loc_delete_manager ON public.staff_locations
  FOR DELETE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('manager'));

-- 4.5 staff_compensation: NUR Manager+ (auch SELECT)
CREATE POLICY comp_select_manager ON public.staff_compensation
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('manager'));

CREATE POLICY comp_insert_manager ON public.staff_compensation
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('manager'));

CREATE POLICY comp_update_manager ON public.staff_compensation
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('manager'))
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('manager'));

CREATE POLICY comp_delete_manager ON public.staff_compensation
  FOR DELETE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('manager'));

-- 4.6 user_links: SELECT eigene Zeile ODER Manager+ in der Org, Schreiben Admin
CREATE POLICY ul_select_own_or_manager ON public.user_links
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (organization_id = public.current_organization_id()
        AND public.has_min_permission('manager'))
  );

CREATE POLICY ul_insert_admin ON public.user_links
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_organization_id() AND public.is_admin());

CREATE POLICY ul_update_admin ON public.user_links
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_organization_id() AND public.is_admin())
  WITH CHECK (organization_id = public.current_organization_id() AND public.is_admin());

CREATE POLICY ul_delete_admin ON public.user_links
  FOR DELETE TO authenticated
  USING (organization_id = public.current_organization_id() AND public.is_admin());

-- 4.7 role_assignments: SELECT eigene Zeile ODER Manager+ in der Org, Schreiben Admin
CREATE POLICY ra_select_own_or_manager ON public.role_assignments
  FOR SELECT TO authenticated
  USING (
    staff_id = public.current_staff_id()
    OR (organization_id = public.current_organization_id()
        AND public.has_min_permission('manager'))
  );

CREATE POLICY ra_insert_admin ON public.role_assignments
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_organization_id() AND public.is_admin());

CREATE POLICY ra_update_admin ON public.role_assignments
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_organization_id() AND public.is_admin())
  WITH CHECK (organization_id = public.current_organization_id() AND public.is_admin());

CREATE POLICY ra_delete_admin ON public.role_assignments
  FOR DELETE TO authenticated
  USING (organization_id = public.current_organization_id() AND public.is_admin());