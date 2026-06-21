// Server-Functions für Inventur (Welle 2). Pro Standort eine Session.
// Pattern: createServerFn + requireSupabaseAuth + loadAdminCaller("manager")
// + Zod + supabaseAdmin mit expliziter .eq("organization_id", ...).
// Geld: BIGINT Cents; Mengen NUMERIC; line_value = round(qty * unit_price).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { writeAuditLog, makeAuditWriter } from "@/lib/admin/audit";

function computeLineValueCents(storage1: number, storage2: number, unitPriceCents: number): number {
  const qty = storage1 + storage2;
  return Math.round(qty * unitPriceCents);
}

async function recomputeSessionTotal(sessionId: string, organizationId: string): Promise<number> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data, error } = await supabaseAdmin
    .from("inventory_items")
    .select("line_value_cents")
    .eq("session_id", sessionId)
    .eq("organization_id", organizationId);
  if (error) throw error;
  const total = (data ?? []).reduce(
    (s, r) => s + Number((r as { line_value_cents: number | string }).line_value_cents ?? 0),
    0,
  );
  const { error: upErr } = await supabaseAdmin
    .from("inventory_sessions")
    .update({ total_value_cents: total })
    .eq("id", sessionId)
    .eq("organization_id", organizationId);
  if (upErr) throw upErr;
  return total;
}

export const listInventorySessions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid().optional(),
        status: z.enum(["in_progress", "completed"]).optional(),
      })
      .partial()
      .parse(input ?? {}),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    let q = supabaseAdmin
      .from("inventory_sessions")
      .select(
        "id, location_id, user_id, name, status, notes, total_value_cents, completed_at, created_at, updated_at",
      )
      .eq("organization_id", caller.organizationId)
      .order("created_at", { ascending: false });
    if (data.locationId) q = q.eq("location_id", data.locationId);
    if (data.status) q = q.eq("status", data.status);
    const { data: rows, error } = await q;
    if (error) throw error;
    return rows ?? [];
  });

export const createInventorySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        locationId: z.string().uuid(),
        name: z.string().trim().min(1).max(200).optional(),
        notes: z.string().trim().max(2000).optional(),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: loc, error: locErr } = await supabaseAdmin
        .from("locations")
        .select("id")
        .eq("id", data.locationId)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (locErr) throw locErr;
      if (!loc) throw new Error("Standort gehört nicht zur Organisation.");

      const { data: row, error } = await supabaseAdmin
        .from("inventory_sessions")
        .insert({
          organization_id: caller.organizationId,
          location_id: data.locationId,
          user_id: caller.userId,
          name: data.name ?? "Inventur",
          notes: data.notes ?? null,
        })
        .select("id")
        .single();
      if (error) throw error;
      return {
        result: { id: row.id },
        audit: {
          action: "inventory.session_created",
          entity: "inventory_session",
          entityId: row.id,
          meta: { locationId: data.locationId },
        },
      };
    });
  });

export const getInventorySession = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: session, error: sErr } = await supabaseAdmin
      .from("inventory_sessions")
      .select(
        "id, location_id, user_id, name, status, notes, total_value_cents, completed_at, created_at, updated_at",
      )
      .eq("id", data.sessionId)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    if (sErr) throw sErr;
    if (!session) throw new Error("Inventur nicht gefunden.");

    const { data: items, error: iErr } = await supabaseAdmin
      .from("inventory_items")
      .select(
        "id, article_id, storage_1, storage_2, total_qty, unit_price_cents, line_value_cents, updated_at",
      )
      .eq("session_id", session.id)
      .eq("organization_id", caller.organizationId);
    if (iErr) throw iErr;

    const { data: articles, error: aErr } = await supabaseAdmin
      .from("articles")
      .select("id, name, sku, unit, price_cents, category, supplier_id, sort_order")
      .eq("organization_id", caller.organizationId)
      .eq("is_active", true)
      .order("sort_order")
      .order("name");
    if (aErr) throw aErr;

    const byArticle = new Map<
      string,
      {
        id: string;
        storage_1: number;
        storage_2: number;
        total_qty: number;
        unit_price_cents: number;
        line_value_cents: number;
        updated_at: string;
      }
    >();
    for (const it of items ?? []) {
      byArticle.set(it.article_id, {
        id: it.id,
        storage_1: Number(it.storage_1),
        storage_2: Number(it.storage_2),
        total_qty: Number(it.total_qty),
        unit_price_cents: Number(it.unit_price_cents),
        line_value_cents: Number(it.line_value_cents),
        updated_at: it.updated_at,
      });
    }

    const rows = (articles ?? []).map((a) => {
      const it = byArticle.get(a.id);
      return {
        article: {
          id: a.id,
          name: a.name,
          sku: a.sku,
          unit: a.unit,
          category: a.category,
          supplier_id: a.supplier_id,
          price_cents: Number(a.price_cents),
        },
        item: it ?? null,
      };
    });

    return { session, rows };
  });

