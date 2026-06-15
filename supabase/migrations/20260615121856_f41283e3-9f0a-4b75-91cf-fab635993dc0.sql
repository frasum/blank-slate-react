
-- 1. Sequence + order-number function
CREATE SEQUENCE IF NOT EXISTS public.order_number_seq;

CREATE OR REPLACE FUNCTION public.generate_order_number()
RETURNS text LANGUAGE plpgsql SET search_path = public AS $$
DECLARE seq_num integer;
BEGIN
  seq_num := nextval('public.order_number_seq');
  RETURN 'ORD-' || to_char(now(),'YYYY-MM') || '-' || LPAD(seq_num::text,4,'0');
END; $$;

-- 2. Extend locations with delivery address
ALTER TABLE public.locations
  ADD COLUMN IF NOT EXISTS street          text,
  ADD COLUMN IF NOT EXISTS postal_code     text,
  ADD COLUMN IF NOT EXISTS city            text,
  ADD COLUMN IF NOT EXISTS delivery_notes  text;

-- 3.1 suppliers
CREATE TABLE public.suppliers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  email text,
  phone text,
  address text,
  customer_number text,
  contact_person text,
  notes text,
  delivery_days text[],
  order_deadline time,
  min_order_value_cents bigint,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.suppliers TO authenticated;
GRANT ALL ON public.suppliers TO service_role;
ALTER TABLE public.suppliers ENABLE ROW LEVEL SECURITY;

-- 3.2 order_units (organization_id nullable = systemweit)
CREATE TABLE public.order_units (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  name text NOT NULL,
  abbreviation text NOT NULL,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_units TO authenticated;
GRANT ALL ON public.order_units TO service_role;
ALTER TABLE public.order_units ENABLE ROW LEVEL SECURITY;

-- 3.3 articles
CREATE TABLE public.articles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  name text NOT NULL,
  sku text,
  description text,
  category text,
  unit text NOT NULL DEFAULT 'Stk',
  order_unit_id uuid REFERENCES public.order_units(id) ON DELETE SET NULL,
  price_cents bigint NOT NULL DEFAULT 0,
  packaging_unit integer,
  image_url text,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.articles TO authenticated;
GRANT ALL ON public.articles TO service_role;
ALTER TABLE public.articles ENABLE ROW LEVEL SECURITY;

-- 3.4 carts + cart_items
CREATE TABLE public.carts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  delivery_date date,
  time_window text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, user_id)
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.carts TO authenticated;
GRANT ALL ON public.carts TO service_role;
ALTER TABLE public.carts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.cart_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  cart_id uuid NOT NULL REFERENCES public.carts(id) ON DELETE CASCADE,
  article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  is_free_text_item boolean NOT NULL DEFAULT false,
  free_text_name text,
  free_text_unit text DEFAULT 'Stk',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_items TO authenticated;
GRANT ALL ON public.cart_items TO service_role;
ALTER TABLE public.cart_items ENABLE ROW LEVEL SECURITY;

-- 3.5 cart_drafts + cart_draft_items
CREATE TABLE public.cart_drafts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  name text NOT NULL DEFAULT 'Entwurf',
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  delivery_address text,
  desired_delivery_date date,
  desired_time_window text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_drafts TO authenticated;
GRANT ALL ON public.cart_drafts TO service_role;
ALTER TABLE public.cart_drafts ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.cart_draft_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  draft_id uuid NOT NULL REFERENCES public.cart_drafts(id) ON DELETE CASCADE,
  article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  supplier_id uuid REFERENCES public.suppliers(id) ON DELETE SET NULL,
  quantity integer NOT NULL DEFAULT 1 CHECK (quantity > 0),
  is_free_text_item boolean NOT NULL DEFAULT false,
  free_text_name text,
  free_text_unit text DEFAULT 'Stk',
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.cart_draft_items TO authenticated;
GRANT ALL ON public.cart_draft_items TO service_role;
ALTER TABLE public.cart_draft_items ENABLE ROW LEVEL SECURITY;

-- 3.6 orders + order_items
CREATE TABLE public.orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  supplier_id uuid NOT NULL REFERENCES public.suppliers(id) ON DELETE RESTRICT,
  location_id uuid REFERENCES public.locations(id) ON DELETE SET NULL,
  order_number text NOT NULL DEFAULT public.generate_order_number(),
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','sent','confirmed','cancelled')),
  total_amount_cents bigint NOT NULL DEFAULT 0,
  delivery_date date,
  time_window text,
  delivery_address text,
  notes text,
  email_sent boolean NOT NULL DEFAULT false,
  email_sent_at timestamptz,
  confirmed_at timestamptz,
  confirmation_token text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.orders TO authenticated;
