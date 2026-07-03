-- === 1) articles: Einheitenmodell (additiv) ===
ALTER TABLE public.articles
  ADD COLUMN IF NOT EXISTS order_unit text NOT NULL DEFAULT 'Stk',
  ADD COLUMN IF NOT EXISTS inventory_unit text NOT NULL DEFAULT 'Stk',
  ADD COLUMN IF NOT EXISTS order_to_inventory_factor numeric(12,4) NOT NULL DEFAULT 1
    CHECK (order_to_inventory_factor > 0),
  ADD COLUMN IF NOT EXISTS quantity_step numeric(12,4) NOT NULL DEFAULT 1
    CHECK (quantity_step > 0),
  ADD COLUMN IF NOT EXISTS allow_decimal_order_quantity boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS min_order_quantity numeric(12,4) NOT NULL DEFAULT 1
    CHECK (min_order_quantity >= 0),
  ADD COLUMN IF NOT EXISTS target_stock_total numeric(12,4),
  ADD COLUMN IF NOT EXISTS target_stock_bar numeric(12,4);

-- Bestandsdaten migrieren: bisheriges unit → beide Einheiten; packaging_unit → Faktor.
UPDATE public.articles SET
  order_unit     = COALESCE(NULLIF(unit, ''), 'Stk'),
  inventory_unit = COALESCE(NULLIF(unit, ''), 'Stk'),
  order_to_inventory_factor = CASE
    WHEN packaging_unit IS NOT NULL AND packaging_unit > 0 THEN packaging_unit
    ELSE 1 END;

-- === 2) order_items: fehlende Snapshot-Felder (additiv, nullable für Altzeilen) ===
ALTER TABLE public.order_items
  ADD COLUMN IF NOT EXISTS inventory_unit_snapshot text,
  ADD COLUMN IF NOT EXISTS order_to_inventory_factor_snapshot numeric(12,4),
  ADD COLUMN IF NOT EXISTS normalized_price_per_inventory_unit_cents numeric(14,4);

-- === 3) inventory_items: Snapshot-Felder + FK-Härtung ===
ALTER TABLE public.inventory_items
  ADD COLUMN IF NOT EXISTS article_name_snapshot text,
  ADD COLUMN IF NOT EXISTS inventory_unit_snapshot text,
  ADD COLUMN IF NOT EXISTS order_unit_snapshot text,
  ADD COLUMN IF NOT EXISTS order_to_inventory_factor_snapshot numeric(12,4),
  ADD COLUMN IF NOT EXISTS normalized_price_per_inventory_unit_cents numeric(14,4);

-- Integritätsloch schließen: Artikel-Löschung darf keine Inventurhistorie wegwischen.
ALTER TABLE public.inventory_items
  DROP CONSTRAINT IF EXISTS inventory_items_article_id_fkey;
ALTER TABLE public.inventory_items
  ADD CONSTRAINT inventory_items_article_id_fkey
  FOREIGN KEY (article_id) REFERENCES public.articles(id) ON DELETE RESTRICT;

-- Backfill der Snapshots für Altzeilen (best effort aus aktuellem Artikelstand).
-- MUSS vor der Trigger-Anlage in Schritt 5 laufen (Trigger würde completed-Sessions blocken).
UPDATE public.inventory_items ii SET
  article_name_snapshot  = a.name,
  inventory_unit_snapshot = COALESCE(NULLIF(a.unit,''),'Stk'),
  order_unit_snapshot     = COALESCE(NULLIF(a.unit,''),'Stk'),
  order_to_inventory_factor_snapshot = 1,
  normalized_price_per_inventory_unit_cents = ii.unit_price_cents
FROM public.articles a
WHERE a.id = ii.article_id AND ii.article_name_snapshot IS NULL;

-- === 4) RLS: Schreiben nur bei offener Session (ODER-Falle: DROP vor CREATE!) ===
DROP POLICY IF EXISTS "inv_items_write_mgr" ON public.inventory_items;
CREATE POLICY "inv_items_write_mgr" ON public.inventory_items
  FOR ALL TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('manager')
         AND EXISTS (SELECT 1 FROM public.inventory_sessions s
                     WHERE s.id = inventory_items.session_id
                       AND s.organization_id = public.current_organization_id()
                       AND s.status = 'in_progress'))
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('manager')
              AND EXISTS (SELECT 1 FROM public.inventory_sessions s
                          WHERE s.id = inventory_items.session_id
                            AND s.organization_id = public.current_organization_id()
                            AND s.status = 'in_progress'));

-- === 5) Trigger: bindet auch service_role (RLS greift dort nicht) ===
CREATE OR REPLACE FUNCTION public.tg_inventory_items_assert_open()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'pg_catalog', 'public' AS $$
DECLARE v_status text;
BEGIN
  SELECT status INTO v_status FROM public.inventory_sessions
   WHERE id = COALESCE(NEW.session_id, OLD.session_id);
  IF v_status IS DISTINCT FROM 'in_progress' THEN
    RAISE EXCEPTION 'Inventur ist abgeschlossen.';
  END IF;
  RETURN COALESCE(NEW, OLD);
END $$;

DROP TRIGGER IF EXISTS trg_inv_items_assert_open ON public.inventory_items;
CREATE TRIGGER trg_inv_items_assert_open
  BEFORE INSERT OR UPDATE OR DELETE ON public.inventory_items
  FOR EACH ROW EXECUTE FUNCTION public.tg_inventory_items_assert_open();

-- === 6) RPC create_order_from_cart: neue Snapshots füllen ===
CREATE OR REPLACE FUNCTION public.create_order_from_cart(
  p_org_id uuid,
  p_user_id uuid,
  p_notes text DEFAULT NULL::text,
  p_supplier_id uuid DEFAULT NULL::uuid
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
      quantity, unit, unit_price_cents, total_price_cents, is_free_text_item,
      inventory_unit_snapshot, order_to_inventory_factor_snapshot,
      normalized_price_per_inventory_unit_cents
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
           ELSE COALESCE(a.order_unit, 'Stk') END,
      CASE WHEN ci.is_free_text_item THEN 0 ELSE COALESCE(a.price_cents, 0) END,
      CASE WHEN ci.is_free_text_item THEN 0 ELSE COALESCE(a.price_cents, 0) END
        * ci.quantity,
      ci.is_free_text_item,
      CASE WHEN ci.is_free_text_item THEN NULL ELSE a.inventory_unit END,
      CASE WHEN ci.is_free_text_item THEN NULL ELSE a.order_to_inventory_factor END,
      CASE WHEN ci.is_free_text_item OR a.order_to_inventory_factor IS NULL OR a.order_to_inventory_factor = 0
           THEN NULL
           ELSE a.price_cents::numeric / a.order_to_inventory_factor END
    FROM cart_items ci
    LEFT JOIN articles a
      ON a.id = ci.article_id AND a.organization_id = p_org_id
    WHERE ci.cart_id = v_cart.id AND ci.supplier_id = v_supplier;

    SELECT COALESCE(SUM(total_price_cents), 0) INTO v_total
    FROM order_items WHERE order_id = v_order_id;

    UPDATE orders SET total_amount_cents = v_total WHERE id = v_order_id;

    v_order_ids := array_append(v_order_ids, v_order_id);
  END LOOP;

  DELETE FROM cart_items
  WHERE cart_id = v_cart.id
    AND (p_supplier_id IS NULL OR supplier_id = p_supplier_id);

  RETURN v_order_ids;
END;
$function$;

REVOKE ALL ON FUNCTION public.create_order_from_cart(uuid, uuid, text, uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.create_order_from_cart(uuid, uuid, text, uuid) TO service_role;