// Server-Functions für Warenkorb + Entwürfe (Welle 1-C).
// Cart ist 1-pro-User-pro-Org. Items werden roh zurückgegeben; UI joint
// gegen den bereits geladenen Artikel-/Lieferanten-Katalog (kein DB-Join,
// damit Freitext-Items konsistent bleiben). Schreibrechte: jeder
// authentifizierte Mitarbeiter (staff+). Audit-Log wird hier bewusst NICHT
// geschrieben — Warenkorb-Operationen sind Pre-Order-State und stehen
// nicht unter den Geschäftsregeln (vgl. order.create in orders.functions).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";

const ALLOWED_ROLES = ["staff", "manager", "admin"] as const;

// ---------- Active Cart ----------

async function ensureCart(
  organizationId: string,
  userId: string,
): Promise<{
  id: string;
  organization_id: string;
  user_id: string;
  location_id: string | null;
  delivery_date: string | null;
  time_window: string | null;
}> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: existing, error: selErr } = await supabaseAdmin
    .from("carts")
    .select("id, organization_id, user_id, location_id, delivery_date, time_window")
    .eq("organization_id", organizationId)
    .eq("user_id", userId)
    .maybeSingle();
  if (selErr) throw selErr;
  if (existing) return existing;
  const { data: created, error: insErr } = await supabaseAdmin
    .from("carts")
    .insert({ organization_id: organizationId, user_id: userId })
    .select("id, organization_id, user_id, location_id, delivery_date, time_window")
    .single();
  if (insErr) throw insErr;
  return created;
}

export const getActiveCart = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    const cart = await ensureCart(caller.organizationId, caller.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: items, error } = await supabaseAdmin
      .from("cart_items")
      .select(
        "id, cart_id, article_id, supplier_id, quantity, is_free_text_item, free_text_name, free_text_unit, created_at",
      )
      .eq("cart_id", cart.id)
      .order("created_at");
    if (error) throw error;
    return { cart, items: items ?? [] };
  });

export const setCartMeta = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid().nullable().optional(),
        deliveryDate: z
          .string()
          .regex(/^\d{4}-\d{2}-\d{2}$/)
          .nullable()
          .optional(),
        timeWindow: z.string().trim().max(120).nullable().optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    const cart = await ensureCart(caller.organizationId, caller.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: {
      location_id?: string | null;
      delivery_date?: string | null;
      time_window?: string | null;
    } = {};
    if (data.locationId !== undefined) patch.location_id = data.locationId;
    if (data.deliveryDate !== undefined) patch.delivery_date = data.deliveryDate;
    if (data.timeWindow !== undefined) patch.time_window = data.timeWindow || null;
    if (Object.keys(patch).length === 0) return { ok: true as const };
    const { error } = await supabaseAdmin.from("carts").update(patch).eq("id", cart.id);
    if (error) throw error;
    return { ok: true as const };
  });

const AddItemInput = z
  .object({
    quantity: z.number().int().min(1).max(9999).default(1),
    articleId: z.string().uuid().optional(),
    supplierId: z.string().uuid().optional(),
    freeTextName: z.string().trim().max(200).optional(),
    freeTextUnit: z.string().trim().max(40).optional(),
  })
  .refine((v) => !!v.articleId || (!!v.freeTextName && !!v.supplierId), {
    message: "Entweder articleId ODER (freeTextName + supplierId) angeben.",
  });

