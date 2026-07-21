// ST1-A — Server-Functions für article_taxonomy (Kategorien & Einheiten).
// Lesen: manager+ (Dialog-Selects auf Lieferanten-Seite). Schreiben: admin.
// Bei kind='unit' wirkt Rename/Delete auf BEIDE Spalten
// order_unit UND inventory_unit (gemeinsame Einheiten-Welt, Beschluss 11a).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { makeAuditWriter } from "@/lib/admin/audit";
import { selectAllPaged } from "@/lib/supabase/select-all";
import {
  computeUnknownTaxonomyValues,
  formatDeleteBlockedMessage,
  mapTaxonomyWriteError,
  validateMergePair,
} from "./taxonomy";

const KindSchema = z.enum(["category", "unit"]);
const NameSchema = z.string().trim().min(1).max(120);

export const listTaxonomy = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const rows = await selectAllPaged<{ id: string; kind: string; name: string }>(() =>
      supabaseAdmin
        .from("article_taxonomy")
        .select("id, kind, name")
        .eq("organization_id", caller.organizationId)
        .order("id"),
    );
    const categories = rows
      .filter((r) => r.kind === "category")
      .map((r) => ({ id: r.id, name: r.name }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
    const units = rows
      .filter((r) => r.kind === "unit")
      .map((r) => ({ id: r.id, name: r.name }))
      .sort((a, b) => a.name.localeCompare(b.name, "de"));
    return { categories, units };
  });

export const createTaxonomyEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ kind: KindSchema, name: NameSchema }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row, error } = await supabaseAdmin
        .from("article_taxonomy")
        .insert({
          organization_id: caller.organizationId,
          kind: data.kind,
          name: data.name,
        })
        .select("id")
        .single();
      if (error) throw mapTaxonomyWriteError(error, data.kind, data.name);
      return {
        result: { id: row.id },
        audit: {
          action: "taxonomy.create",
          entity: "article_taxonomy",
          entityId: row.id,
          meta: { kind: data.kind, name: data.name },
        },
      };
    });
  });

export const renameTaxonomyEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ entryId: z.string().uuid(), newName: NameSchema }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    // ST1-B — No-op VOR runGuarded abfangen, damit kein Audit-Eintrag entsteht.
    // loadAdminCaller hat die Admin-Rolle bereits erzwungen; das Lesen der Zeile
    // ist ein harmloser Read.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: current, error: readErr } = await supabaseAdmin
      .from("article_taxonomy")
      .select("id, kind, name")
      .eq("id", data.entryId)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    if (readErr) throw readErr;
    if (!current) throw new Error("Eintrag nicht gefunden.");
    const kind = current.kind as "category" | "unit";
    const before = current.name;
    const after = data.newName;
    if (before === after) {
      return { articlesUpdated: 0 };
    }
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      // Listeneintrag umbenennen.
      const { data: updated, error: upErr } = await supabaseAdmin
        .from("article_taxonomy")
        .update({ name: after })
        .eq("id", data.entryId)
        .eq("organization_id", caller.organizationId)
        .select("id");
      if (upErr) throw mapTaxonomyWriteError(upErr, kind, after);
      if (!updated || updated.length === 0) throw new Error("Eintrag nicht gefunden.");

      // Artikel org-weit mitziehen.
      let articlesUpdated = 0;
      if (kind === "category") {
        const { data: rows, error } = await supabaseAdmin
          .from("articles")
          .update({ category: after })
          .eq("organization_id", caller.organizationId)
          .eq("category", before)
          .select("id");
        if (error) throw error;
        articlesUpdated = rows?.length ?? 0;
      } else {
        const { data: rowsA, error: errA } = await supabaseAdmin
          .from("articles")
          .update({ order_unit: after })
          .eq("organization_id", caller.organizationId)
          .eq("order_unit", before)
          .select("id");
        if (errA) throw errA;
        const { data: rowsB, error: errB } = await supabaseAdmin
          .from("articles")
          .update({ inventory_unit: after })
          .eq("organization_id", caller.organizationId)
          .eq("inventory_unit", before)
          .select("id");
        if (errB) throw errB;
        const ids = new Set<string>();
        for (const r of rowsA ?? []) ids.add(r.id);
        for (const r of rowsB ?? []) ids.add(r.id);
        articlesUpdated = ids.size;
      }

      return {
        result: { articlesUpdated },
        audit: {
          action: "taxonomy.rename",
          entity: "article_taxonomy",
          entityId: data.entryId,
          meta: { kind, before, after, articlesUpdated },
        },
      };
    });
  });

