// Konto-Verwaltung für Mitarbeiter (Teil A des Login-Umbaus).
//
// Alle schreibenden Aktionen sind admin-only und laufen über runGuarded
// (Rollencheck VOR DB-Schreiben, audit_log NUR bei Erfolg).
// supabaseAdmin wird im Handler dynamic-importiert (kein Leak ins Client-Bundle).
//
// Sicherheit:
// - Standardpasswort wird hier erzeugt und EINMAL als Klartext zurückgegeben.
//   Der Klartext wird NICHT in der DB gespeichert, NICHT geloggt — die UI ist
//   die einzige Stelle, an der er sichtbar wird.
// - must_change_password=true zwingt den Mitarbeiter beim nächsten Login zum
//   eigenen Passwort.

import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { loadAdminCaller } from "./admin-context";
import { runGuarded } from "./admin-call";
import { writeAuditLog } from "./audit";
import { generateStandardPassword } from "./password-generator";

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

// =========================================================================
// Status lesen (admin/manager)
// =========================================================================

export const getStaffAccountStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ staffId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "manager");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: link } = await supabaseAdmin
      .from("user_links")
      .select("user_id")
      .eq("staff_id", data.staffId)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();

    const { data: staff } = await supabaseAdmin
      .from("staff")
      .select("email, must_change_password")
      .eq("id", data.staffId)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();

    let authEmail: string | null = null;
    if (link?.user_id) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(link.user_id);
      authEmail = u?.user?.email ?? null;
    }

    return {
      hasAccount: !!link?.user_id,
      email: authEmail,
      staffEmail: staff?.email ?? null,
      mustChangePassword: staff?.must_change_password ?? false,
    };
  });

// =========================================================================
// Konto anlegen (admin)
// =========================================================================

const createSchema = z.object({
  staffId: z.string().uuid(),
  email: z.string().trim().min(3).max(254),
});

export const createStaffAccount = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => createSchema.parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      // Verifizieren: staff gehört zur Org und hat noch kein Konto.
      const { data: staff, error: staffErr } = await supabaseAdmin
        .from("staff")
        .select("id, organization_id")
        .eq("id", data.staffId)
        .eq("organization_id", caller.organizationId)
        .maybeSingle();
      if (staffErr) throw staffErr;
      if (!staff) throw new Error("Mitarbeiter nicht gefunden.");

      const { data: existingLink } = await supabaseAdmin
        .from("user_links")
        .select("user_id")
        .eq("staff_id", data.staffId)
        .maybeSingle();
      if (existingLink?.user_id) {
        throw new Error("Dieser Mitarbeiter hat bereits ein Konto.");
      }

      const password = generateStandardPassword();

      const { data: created, error: createErr } = await supabaseAdmin.auth.admin.createUser({
        email: data.email,
        password,
        email_confirm: true,
        app_metadata: { staff_id: data.staffId },
      });
      if (createErr || !created.user) {
        throw new Error(createErr?.message ?? "Konto konnte nicht erstellt werden.");
      }

      const { error: linkErr } = await supabaseAdmin.from("user_links").insert({
        user_id: created.user.id,
        staff_id: data.staffId,
        organization_id: staff.organization_id,
      });
      if (linkErr) throw linkErr;

      const { error: flagErr } = await supabaseAdmin
        .from("staff")
        .update({ must_change_password: true, email: data.email })
        .eq("id", data.staffId);
      if (flagErr) throw flagErr;

      return {
        // Passwort wird NUR hier (Antwort an die UI) zurückgegeben.
        result: { password, email: data.email },
        audit: {
          action: "staff.account_created",
          entity: "staff",
          entityId: data.staffId,
          meta: { email: data.email },
        },
      };
    });
  });

// =========================================================================
// Passwort zurücksetzen (admin)
// =========================================================================

export const resetStaffPassword = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ staffId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const caller = await loadAdminCaller(context.supabase, context.userId, "admin");
    return runGuarded(caller.role, "admin", makeAuditWriter(caller), async () => {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

      const { data: link } = await supabaseAdmin
        .from("user_links")
        .select("user_id, organization_id")
        .eq("staff_id", data.staffId)
        .maybeSingle();
      if (!link?.user_id || link.organization_id !== caller.organizationId) {
        throw new Error("Mitarbeiter hat noch kein Konto.");
      }

      const password = generateStandardPassword();
      const { error: updErr } = await supabaseAdmin.auth.admin.updateUserById(link.user_id, {
        password,
      });
      if (updErr) throw updErr;

      const { error: flagErr } = await supabaseAdmin
        .from("staff")
        .update({ must_change_password: true })
        .eq("id", data.staffId);
      if (flagErr) throw flagErr;

      return {
        result: { password },
        audit: {
          action: "staff.password_reset",
          entity: "staff",
          entityId: data.staffId,
        },
      };
    });
  });
