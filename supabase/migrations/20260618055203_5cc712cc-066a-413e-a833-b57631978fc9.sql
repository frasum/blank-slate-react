-- ============================================================================
-- Teil B / M2 Kasse: Permission-Keys + Overrides + Standort-Scope
-- Migration 1: Schema, Defaults-Seed, Helfer
-- ============================================================================

-- 1) Enum (nur cash.* – M3/M4 folgen modulweise)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'app_permission') THEN
    CREATE TYPE public.app_permission AS ENUM (
      'cash.session.view',
      'cash.session.open',
      'cash.session.edit',
      'cash.session.finalize',
      'cash.session.lock',
      'cash.settlement.submit_self',
      'cash.settlement.view_all',
      'cash.settlement.correct',
      'cash.settlement.admin_create',
      'cash.tippool.manage',
      'cash.channel.manage',
      'cash.export.pdf'
    );
  END IF;
END $$;

CREATE TYPE public.permission_effect AS ENUM ('allow', 'deny');

-- 2) Default-Matrix pro Rolle
CREATE TABLE public.permission_role_defaults (
  role        public.app_role       NOT NULL,
  permission  public.app_permission NOT NULL,
  created_at  timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (role, permission)
);

GRANT SELECT ON public.permission_role_defaults TO authenticated;
GRANT ALL    ON public.permission_role_defaults TO service_role;

ALTER TABLE public.permission_role_defaults ENABLE ROW LEVEL SECURITY;

CREATE POLICY "prd_select_authenticated"
  ON public.permission_role_defaults FOR SELECT
  TO authenticated USING (true);

-- 3) Overrides pro Mitarbeiter (optional Standort-scoped)
CREATE TABLE public.permission_overrides (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  staff_id        uuid NOT NULL REFERENCES public.staff(id) ON DELETE CASCADE,
  permission      public.app_permission NOT NULL,
  effect          public.permission_effect NOT NULL,
  location_id     uuid REFERENCES public.locations(id) ON DELETE CASCADE, -- NULL = global
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  created_by      uuid -- auth.uid des setzenden Admins
);

-- Eindeutig pro (staff, permission, location) inkl. NULL-Slot
CREATE UNIQUE INDEX permission_overrides_unique_global
  ON public.permission_overrides (staff_id, permission)
  WHERE location_id IS NULL;
CREATE UNIQUE INDEX permission_overrides_unique_scoped
  ON public.permission_overrides (staff_id, permission, location_id)
  WHERE location_id IS NOT NULL;

CREATE INDEX permission_overrides_staff_idx
  ON public.permission_overrides (staff_id, permission);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.permission_overrides TO authenticated;
GRANT ALL ON public.permission_overrides TO service_role;

ALTER TABLE public.permission_overrides ENABLE ROW LEVEL SECURITY;

-- Lesen: eigener Mitarbeiter oder echter Admin
CREATE POLICY "po_select_own_or_admin"
  ON public.permission_overrides FOR SELECT
  TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND (staff_id = public.current_staff_id() OR public.is_real_admin())
  );

-- Schreiben: nur echter Admin (Server-Funktionen validieren zusätzlich)
CREATE POLICY "po_insert_real_admin"
  ON public.permission_overrides FOR INSERT
  TO authenticated
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.is_real_admin()
  );

CREATE POLICY "po_update_real_admin"
  ON public.permission_overrides FOR UPDATE
  TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.is_real_admin()
  )
  WITH CHECK (
    organization_id = public.current_organization_id()
    AND public.is_real_admin()
  );

CREATE POLICY "po_delete_real_admin"
  ON public.permission_overrides FOR DELETE
  TO authenticated
  USING (
    organization_id = public.current_organization_id()
    AND public.is_real_admin()
  );

CREATE TRIGGER tg_permission_overrides_updated_at
  BEFORE UPDATE ON public.permission_overrides
  FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();

-- 4) Default-Seed (admin = ALLES, manager = alles außer admin-only, staff = self+view, payroll = view/export)
INSERT INTO public.permission_role_defaults (role, permission)
SELECT 'admin'::public.app_role, p
FROM unnest(enum_range(NULL::public.app_permission)) AS p
ON CONFLICT DO NOTHING;

