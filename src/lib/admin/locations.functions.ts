// Standort-Verwaltung (B1c). Admin legt Standorte an, benennt sie um,
// löscht sie — Löschen NUR möglich, wenn keine staff_locations-Zuordnung
// mehr darauf zeigt.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "./admin-context";
import { runGuarded } from "./admin-call";
import { writeAuditLog } from "./audit";

function makeAuditWriter(caller: { organizationId: string; userId: string; staffId: string }) {
  return async (entry: {
    action: string;
    entity: string;
    entityId?: string;
    meta?: Record<string, unknown>;
  }) => {
    await writeAuditLog({
      organizationId: caller.organizationId,
      actorUserId: caller.userId,
      actorStaffId: caller.staffId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId ?? null,
      meta: entry.meta,
    });
  };
}

export const listLocations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("locations")
      .select("id, name, timezone")
      .eq("organization_id", caller.organizationId)
      .order("name");
    if (error) throw error;
    return data ?? [];
  });

export const createLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ name: z.string().trim().min(1).max(120) }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row, error } = await supabaseAdmin
        .from("locations")
        .insert({ organization_id: caller.organizationId, name: data.name })
        .select("id")
        .single();
      if (error) throw error;
      return {
        result: { id: row.id },
        audit: {
          action: "location.create",
          entity: "location",
          entityId: row.id,
          meta: { name: data.name },
        },
      };
    });
  });

export const updateLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ locationId: z.string().uuid(), name: z.string().trim().min(1).max(120) })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("locations")
        .update({ name: data.name })
        .eq("id", data.locationId)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: {
          action: "location.update",
          entity: "location",
          entityId: data.locationId,
          meta: { name: data.name },
        },
      };
    });
  });

export const deleteLocation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ locationId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Block, falls Mitarbeiter noch zugeordnet sind.
      const { count, error: countErr } = await supabaseAdmin
        .from("staff_locations")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", caller.organizationId)
        .eq("location_id", data.locationId);
      if (countErr) throw countErr;
      if ((count ?? 0) > 0) {
        throw new Error(
          "Standort kann nicht gelöscht werden: noch Mitarbeiter zugeordnet.",
        );
      }
      const { error } = await supabaseAdmin
        .from("locations")
        .delete()
        .eq("id", data.locationId)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: { action: "location.delete", entity: "location", entityId: data.locationId },
      };
    });
  });