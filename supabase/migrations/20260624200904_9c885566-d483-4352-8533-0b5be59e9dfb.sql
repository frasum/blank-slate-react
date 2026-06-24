CREATE OR REPLACE FUNCTION public.link_account_to_staff(
  p_staff_id uuid, p_organization_id uuid, p_user_id uuid, p_email text
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.staff WHERE id = p_staff_id AND organization_id = p_organization_id
  ) THEN
    RAISE EXCEPTION 'staff % gehört nicht zu organization %', p_staff_id, p_organization_id;
  END IF;
  IF EXISTS (SELECT 1 FROM public.user_links WHERE staff_id = p_staff_id) THEN
    RAISE EXCEPTION 'Mitarbeiter hat bereits ein Konto.';
  END IF;

  INSERT INTO public.user_links (user_id, staff_id, organization_id)
  VALUES (p_user_id, p_staff_id, p_organization_id);

  UPDATE public.staff
  SET must_change_password = true, email = p_email
  WHERE id = p_staff_id;
END;
$$;

REVOKE ALL ON FUNCTION public.link_account_to_staff(uuid, uuid, uuid, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.link_account_to_staff(uuid, uuid, uuid, text) FROM anon;
REVOKE ALL ON FUNCTION public.link_account_to_staff(uuid, uuid, uuid, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.link_account_to_staff(uuid, uuid, uuid, text) TO service_role;