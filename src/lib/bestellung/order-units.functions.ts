// Server-Functions für Bestell-Einheiten (Welle 1-B).
// Liste umfasst systemweite (organization_id IS NULL) + Org-eigene Einheiten.
// Anlage ist immer Org-spezifisch (Manager+).

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runGuarded } from "@/lib/admin/admin-call";
import { writeAuditLog, makeAuditWriter } from "@/lib/admin/audit";

export const listOrderUnits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("order_units")
      .select("id, organization_id, name, abbreviation, is_default")
      .or(`organization_id.is.null,organization_id.eq.${caller.organizationId}`)
      .order("name");
    if (error) throw error;
    return data ?? [];
  });

export const createOrderUnit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({
        name: z.string().trim().min(1).max(80),
        abbreviation: z.string().trim().min(1).max(20),
      })
      .parse(input),
  )
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    return runGuarded(caller.role, "manager", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: row, error } = await supabaseAdmin
        .from("order_units")
        .insert({
          organization_id: caller.organizationId,
          name: data.name,
          abbreviation: data.abbreviation,
        })
        .select("id")
        .single();
      if (error) throw error;
      return {
        result: { id: row.id },
        audit: {
          action: "order_unit.create",
          entity: "order_unit",
          entityId: row.id,
          meta: { name: data.name, abbreviation: data.abbreviation },
        },
      };
    });
  });
