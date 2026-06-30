// Welle 4-B — EasyOrder Resolver + Mitarbeiter-Bestellung.
//
// Sicherheitskritisch: jede Funktion leitet staffId/orgId AUSSCHLIESSLICH
// aus auth.uid() via user_links ab — niemals aus Client-Input.
// Berechtigungen (Location-Zugang, Lieferanten-Whitelist,
// can_add_free_items) werden bei Lesen UND Schreiben server-seitig
// erneut geprüft. Bestellanlage geht durch die bestehende atomare
// RPC `create_order_from_cart` (Welle 1) — keine schwächere zweite
// Schreibroute.
//
// Die `...Core`-Funktionen kapseln die reine DB-Logik (ohne
// createServerFn-Wrapper), damit DB-Integrationstests sie aufrufen
// können (siehe `easyorder.db.test.ts`).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller, type AdminCaller } from "@/lib/admin/admin-context";
import { writeAuditLog } from "@/lib/admin/audit";
import { ForbiddenError, hasMinRole, type AppRole } from "@/lib/admin/role-guard";
import { assertWithinFence } from "@/lib/geo/server-check";
import type { Database } from "@/integrations/supabase/types";

type Admin = SupabaseClient<Database>;

async function loadEasyOrderCaller(
  supabase: SupabaseClient<Database>,
  userId: string,
): Promise<AdminCaller> {
  const { data: link, error: linkErr } = await supabase
    .from("user_links")
    .select("staff_id, organization_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (linkErr || !link) throw new ForbiddenError();

  const { data: roleRow, error: roleErr } = await supabase
    .from("role_assignments")
    .select("role")
    .eq("staff_id", link.staff_id)
    .eq("organization_id", link.organization_id)
    .maybeSingle();
  if (roleErr) throw new ForbiddenError();

  return {
    userId,
    staffId: link.staff_id,
    organizationId: link.organization_id,
    role: (roleRow?.role as AppRole | undefined) ?? "staff",
  };
}

export type EasyOrderLocation = {
  locationId: string;
  locationName: string;
  canAddFreeItems: boolean;
};

export type EasyOrderContext = {
  staffId: string;
  hasEasyOrder: boolean;
  locations: EasyOrderLocation[];
};

export type EasyOrderCatalogArticle = {
  id: string;
  name: string;
  sku: string | null;
  unit: string | null;
  priceCents: number;
  category: string | null;
  supplierId: string | null;
  supplierName: string;
};

export type EasyOrderItemInput = { articleId: string; quantity: number };
export type EasyOrderFreeTextInput = {
  supplierId: string;
  name: string;
  unit?: string;
  quantity: number;
};

// ---------------------------------------------------------------------------
// Core helpers (testbar — nehmen einen supabase-client als Parameter)
// ---------------------------------------------------------------------------

export async function getMyEasyOrderContextCore(
  admin: Admin,
  caller: AdminCaller,
): Promise<EasyOrderContext> {
  const { data: access, error } = await admin
    .from("staff_easyorder_access")
    .select("location_id, can_add_free_items, is_active, locations(name)")
    .eq("organization_id", caller.organizationId)
    .eq("staff_id", caller.staffId)
    .eq("is_active", true);
  if (error) throw new Error(error.message);

  const locations: EasyOrderLocation[] = (access ?? []).map((a) => ({
    locationId: a.location_id,
    locationName: (a.locations as { name: string } | null)?.name ?? "",
    canAddFreeItems: a.can_add_free_items,
  }));

  return {
    staffId: caller.staffId,
    hasEasyOrder: locations.length > 0,
    locations,
  };
}

export async function getEasyOrderCatalogCore(
  admin: Admin,
  caller: AdminCaller,
  locationId: string,
): Promise<{ locationId: string; articles: EasyOrderCatalogArticle[] }> {
  const { data: acc } = await admin
    .from("staff_easyorder_access")
    .select("id")
    .eq("organization_id", caller.organizationId)
    .eq("staff_id", caller.staffId)
    .eq("location_id", locationId)
    .eq("is_active", true)
    .maybeSingle();
  if (!acc) throw new Error("Keine EasyOrder-Berechtigung für diesen Standort.");

  const { data: wl } = await admin
    .from("staff_easyorder_suppliers")
    .select("supplier_id")
    .eq("organization_id", caller.organizationId)
    .eq("staff_id", caller.staffId)
    .eq("location_id", locationId);
  const allowedSupplierIds = (wl ?? []).map((r) => r.supplier_id);

  // Standort-Zuordnung: nur Artikel zeigen, die für diesen Standort freigegeben
  // sind. Inner-Join auf article_locations, damit wir keine riesige IN-Liste
  // (URL-Längen-Limit von PostgREST) bauen müssen.
  let q = admin
    .from("articles")
    .select(
      "id, name, sku, unit, price_cents, category, supplier_id, suppliers(name), article_locations!inner(location_id)",
    )
    .eq("organization_id", caller.organizationId)
    .eq("is_active", true)
    .eq("article_locations.location_id", locationId);
  if (allowedSupplierIds.length > 0) q = q.in("supplier_id", allowedSupplierIds);
  const { data: articles, error } = await q.order("name");
  if (error) throw new Error(error.message);

  return {
    locationId,
    articles: (articles ?? []).map((a) => ({
      id: a.id,
      name: a.name,
      sku: a.sku,
      unit: a.unit,
      priceCents: Number(a.price_cents ?? 0),
      category: a.category,
      supplierId: a.supplier_id,
      supplierName: (a.suppliers as { name: string } | null)?.name ?? "",
    })),
  };
}

export type PlaceEasyOrderInput = {
  locationId: string;
  items: EasyOrderItemInput[];
  freeTextItems?: EasyOrderFreeTextInput[];
  notes?: string;
  geo?: { latitude: number; longitude: number; accuracyM: number };
};

export type EasyOrderSendResult = {
  orderId: string;
  ok: boolean;
  orderNumber?: string;
  error?: string;
};

export type PlaceEasyOrderResult = {
  orderIds: string[];
  autoSendAttempted: boolean;
  sendResults: EasyOrderSendResult[];
};

export async function placeEasyOrderCore(
  admin: Admin,
  caller: AdminCaller,
  input: PlaceEasyOrderInput,
): Promise<PlaceEasyOrderResult> {
  // 1. Location-Berechtigung
  const { data: acc } = await admin
    .from("staff_easyorder_access")
    .select("id, can_add_free_items")
    .eq("organization_id", caller.organizationId)
    .eq("staff_id", caller.staffId)
    .eq("location_id", input.locationId)
    .eq("is_active", true)
    .maybeSingle();
  if (!acc) throw new Error("Keine EasyOrder-Berechtigung für diesen Standort.");

  // 1b. Geofence-Check gegen den gewählten Standort.
  //     Manager und Admins sind ausgenommen (Bestellen von überall).
  if (!hasMinRole(caller.role, "manager")) {
    if (!input.geo) {
      throw new Error("Standort erforderlich.");
    }
    await assertWithinFence({
      admin,
      organizationId: caller.organizationId,
      locationId: input.locationId,
      fix: input.geo,
    });
  }

  // 2. Freitext-Gate
  const freeItems = input.freeTextItems ?? [];
  if (freeItems.length > 0 && !acc.can_add_free_items) {
    throw new Error("Freitext-Artikel sind für dich nicht freigeschaltet.");
  }

  // 3. Lieferanten-Whitelist
  const { data: wl } = await admin
    .from("staff_easyorder_suppliers")
    .select("supplier_id")
    .eq("organization_id", caller.organizationId)
    .eq("staff_id", caller.staffId)
    .eq("location_id", input.locationId);
  const allowed = new Set((wl ?? []).map((r) => r.supplier_id));
  const restricted = allowed.size > 0;

  // 4. Artikel laden + prüfen
  if (input.items.length === 0 && freeItems.length === 0) {
    throw new Error("Bestellung ist leer.");
  }
  const ids = input.items.map((i) => i.articleId);
  type ArtRow = { id: string; supplier_id: string | null; is_active: boolean };
  let arts: ArtRow[] = [];
  if (ids.length > 0) {
    const { data, error } = await admin
      .from("articles")
      .select("id, supplier_id, is_active")
      .eq("organization_id", caller.organizationId)
      .in("id", ids);
    if (error) throw new Error(error.message);
    arts = (data ?? []) as ArtRow[];
  }
  const artById = new Map(arts.map((a) => [a.id, a]));
  for (const it of input.items) {
    const a = artById.get(it.articleId);
    if (!a || !a.is_active) throw new Error("Artikel nicht verfügbar.");
    if (!a.supplier_id) throw new Error("Artikel ohne Lieferant.");
    if (restricted && !allowed.has(a.supplier_id)) {
      throw new Error("Artikel von nicht freigeschaltetem Lieferanten.");
    }
  }
  for (const fi of freeItems) {
    if (restricted && !allowed.has(fi.supplierId)) {
      throw new Error("Freitext-Lieferant nicht freigeschaltet.");
    }
  }

  // 5. Cart befüllen + atomare RPC nutzen
  await admin
    .from("carts")
    .delete()
    .eq("organization_id", caller.organizationId)
    .eq("user_id", caller.userId);

  const { data: cart, error: cartErr } = await admin
    .from("carts")
    .insert({
      organization_id: caller.organizationId,
      user_id: caller.userId,
      location_id: input.locationId,
    })
    .select("id")
    .single();
  if (cartErr || !cart) throw new Error(cartErr?.message ?? "Cart konnte nicht angelegt werden.");

  const cartRows = [
    ...input.items.map((it) => ({
      organization_id: caller.organizationId,
      cart_id: cart.id,
      article_id: it.articleId,
      supplier_id: artById.get(it.articleId)!.supplier_id,
      quantity: it.quantity,
      is_free_text_item: false,
    })),
    ...freeItems.map((fi) => ({
      organization_id: caller.organizationId,
      cart_id: cart.id,
      article_id: null,
      supplier_id: fi.supplierId,
      quantity: fi.quantity,
      is_free_text_item: true,
      free_text_name: fi.name,
      free_text_unit: fi.unit ?? "Stk",
    })),
  ];
  const { error: itemsErr } = await admin.from("cart_items").insert(cartRows);
  if (itemsErr) throw new Error(itemsErr.message);

  const { data: orderIds, error: rpcErr } = await admin.rpc("create_order_from_cart", {
    p_org_id: caller.organizationId,
    p_user_id: caller.userId,
    p_notes: input.notes ?? undefined,
  });
  if (rpcErr) throw new Error(rpcErr.message);

  const createdIds = (orderIds ?? []) as string[];

  // 6. Auto-Versand (nur wenn Mitarbeiter freigeschaltet ist).
  const { data: staffRow } = await admin
    .from("staff")
    .select("can_easyorder_auto_send")
    .eq("id", caller.staffId)
    .eq("organization_id", caller.organizationId)
    .maybeSingle();
  const autoSendAttempted = staffRow?.can_easyorder_auto_send === true;

  const sendResults: EasyOrderSendResult[] = [];
  if (autoSendAttempted && createdIds.length > 0) {
    const { sendOrderEmailWithAdmin } = await import("./send-order-email.server");
    for (const orderId of createdIds) {
      try {
        const r = await sendOrderEmailWithAdmin(admin, caller.organizationId, orderId);
        sendResults.push({ orderId, ok: true, orderNumber: r.orderNumber });
      } catch (err) {
        sendResults.push({
          orderId,
          ok: false,
          error: err instanceof Error ? err.message : "Unbekannter Fehler",
        });
      }
    }
  }

  return { orderIds: createdIds, autoSendAttempted, sendResults };
}

// ---------------------------------------------------------------------------
// createServerFn wrappers
// ---------------------------------------------------------------------------

export const getMyEasyOrderContext = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadEasyOrderCaller(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return getMyEasyOrderContextCore(supabaseAdmin, caller);
  });