export const upsertInventoryItem = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        sessionId: z.string().uuid(),
        articleId: z.string().uuid(),
        storage1: z.number().min(0).max(1_000_000),
        storage2: z.number().min(0).max(1_000_000),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: session, error: sErr } = await supabaseAdmin
        .from("inventory_sessions")
        .select("id, status")
        .eq("id", data.sessionId)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!session) throw new Error("Inventur nicht gefunden.");
      if (session.status !== "in_progress") {
        throw new Error("Inventur ist abgeschlossen.");
      }

      const { data: article, error: aErr } = await supabaseAdmin
        .from("articles")
        .select("id, price_cents")
        .eq("id", data.articleId)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (aErr) throw aErr;
      if (!article) throw new Error("Artikel gehört nicht zur Organisation.");

      const unitPrice = Number(article.price_cents);
      const lineValue = computeLineValueCents(data.storage1, data.storage2, unitPrice);

      const { error: upErr } = await supabaseAdmin.from("inventory_items").upsert(
        {
          organization_id: caller.organizationId,
          session_id: data.sessionId,
          article_id: data.articleId,
          storage_1: data.storage1,
          storage_2: data.storage2,
          unit_price_cents: unitPrice,
          line_value_cents: lineValue,
        },
        { onConflict: "session_id,article_id" },
      );
      if (upErr) throw upErr;

      const total = await recomputeSessionTotal(data.sessionId, caller.organizationId);

      return {
        result: { ok: true as const, lineValueCents: lineValue, totalValueCents: total },
        audit: {
          action: "inventory.item_upserted",
          entity: "inventory_item",
          entityId: data.sessionId,
          meta: {
            articleId: data.articleId,
            storage1: data.storage1,
            storage2: data.storage2,
            lineValueCents: lineValue,
          },
        },
      };
    });
  });

export const completeInventorySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: session, error: sErr } = await supabaseAdmin
        .from("inventory_sessions")
        .select("id, status")
        .eq("id", data.sessionId)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (sErr) throw sErr;
      if (!session) throw new Error("Inventur nicht gefunden.");
      if (session.status === "completed") {
        throw new Error("Inventur ist bereits abgeschlossen.");
      }

      const total = await recomputeSessionTotal(data.sessionId, caller.organizationId);

      const { error } = await supabaseAdmin
        .from("inventory_sessions")
        .update({
          status: "completed",
          completed_at: new Date().toISOString(),
          total_value_cents: total,
        })
        .eq("id", data.sessionId)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;

      return {
        result: { ok: true as const, totalValueCents: total },
        audit: {
          action: "inventory.completed",
          entity: "inventory_session",
          entityId: data.sessionId,
          meta: { totalValueCents: total },
        },
      };
    });
  });

export const deleteInventorySession = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ sessionId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("inventory_sessions")
        .delete()
        .eq("id", data.sessionId)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: "inventory.deleted",
          entity: "inventory_session",
          entityId: data.sessionId,
        },
      };
    });
  });