export const deleteTaxonomyEntry = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ entryId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: current, error: readErr } = await supabaseAdmin
        .from("article_taxonomy")
        .select("id, kind, name")
        .eq("id", data.entryId)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (readErr) throw readErr;
      if (!current) throw new Error("Eintrag nicht gefunden.");
      const kind = current.kind as "category" | "unit";
      const name = current.name;

      // Delete-Guard: darf nur weg, wenn kein Artikel den Wert nutzt.
      let usage = 0;
      if (kind === "category") {
        const { count, error } = await supabaseAdmin
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", caller.organizationId)
          .eq("category", name);
        if (error) throw error;
        usage = count ?? 0;
      } else {
        const { count: cO, error: eO } = await supabaseAdmin
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", caller.organizationId)
          .eq("order_unit", name);
        if (eO) throw eO;
        const { count: cI, error: eI } = await supabaseAdmin
          .from("articles")
          .select("id", { count: "exact", head: true })
          .eq("organization_id", caller.organizationId)
          .eq("inventory_unit", name);
        if (eI) throw eI;
        // Grobe Obergrenze — reicht für die Fehlermeldung. Für exakte
        // Deduplizierung müsste man die IDs holen; das kommt in Runde B
        // (Zusammenlegen mit Vorschau).
        usage = (cO ?? 0) + (cI ?? 0);
      }
      if (usage > 0) {
        throw new Error(formatDeleteBlockedMessage(kind, name, usage));
      }

      const { data: deleted, error: delErr } = await supabaseAdmin
        .from("article_taxonomy")
        .delete()
        .eq("id", data.entryId)
        .eq("organization_id", caller.organizationId)
        .select("id");
      if (delErr) throw delErr;
      if (!deleted || deleted.length === 0) throw new Error("Eintrag nicht gefunden.");

      return {
        result: { ok: true as const },
        audit: {
          action: "taxonomy.delete",
          entity: "article_taxonomy",
          entityId: data.entryId,
          meta: { kind, name },
        },
      };
    });
  });

// ST1-B — Merge-Preview: liest beide Einträge, validiert Kind-Gleichheit
// und Source≠Target, zählt Artikel, die den Source-Wert tragen. Zählweise wie
// beim Delete-Guard (bei unit: order_unit + inventory_unit als Obergrenze).
const MergeInput = z.object({
  sourceEntryId: z.string().uuid(),
  targetEntryId: z.string().uuid(),
});

type AdminClient = SupabaseClient<Database>;

async function loadMergePair(
  admin: AdminClient,
  organizationId: string,
  sourceId: string,
  targetId: string,
) {
  const { data: rows, error } = await admin
    .from("article_taxonomy")
    .select("id, kind, name")
    .eq("organization_id", organizationId)
    .in("id", [sourceId, targetId]);
  if (error) throw error;
  const source = rows?.find((r) => r.id === sourceId);
  const target = rows?.find((r) => r.id === targetId);
  return {
    source: source
      ? { id: source.id, kind: source.kind as "category" | "unit", name: source.name }
      : null,
    target: target
      ? { id: target.id, kind: target.kind as "category" | "unit", name: target.name }
      : null,
  };
}