const CatalogInput = z.object({ locationId: z.string().uuid() });

export const getEasyOrderCatalog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => CatalogInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadEasyOrderCaller(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    return getEasyOrderCatalogCore(supabaseAdmin, caller, data.locationId);
  });

const PlaceInput = z.object({
  locationId: z.string().uuid(),
  items: z
    .array(
      z.object({
        articleId: z.string().uuid(),
        quantity: z.number().int().min(1).max(9999),
      }),
    )
    .min(1),
  freeTextItems: z
    .array(
      z.object({
        supplierId: z.string().uuid(),
        name: z.string().trim().min(1).max(200),
        unit: z.string().trim().max(20).optional(),
        quantity: z.number().int().min(1).max(9999),
      }),
    )
    .optional(),
  notes: z.string().trim().max(500).optional(),
  geo: z
    .object({
      latitude: z.number().min(-90).max(90),
      longitude: z.number().min(-180).max(180),
      accuracyM: z.number().min(0).max(100_000),
    })
    .optional(),
});

export const placeEasyOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => PlaceInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadEasyOrderCaller(context.supabase, context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const result = await placeEasyOrderCore(supabaseAdmin, caller, data);
    await writeAuditLog({
      organizationId: caller.organizationId,
      actorUserId: caller.userId,
      actorStaffId: caller.staffId,
      action: "order.easyorder_created",
      entity: "order",
      meta: {
        orderIds: result.orderIds,
        locationId: data.locationId,
        autoSendAttempted: result.autoSendAttempted,
        sendOk: result.sendResults.filter((r) => r.ok).length,
        sendFailed: result.sendResults.filter((r) => !r.ok).length,
      },
    });
    return result;
  });