GRANT ALL ON public.orders TO service_role;
ALTER TABLE public.orders ENABLE ROW LEVEL SECURITY;

CREATE TABLE public.order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  order_id uuid NOT NULL REFERENCES public.orders(id) ON DELETE CASCADE,
  article_id uuid REFERENCES public.articles(id) ON DELETE SET NULL,
  article_name text NOT NULL,
  sku text,
  quantity integer NOT NULL CHECK (quantity > 0),
  unit text NOT NULL DEFAULT 'Stk',
  unit_price_cents bigint NOT NULL DEFAULT 0,
  total_price_cents bigint NOT NULL DEFAULT 0,
  is_free_text_item boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.order_items TO authenticated;
GRANT ALL ON public.order_items TO service_role;
ALTER TABLE public.order_items ENABLE ROW LEVEL SECURITY;

-- 4. Indexes
CREATE INDEX ON public.suppliers (organization_id, sort_order);
CREATE INDEX ON public.articles (organization_id, supplier_id);
CREATE INDEX ON public.articles (organization_id, category);
CREATE INDEX ON public.cart_items (cart_id);
CREATE INDEX ON public.cart_draft_items (draft_id);
CREATE INDEX ON public.orders (organization_id, status, created_at DESC);
CREATE INDEX ON public.order_items (order_id);

-- 5. RLS policies

-- ---- org-scoped tables: suppliers, articles, orders, order_items ----
-- suppliers
CREATE POLICY "suppliers_select_own_org" ON public.suppliers
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());
CREATE POLICY "suppliers_insert_manager" ON public.suppliers
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('manager'));
CREATE POLICY "suppliers_update_manager" ON public.suppliers
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('manager'))
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('manager'));
CREATE POLICY "suppliers_delete_admin" ON public.suppliers
  FOR DELETE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.is_admin());

-- articles
CREATE POLICY "articles_select_own_org" ON public.articles
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());
CREATE POLICY "articles_insert_manager" ON public.articles
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('manager'));
CREATE POLICY "articles_update_manager" ON public.articles
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('manager'))
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('manager'));
CREATE POLICY "articles_delete_admin" ON public.articles
  FOR DELETE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.is_admin());

-- orders
CREATE POLICY "orders_select_own_org" ON public.orders
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());
CREATE POLICY "orders_insert_manager" ON public.orders
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('manager'));
CREATE POLICY "orders_update_manager" ON public.orders
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('manager'))
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('manager'));
CREATE POLICY "orders_delete_admin" ON public.orders
  FOR DELETE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.is_admin());

-- order_items
CREATE POLICY "order_items_select_own_org" ON public.order_items
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id());
CREATE POLICY "order_items_insert_manager" ON public.order_items
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('manager'));
CREATE POLICY "order_items_update_manager" ON public.order_items
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('manager'))
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('manager'));
CREATE POLICY "order_items_delete_admin" ON public.order_items
  FOR DELETE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.is_admin());

-- order_units: org-scoped read also allows systemweite (organization_id IS NULL)
CREATE POLICY "order_units_select_own_org" ON public.order_units
  FOR SELECT TO authenticated
  USING (organization_id IS NULL OR organization_id = public.current_organization_id());
CREATE POLICY "order_units_insert_manager" ON public.order_units
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('manager'));
CREATE POLICY "order_units_update_manager" ON public.order_units
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.has_min_permission('manager'))
  WITH CHECK (organization_id = public.current_organization_id()
              AND public.has_min_permission('manager'));
CREATE POLICY "order_units_delete_admin" ON public.order_units
  FOR DELETE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND public.is_admin());

-- ---- user-scoped tables: carts, cart_drafts ----
CREATE POLICY "carts_select_own" ON public.carts
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id() AND user_id = auth.uid());
CREATE POLICY "carts_insert_own" ON public.carts
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_organization_id() AND user_id = auth.uid());
CREATE POLICY "carts_update_own" ON public.carts
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_organization_id() AND user_id = auth.uid())
  WITH CHECK (organization_id = public.current_organization_id() AND user_id = auth.uid());
CREATE POLICY "carts_delete_own" ON public.carts
  FOR DELETE TO authenticated
  USING (organization_id = public.current_organization_id() AND user_id = auth.uid());

