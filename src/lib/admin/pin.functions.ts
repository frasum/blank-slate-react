// PIN-Verwaltung (B1c). Admin setzt oder löscht den PIN-Hash für einen
// Mitarbeiter. Validierung des Format (4–8 Ziffern) als reine Funktion.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "./admin-context";
import { runGuarded } from "./admin-call";
import { writeAuditLog, makeAuditWriter } from "./audit";
import { assertValidPinFormat } from "./pin-format";

export const setPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ staffId: z.string().uuid(), pin: z.string() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    assertValidPinFormat(data.pin);
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const bcrypt = (await import("bcryptjs")).default;
      const hash = await bcrypt.hash(data.pin, 10);
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      // Vorhandenen Eintrag entfernen, dann neuen einfügen (eindeutig pro staff).
      const { error: delErr } = await supabaseAdmin
        .from("staff_pins")
        .delete()
        .eq("staff_id", data.staffId)
        .eq("organization_id", caller.organizationId);
      if (delErr) throw delErr;
      const { error: insErr } = await supabaseAdmin.from("staff_pins").insert({
        staff_id: data.staffId,
        organization_id: caller.organizationId,
        pin_hash: hash,
      });
      if (insErr) throw insErr;
      return {
        result: { ok: true as const },
        audit: {
          // NIE den PIN oder Hash ins audit_log schreiben.
          action: "staff.set_pin",
          entity: "staff",
          entityId: data.staffId,
        },
      };
    });
  });

export const clearPin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ staffId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { error } = await supabaseAdmin
        .from("staff_pins")
        .delete()
        .eq("staff_id", data.staffId)
        .eq("organization_id", caller.organizationId);
      if (error) throw error;
      return {
        result: { ok: true as const },
        audit: { action: "staff.clear_pin", entity: "staff", entityId: data.staffId },
      };
    });
  });