INSERT INTO public.permission_role_defaults (role, permission) VALUES
  ('manager', 'cash.session.view'),
  ('manager', 'cash.session.open'),
  ('manager', 'cash.session.edit'),
  ('manager', 'cash.session.finalize'),
  ('manager', 'cash.settlement.submit_self'),
  ('manager', 'cash.settlement.view_all'),
  ('manager', 'cash.settlement.correct'),
  ('manager', 'cash.tippool.manage'),
  ('manager', 'cash.channel.manage'),
  ('manager', 'cash.export.pdf'),
  ('staff',   'cash.session.view'),
  ('staff',   'cash.settlement.submit_self'),
  ('payroll', 'cash.session.view'),
  ('payroll', 'cash.settlement.view_all'),
  ('payroll', 'cash.export.pdf')
ON CONFLICT DO NOTHING;

-- 5) Helfer: has_permission(perm, location?)
CREATE OR REPLACE FUNCTION public.has_permission(
  _perm public.app_permission,
  _location uuid DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user uuid := public._effective_user_id();
  v_staff uuid;
  v_role public.app_role;
  v_default boolean;
  v_deny boolean;
  v_allow boolean;
BEGIN
  IF v_user IS NULL THEN RETURN false; END IF;

  SELECT ul.staff_id, ra.role
    INTO v_staff, v_role
    FROM public.user_links ul
    LEFT JOIN public.role_assignments ra
      ON ra.staff_id = ul.staff_id AND ra.organization_id = ul.organization_id
   WHERE ul.user_id = v_user
   ORDER BY ul.staff_id
   LIMIT 1;

  IF v_role IS NULL THEN RETURN false; END IF;

  -- Admin ignoriert Overrides (sonst Selbstaussperrung möglich)
  IF v_role = 'admin'::public.app_role THEN RETURN true; END IF;

  -- DENY hat Vorrang: globales DENY oder ein für diesen Standort gesetztes DENY
  SELECT EXISTS (
    SELECT 1 FROM public.permission_overrides po
    WHERE po.staff_id = v_staff
      AND po.permission = _perm
      AND po.effect = 'deny'::public.permission_effect
      AND (po.location_id IS NULL OR (_location IS NOT NULL AND po.location_id = _location))
  ) INTO v_deny;
  IF v_deny THEN RETURN false; END IF;

  -- ALLOW: global oder passender Standort
  SELECT EXISTS (
    SELECT 1 FROM public.permission_overrides po
    WHERE po.staff_id = v_staff
      AND po.permission = _perm
      AND po.effect = 'allow'::public.permission_effect
      AND (po.location_id IS NULL OR (_location IS NOT NULL AND po.location_id = _location))
  ) INTO v_allow;
  IF v_allow THEN RETURN true; END IF;

  -- Rollen-Default
  SELECT EXISTS (
    SELECT 1 FROM public.permission_role_defaults prd
    WHERE prd.role = v_role AND prd.permission = _perm
  ) INTO v_default;

  RETURN COALESCE(v_default, false);
END;
$$;

-- 6) Effective-Übersicht für Admin-UI
CREATE OR REPLACE FUNCTION public.effective_permissions(_staff uuid)
RETURNS TABLE (
  permission   public.app_permission,
  location_id  uuid,
  effect       public.permission_effect,
  source       text   -- 'override' | 'role_default'
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT po.permission, po.location_id, po.effect, 'override'::text
    FROM public.permission_overrides po
   WHERE po.staff_id = _staff
  UNION ALL
  SELECT prd.permission, NULL::uuid, 'allow'::public.permission_effect, 'role_default'::text
    FROM public.permission_role_defaults prd
    JOIN public.user_links ul ON ul.staff_id = _staff
    JOIN public.role_assignments ra
      ON ra.staff_id = ul.staff_id AND ra.organization_id = ul.organization_id
   WHERE prd.role = ra.role;
$$;