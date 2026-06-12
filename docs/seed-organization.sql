-- Seed-Snippet für B1c
-- Legt eine Organisation, einen ersten Standort und einen ersten Admin an.
-- Voraussetzung: Es existiert bereits eine Zeile in auth.users für den
-- gewünschten Admin (z. B. über Supabase Dashboard > Authentication >
-- Add user erzeugt). Deren UUID wird unten als :user_id eingetragen.
--
-- Aufruf via psql:
--   psql "$SUPABASE_DB_URL" \
--     -v user_id="'00000000-0000-0000-0000-000000000000'" \
--     -v org_name="'Beispiel GmbH'" \
--     -v location_name="'Hauptstandort'" \
--     -v first_name="'Anna'" \
--     -v last_name="'Admin'" \
--     -v email="'admin@example.com'" \
--     -f docs/seed-organization.sql
--
-- Hinweis (Sicherheitsregel): Dieses Snippet enthält KEINE Personaldaten.
-- Echte Werte werden ausschließlich als psql-Variablen übergeben, nicht
-- ins Repo committet.

BEGIN;

WITH new_org AS (
  INSERT INTO public.organizations (name)
  VALUES (:org_name)
  RETURNING id
),
new_location AS (
  INSERT INTO public.locations (organization_id, name)
  SELECT id, :location_name FROM new_org
  RETURNING id, organization_id
),
new_staff AS (
  INSERT INTO public.staff (organization_id, first_name, last_name, display_name, email, is_active)
  SELECT organization_id, :first_name, :last_name, :first_name || ' ' || :last_name, :email, true
  FROM new_location
  RETURNING id, organization_id
),
new_staff_location AS (
  INSERT INTO public.staff_locations (organization_id, staff_id, location_id)
  SELECT s.organization_id, s.id, l.id FROM new_staff s, new_location l
  RETURNING staff_id
),
new_link AS (
  INSERT INTO public.user_links (user_id, staff_id, organization_id)
  SELECT :user_id::uuid, s.id, s.organization_id FROM new_staff s
  RETURNING staff_id, organization_id
)
INSERT INTO public.role_assignments (organization_id, staff_id, role)
SELECT organization_id, staff_id, 'admin'::public.app_role FROM new_link;

COMMIT;