export const addCartItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => AddItemInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    const cart = await ensureCart(caller.organizationId, caller.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if (data.articleId) {
      // Katalog-Artikel: supplier_id aus DB übernehmen, Org prüfen.
      const { data: art, error: artErr } = await supabaseAdmin
        .from("articles")
        .select("id, supplier_id, organization_id")
        .eq("id", data.articleId)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (artErr) throw artErr;
      if (!art) throw new Error("Artikel nicht gefunden.");

      // Wenn bereits im Cart → Menge erhöhen statt zweite Zeile.
      const { data: existing, error: exErr } = await supabaseAdmin
        .from("cart_items")
        .select("id, quantity")
        .eq("cart_id", cart.id)
        .eq("article_id", data.articleId)
        .eq("is_free_text_item", false)
        .maybeSingle();
      if (exErr) throw exErr;
      if (existing) {
        const { error } = await supabaseAdmin
          .from("cart_items")
          .update({ quantity: existing.quantity + data.quantity })
          .eq("id", existing.id);
        if (error) throw error;
        return { id: existing.id };
      }
      const { data: row, error } = await supabaseAdmin
        .from("cart_items")
        .insert({
          organization_id: caller.organizationId,
          cart_id: cart.id,
          article_id: data.articleId,
          supplier_id: art.supplier_id,
          quantity: data.quantity,
          is_free_text_item: false,
        })
        .select("id")
        .single();
      if (error) throw error;
      return { id: row.id };
    }

    // Freitext-Artikel.
    const { data: sup, error: supErr } = await supabaseAdmin
      .from("suppliers")
      .select("id")
      .eq("id", data.supplierId!)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    if (supErr) throw supErr;
    if (!sup) throw new Error("Lieferant gehört nicht zur Organisation.");
    const { data: row, error } = await supabaseAdmin
      .from("cart_items")
      .insert({
        organization_id: caller.organizationId,
        cart_id: cart.id,
        article_id: null,
        supplier_id: data.supplierId!,
        quantity: data.quantity,
        is_free_text_item: true,
        free_text_name: data.freeTextName!,
        free_text_unit: data.freeTextUnit || "Stk",
      })
      .select("id")
      .single();
    if (error) throw error;
    return { id: row.id };
  });

export const updateCartItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ itemId: z.string().uuid(), quantity: z.number().int().min(1).max(9999) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("cart_items")
      .update({ quantity: data.quantity })
      .eq("id", data.itemId)
      .eq("organization_id", caller.organizationId);
    if (error) throw error;
    return { ok: true as const };
  });

export const removeCartItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ itemId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("cart_items")
      .delete()
      .eq("id", data.itemId)
      .eq("organization_id", caller.organizationId);
    if (error) throw error;
    return { ok: true as const };
  });

export const clearCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    const cart = await ensureCart(caller.organizationId, caller.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin.from("cart_items").delete().eq("cart_id", cart.id);
    if (error) throw error;
    return { ok: true as const };
  });

// ---------- Drafts ----------

export const listCartDrafts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("cart_drafts")
      .select(
        "id, name, location_id, desired_delivery_date, desired_time_window, notes, updated_at, created_at",
      )
      .eq("organization_id", caller.organizationId)
      .eq("user_id", caller.userId)
      .order("updated_at", { ascending: false });
    if (error) throw error;
    return data ?? [];
  });

export const saveCartAsDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(1).max(120).default("Entwurf"),
        notes: z.string().trim().max(2000).optional(),
      })
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    const cart = await ensureCart(caller.organizationId, caller.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: draftId, error: rpcErr } = await supabaseAdmin.rpc("save_cart_as_draft", {
      p_cart_id: cart.id,
      p_organization_id: caller.organizationId,
      p_user_id: caller.userId,
      p_name: data.name,
      p_notes: data.notes ?? null,
    });
    if (rpcErr) throw rpcErr;
    return { draftId: draftId as string };
  });

export const loadDraftIntoCart = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ draftId: z.string().uuid(), replace: z.boolean().default(true) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    const cart = await ensureCart(caller.organizationId, caller.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error: rpcErr } = await supabaseAdmin.rpc("load_draft_into_cart", {
      p_draft_id: data.draftId,
      p_cart_id: cart.id,
      p_organization_id: caller.organizationId,
      p_user_id: caller.userId,
      p_replace: data.replace,
    });
    if (rpcErr) throw rpcErr;
    return { ok: true as const };
  });

export const deleteCartDraft = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ draftId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, ALLOWED_ROLES);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("cart_drafts")
      .delete()
      .eq("id", data.draftId)
      .eq("organization_id", caller.organizationId)
      .eq("user_id", caller.userId);
    if (error) throw error;
    return { ok: true as const };
  });