async function countArticlesUsingName(
  admin: AdminClient,
  organizationId: string,
  kind: "category" | "unit",
  name: string,
): Promise<number> {
  if (kind === "category") {
    const { count, error } = await admin
      .from("articles")
      .select("id", { count: "exact", head: true })
      .eq("organization_id", organizationId)
      .eq("category", name);
    if (error) throw error;
    return count ?? 0;
  }
  const { count: cO, error: eO } = await admin
    .from("articles")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("order_unit", name);
  if (eO) throw eO;
  const { count: cI, error: eI } = await admin
    .from("articles")
    .select("id", { count: "exact", head: true })
    .eq("organization_id", organizationId)
    .eq("inventory_unit", name);
  if (eI) throw eI;
  return (cO ?? 0) + (cI ?? 0);
}

export const previewTaxonomyMerge = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => MergeInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { source, target } = await loadMergePair(
      supabaseAdmin,
      caller.organizationId,
      data.sourceEntryId,
      data.targetEntryId,
    );
    const err = validateMergePair(source, target);
    if (err) throw err;
    const articlesAffected = await countArticlesUsingName(
      supabaseAdmin,
      caller.organizationId,
      source!.kind,
      source!.name,
    );
    return {
      kind: source!.kind,
      sourceName: source!.name,
      targetName: target!.name,
      articlesAffected,
    };
  });

export const mergeTaxonomyEntries = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => MergeInput.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { source, target } = await loadMergePair(
      supabaseAdmin,
      caller.organizationId,
      data.sourceEntryId,
      data.targetEntryId,
    );
    const err = validateMergePair(source, target);
    if (err) throw err;
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const kind = source!.kind;
      const before = source!.name;
      const after = target!.name;
      let articlesUpdated = 0;
      if (kind === "category") {
        const { data: rows, error } = await supabaseAdmin
          .from("articles")
          .update({ category: after })
          .eq("organization_id", caller.organizationId)
          .eq("category", before)
          .select("id");
        if (error) throw error;
        articlesUpdated = rows?.length ?? 0;
      } else {
        const { data: rowsA, error: errA } = await supabaseAdmin
          .from("articles")
          .update({ order_unit: after })
          .eq("organization_id", caller.organizationId)
          .eq("order_unit", before)
          .select("id");
        if (errA) throw errA;
        const { data: rowsB, error: errB } = await supabaseAdmin
          .from("articles")
          .update({ inventory_unit: after })
          .eq("organization_id", caller.organizationId)
          .eq("inventory_unit", before)
          .select("id");
        if (errB) throw errB;
        const ids = new Set<string>();
        for (const r of rowsA ?? []) ids.add(r.id);
        for (const r of rowsB ?? []) ids.add(r.id);
        articlesUpdated = ids.size;
      }
      const { data: deleted, error: delErr } = await supabaseAdmin
        .from("article_taxonomy")
        .delete()
        .eq("id", data.sourceEntryId)
        .eq("organization_id", caller.organizationId)
        .select("id");
      if (delErr) throw delErr;
      if (!deleted || deleted.length === 0) throw new Error("Quelle konnte nicht gelöscht werden.");
      return {
        result: { articlesUpdated },
        audit: {
          action: "taxonomy.merge",
          entity: "article_taxonomy",
          entityId: data.targetEntryId,
          meta: { kind, source: before, target: after, articlesUpdated },
        },
      };
    });
  });

export const listUnknownTaxonomyValues = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const taxonomy = await selectAllPaged<{ kind: string; name: string }>(() =>
      supabaseAdmin
        .from("article_taxonomy")
        .select("kind, name")
        .eq("organization_id", caller.organizationId)
        .order("id"),
    );
    const articles = await selectAllPaged<{
      category: string | null;
      order_unit: string | null;
      inventory_unit: string | null;
    }>(() =>
      supabaseAdmin
        .from("articles")
        .select("category, order_unit, inventory_unit, id")
        .eq("organization_id", caller.organizationId)
        .order("id"),
    );
    return computeUnknownTaxonomyValues(
      articles,
      taxonomy.map((t) => ({ kind: t.kind as "category" | "unit", name: t.name })),
    );
  });
