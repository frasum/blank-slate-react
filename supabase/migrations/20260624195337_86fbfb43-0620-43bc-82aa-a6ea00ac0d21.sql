
CREATE OR REPLACE FUNCTION public.save_cart_as_draft(
  p_cart_id uuid, p_organization_id uuid, p_user_id uuid, p_name text, p_notes text
) RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_draft_id uuid;
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.carts
    WHERE id = p_cart_id AND organization_id = p_organization_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Warenkorb nicht gefunden.';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM public.cart_items WHERE cart_id = p_cart_id) THEN
    RAISE EXCEPTION 'Warenkorb ist leer.';
  END IF;

  INSERT INTO public.cart_drafts
    (organization_id, user_id, name, location_id, desired_delivery_date, desired_time_window, notes)
  SELECT p_organization_id, p_user_id, p_name, c.location_id, c.delivery_date, c.time_window, p_notes
  FROM public.carts c
  WHERE c.id = p_cart_id
  RETURNING id INTO v_draft_id;

  INSERT INTO public.cart_draft_items
    (organization_id, draft_id, article_id, supplier_id, quantity, is_free_text_item, free_text_name, free_text_unit)
  SELECT p_organization_id, v_draft_id, article_id, supplier_id, quantity, is_free_text_item, free_text_name, free_text_unit
  FROM public.cart_items
  WHERE cart_id = p_cart_id;

  RETURN v_draft_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.load_draft_into_cart(
  p_draft_id uuid, p_cart_id uuid, p_organization_id uuid, p_user_id uuid, p_replace boolean
) RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM public.cart_drafts
    WHERE id = p_draft_id AND organization_id = p_organization_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Entwurf nicht gefunden.';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.carts
    WHERE id = p_cart_id AND organization_id = p_organization_id AND user_id = p_user_id
  ) THEN
    RAISE EXCEPTION 'Warenkorb nicht gefunden.';
  END IF;

  IF p_replace THEN
    DELETE FROM public.cart_items WHERE cart_id = p_cart_id;
  END IF;

  INSERT INTO public.cart_items
    (organization_id, cart_id, article_id, supplier_id, quantity, is_free_text_item, free_text_name, free_text_unit)
  SELECT p_organization_id, p_cart_id, article_id, supplier_id, quantity, is_free_text_item, free_text_name, free_text_unit
  FROM public.cart_draft_items
  WHERE draft_id = p_draft_id;

  UPDATE public.carts c
  SET location_id = d.location_id,
      delivery_date = d.desired_delivery_date,
      time_window = d.desired_time_window
  FROM public.cart_drafts d
  WHERE c.id = p_cart_id AND d.id = p_draft_id;
END;
$$;

REVOKE ALL ON FUNCTION public.save_cart_as_draft(uuid, uuid, uuid, text, text)         FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION public.load_draft_into_cart(uuid, uuid, uuid, uuid, boolean)    FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.save_cart_as_draft(uuid, uuid, uuid, text, text)       TO service_role;
GRANT EXECUTE ON FUNCTION public.load_draft_into_cart(uuid, uuid, uuid, uuid, boolean)  TO service_role;