CREATE POLICY "cart_drafts_select_own" ON public.cart_drafts
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id() AND user_id = auth.uid());
CREATE POLICY "cart_drafts_insert_own" ON public.cart_drafts
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_organization_id() AND user_id = auth.uid());
CREATE POLICY "cart_drafts_update_own" ON public.cart_drafts
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_organization_id() AND user_id = auth.uid())
  WITH CHECK (organization_id = public.current_organization_id() AND user_id = auth.uid());
CREATE POLICY "cart_drafts_delete_own" ON public.cart_drafts
  FOR DELETE TO authenticated
  USING (organization_id = public.current_organization_id() AND user_id = auth.uid());

-- cart_items: scope via parent cart
CREATE POLICY "cart_items_select_own" ON public.cart_items
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id()
         AND EXISTS (SELECT 1 FROM public.carts c
                     WHERE c.id = cart_items.cart_id
                       AND c.user_id = auth.uid()
                       AND c.organization_id = public.current_organization_id()));
CREATE POLICY "cart_items_insert_own" ON public.cart_items
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_organization_id()
              AND EXISTS (SELECT 1 FROM public.carts c
                          WHERE c.id = cart_items.cart_id
                            AND c.user_id = auth.uid()
                            AND c.organization_id = public.current_organization_id()));
CREATE POLICY "cart_items_update_own" ON public.cart_items
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND EXISTS (SELECT 1 FROM public.carts c
                     WHERE c.id = cart_items.cart_id
                       AND c.user_id = auth.uid()
                       AND c.organization_id = public.current_organization_id()))
  WITH CHECK (organization_id = public.current_organization_id()
              AND EXISTS (SELECT 1 FROM public.carts c
                          WHERE c.id = cart_items.cart_id
                            AND c.user_id = auth.uid()
                            AND c.organization_id = public.current_organization_id()));
CREATE POLICY "cart_items_delete_own" ON public.cart_items
  FOR DELETE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND EXISTS (SELECT 1 FROM public.carts c
                     WHERE c.id = cart_items.cart_id
                       AND c.user_id = auth.uid()
                       AND c.organization_id = public.current_organization_id()));

-- cart_draft_items: scope via parent draft
CREATE POLICY "cart_draft_items_select_own" ON public.cart_draft_items
  FOR SELECT TO authenticated
  USING (organization_id = public.current_organization_id()
         AND EXISTS (SELECT 1 FROM public.cart_drafts d
                     WHERE d.id = cart_draft_items.draft_id
                       AND d.user_id = auth.uid()
                       AND d.organization_id = public.current_organization_id()));
CREATE POLICY "cart_draft_items_insert_own" ON public.cart_draft_items
  FOR INSERT TO authenticated
  WITH CHECK (organization_id = public.current_organization_id()
              AND EXISTS (SELECT 1 FROM public.cart_drafts d
                          WHERE d.id = cart_draft_items.draft_id
                            AND d.user_id = auth.uid()
                            AND d.organization_id = public.current_organization_id()));
CREATE POLICY "cart_draft_items_update_own" ON public.cart_draft_items
  FOR UPDATE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND EXISTS (SELECT 1 FROM public.cart_drafts d
                     WHERE d.id = cart_draft_items.draft_id
                       AND d.user_id = auth.uid()
                       AND d.organization_id = public.current_organization_id()))
  WITH CHECK (organization_id = public.current_organization_id()
              AND EXISTS (SELECT 1 FROM public.cart_drafts d
                          WHERE d.id = cart_draft_items.draft_id
                            AND d.user_id = auth.uid()
                            AND d.organization_id = public.current_organization_id()));
CREATE POLICY "cart_draft_items_delete_own" ON public.cart_draft_items
  FOR DELETE TO authenticated
  USING (organization_id = public.current_organization_id()
         AND EXISTS (SELECT 1 FROM public.cart_drafts d
                     WHERE d.id = cart_draft_items.draft_id
                       AND d.user_id = auth.uid()
                       AND d.organization_id = public.current_organization_id()));

-- 6. updated_at triggers (reuse existing public.tg_set_updated_at)
CREATE TRIGGER suppliers_set_updated_at   BEFORE UPDATE ON public.suppliers   FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER articles_set_updated_at    BEFORE UPDATE ON public.articles    FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER carts_set_updated_at       BEFORE UPDATE ON public.carts       FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER cart_drafts_set_updated_at BEFORE UPDATE ON public.cart_drafts FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
CREATE TRIGGER orders_set_updated_at      BEFORE UPDATE ON public.orders      FOR EACH ROW EXECUTE FUNCTION public.tg_set_updated_at();
