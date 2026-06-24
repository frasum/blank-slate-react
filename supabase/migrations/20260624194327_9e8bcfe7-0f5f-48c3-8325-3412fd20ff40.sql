CREATE OR REPLACE FUNCTION public.replace_staff_skills(
  p_staff_id uuid, p_organization_id uuid, p_skill_ids uuid[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = p_staff_id AND organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'staff % gehört nicht zu organization %', p_staff_id, p_organization_id;
  END IF;
  DELETE FROM public.staff_skills WHERE staff_id = p_staff_id AND organization_id = p_organization_id;
  IF p_skill_ids IS NOT NULL AND array_length(p_skill_ids, 1) IS NOT NULL THEN
    INSERT INTO public.staff_skills (staff_id, organization_id, skill_id)
    SELECT p_staff_id, p_organization_id, s.id
    FROM public.skills s
    WHERE s.organization_id = p_organization_id AND s.id = ANY(p_skill_ids);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_staff_role(
  p_staff_id uuid, p_organization_id uuid, p_role public.app_role
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = p_staff_id AND organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'staff % gehört nicht zu organization %', p_staff_id, p_organization_id;
  END IF;
  DELETE FROM public.role_assignments WHERE staff_id = p_staff_id AND organization_id = p_organization_id;
  IF p_role IS NOT NULL THEN
    INSERT INTO public.role_assignments (staff_id, organization_id, role)
    VALUES (p_staff_id, p_organization_id, p_role);
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.replace_staff_locations(
  p_staff_id uuid, p_organization_id uuid, p_location_ids uuid[]
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.staff WHERE id = p_staff_id AND organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'staff % gehört nicht zu organization %', p_staff_id, p_organization_id;
  END IF;
  DELETE FROM public.staff_locations WHERE staff_id = p_staff_id AND organization_id = p_organization_id;
  IF p_location_ids IS NOT NULL AND array_length(p_location_ids, 1) IS NOT NULL THEN
    INSERT INTO public.staff_locations (staff_id, organization_id, location_id, department)
    SELECT p_staff_id, p_organization_id, l.id, 'service'::public.staff_department
    FROM public.locations l
    WHERE l.organization_id = p_organization_id AND l.id = ANY(p_location_ids);
  END IF;
END;
$$;

REVOKE ALL ON FUNCTION public.replace_staff_skills(uuid, uuid, uuid[])           FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_staff_role(uuid, uuid, public.app_role)    FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.replace_staff_locations(uuid, uuid, uuid[])        FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.replace_staff_skills(uuid, uuid, uuid[])        TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_staff_role(uuid, uuid, public.app_role) TO service_role;
GRANT EXECUTE ON FUNCTION public.replace_staff_locations(uuid, uuid, uuid[])     TO service_role;