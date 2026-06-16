-- Erweitert create_order_from_cart um optionalen Lieferanten-Filter,
-- damit pro Lieferant einzeln bestellt werden kann (neuer Inline-Flow).
-- Verhalten ohne p_supplier_id ist unverändert (alle Lieferanten im Cart).
-- DROP + CREATE notwendig, weil sich die Signatur ändert.

DROP FUNCTION IF EXISTS public.create_order_from_cart(uuid, uuid, text);

CREATE OR REPLACE FUNCTION public.create_order_from_cart(
  p_org_id uuid,
  p_user_id uuid,
  p_notes text DEFAULT NULL,
  p_supplier_id uuid DEFAULT NULL
)
RETURNS uuid[]
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_cart            carts%ROWTYPE;
  v_loc             locations%ROWTYPE;
  v_delivery_addr   text;
  v_supplier        uuid;
  v_order_id        uuid;
  v_total           bigint;
  v_order_ids       uuid[] := '{}';
BEGIN
  SELECT * INTO v_cart
  FROM carts
  WHERE organization_id = p_org_id AND user_id = p_user_id
  LIMIT 1;
  IF v_cart.id IS NULL THEN
    RAISE EXCEPTION 'Kein aktiver Warenkorb.' USING ERRCODE = 'P0001';
  END IF;
  IF v_cart.location_id IS NULL THEN
    RAISE EXCEPTION 'Standort wählen, bevor du bestellst.' USING ERRCODE = 'P0002';
  END IF;

  SELECT * INTO v_loc
  FROM locations
  WHERE id = v_cart.location_id AND organization_id = p_org_id;
  IF v_loc.id IS NULL THEN
    RAISE EXCEPTION 'Standort nicht gefunden.' USING ERRCODE = 'P0003';
  END IF;

  v_delivery_addr := concat_ws(
    E'\n',
    v_loc.name,
    NULLIF(v_loc.street, ''),
    NULLIF(trim(concat_ws(' ', v_loc.postal_code, v_loc.city)), ''),
    NULLIF(v_loc.delivery_notes, '')
  );

  IF NOT EXISTS (
    SELECT 1 FROM cart_items
    WHERE cart_id = v_cart.id
      AND (p_supplier_id IS NULL OR supplier_id = p_supplier_id)
  ) THEN
    RAISE EXCEPTION 'Warenkorb ist leer.' USING ERRCODE = 'P0004';
  END IF;

  IF EXISTS (
    SELECT 1 FROM cart_items
    WHERE cart_id = v_cart.id
      AND supplier_id IS NULL
      AND (p_supplier_id IS NULL)
  ) THEN
    RAISE EXCEPTION 'Cart-Item ohne Lieferant.' USING ERRCODE = 'P0005';
  END IF;

  FOR v_supplier IN
    SELECT DISTINCT supplier_id
    FROM cart_items
    WHERE cart_id = v_cart.id
      AND supplier_id IS NOT NULL
      AND (p_supplier_id IS NULL OR supplier_id = p_supplier_id)
  LOOP
    INSERT INTO orders (
      organization_id, supplier_id, location_id, status, total_amount_cents,
      delivery_date, time_window, delivery_address, notes
    )
    VALUES (
      p_org_id, v_supplier, v_cart.location_id, 'pending', 0,
      v_cart.delivery_date, v_cart.time_window, v_delivery_addr, p_notes
    )
    RETURNING id INTO v_order_id;

    INSERT INTO order_items (
      organization_id, order_id, article_id, article_name, sku,
      quantity, unit, unit_price_cents, total_price_cents, is_free_text_item
    )
    SELECT
      p_org_id,
      v_order_id,
      ci.article_id,
      CASE WHEN ci.is_free_text_item
           THEN COALESCE(ci.free_text_name, 'Freitext')
           ELSE COALESCE(a.name, 'Artikel') END,
      a.sku,
      ci.quantity,
      CASE WHEN ci.is_free_text_item
           THEN COALESCE(ci.free_text_unit, 'Stk')
           ELSE COALESCE(a.unit, 'Stk') END,
      CASE WHEN ci.is_free_text_item THEN 0 ELSE COALESCE(a.price_cents, 0) END,
      CASE WHEN ci.is_free_text_item THEN 0 ELSE COALESCE(a.price_cents, 0) END
        * ci.quantity,
      ci.is_free_text_item
    FROM cart_items ci
    LEFT JOIN articles a
      ON a.id = ci.article_id AND a.organization_id = p_org_id
    WHERE ci.cart_id = v_cart.id AND ci.supplier_id = v_supplier;

    SELECT COALESCE(SUM(total_price_cents), 0) INTO v_total
    FROM order_items WHERE order_id = v_order_id;

    UPDATE orders SET total_amount_cents = v_total WHERE id = v_order_id;

    v_order_ids := array_append(v_order_ids, v_order_id);
  END LOOP;

  -- Nur die abgearbeiteten Cart-Items löschen (alles wenn ohne Filter).
  DELETE FROM cart_items
  WHERE cart_id = v_cart.id
    AND (p_supplier_id IS NULL OR supplier_id = p_supplier_id);

  RETURN v_order_ids;
END;
$function$;