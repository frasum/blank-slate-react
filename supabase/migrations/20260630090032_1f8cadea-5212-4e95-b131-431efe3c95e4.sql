
-- 1) area-Dimension auf Overrides
ALTER TABLE public.permission_overrides
  ADD COLUMN IF NOT EXISTS area public.staff_department;

-- 2) Unique-Indizes neu
DROP INDEX IF EXISTS public.permission_overrides_unique_global;
DROP INDEX IF EXISTS public.permission_overrides_unique_scoped;

CREATE UNIQUE INDEX permission_overrides_unique_global
  ON public.permission_overrides (staff_id, permission)
  WHERE location_id IS NULL AND area IS NULL;

CREATE UNIQUE INDEX permission_overrides_unique_scoped
  ON public.permission_overrides
     (staff_id, permission,
      COALESCE(location_id, '00000000-0000-0000-0000-000000000000'::uuid),
      COALESCE(area, 'kitchen'::public.staff_department))
  WHERE location_id IS NOT NULL OR area IS NOT NULL;

-- 3) Neue 3-arg-Variante mit Bereichs-Logik
CREATE OR REPLACE FUNCTION public.has_permission(
  _perm public.app_permission,
  _location uuid,
  _area public.staff_department
) RETURNS boolean
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
DECLARE
  v_user uuid := public._effective_user_id();
  v_staff uuid;
  v_role public.app_role;
  v_deny boolean;
  v_allow boolean;
  v_default boolean;
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
  IF v_role = 'admin'::public.app_role THEN RETURN true; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.permission_overrides po
    WHERE po.staff_id = v_staff
      AND po.permission = _perm
      AND po.effect = 'deny'::public.permission_effect
      AND (po.location_id IS NULL OR (_location IS NOT NULL AND po.location_id = _location))
      AND (po.area IS NULL OR (_area IS NOT NULL AND po.area = _area))
  ) INTO v_deny;
  IF v_deny THEN RETURN false; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.permission_overrides po
    WHERE po.staff_id = v_staff
      AND po.permission = _perm
      AND po.effect = 'allow'::public.permission_effect
      AND (po.location_id IS NULL OR (_location IS NOT NULL AND po.location_id = _location))
      AND (po.area IS NULL OR (_area IS NOT NULL AND po.area = _area))
  ) INTO v_allow;
  IF v_allow THEN RETURN true; END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.permission_role_defaults prd
    WHERE prd.role = v_role AND prd.permission = _perm
  ) INTO v_default;

  RETURN COALESCE(v_default, false);
END;
$$;

-- Bestehende 2-arg-Variante: Signatur unverändert (RLS-Policies bleiben gültig),
-- delegiert auf die neue 3-arg-Variante mit _area = NULL.
CREATE OR REPLACE FUNCTION public.has_permission(
  _perm public.app_permission,
  _location uuid DEFAULT NULL
) RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = pg_catalog, public
AS $$
  SELECT public.has_permission(_perm, _location, NULL::public.staff_department);
$$;

-- 4) effective_permissions um area ergänzen
DROP FUNCTION IF EXISTS public.effective_permissions(uuid);

CREATE OR REPLACE FUNCTION public.effective_permissions(_staff uuid)
 RETURNS TABLE(permission public.app_permission, location_id uuid, area public.staff_department, effect public.permission_effect, source text)
 LANGUAGE sql STABLE SECURITY DEFINER
 SET search_path TO 'pg_catalog', 'public'
AS $$
  SELECT po.permission, po.location_id, po.area, po.effect, 'override'::text
    FROM public.permission_overrides po
   WHERE po.staff_id = _staff
  UNION ALL
  SELECT prd.permission, NULL::uuid, NULL::public.staff_department, 'allow'::public.permission_effect, 'role_default'::text
    FROM public.permission_role_defaults prd
    JOIN public.user_links ul ON ul.staff_id = _staff
    JOIN public.role_assignments ra
      ON ra.staff_id = ul.staff_id AND ra.organization_id = ul.organization_id
   WHERE prd.role = ra.role;
$$;

-- 5) Planer-Lese-Defaults (KEIN manage)
INSERT INTO public.permission_role_defaults (role, permission) VALUES
  ('planer','roster.shift.view_all'),
  ('planer','roster.shift.view_self'),
  ('planer','roster.absence.view'),
  ('planer','roster.leave.view_all'),
  ('planer','roster.wish.view_all')
ON CONFLICT DO NOTHING;
