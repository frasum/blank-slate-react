// Echtes Impersonate: ein Admin kann temporär in die Identität eines
// Mitarbeiters wechseln. Sämtliche SECURITY-DEFINER-Helfer
// (current_role, current_staff_id, current_organization_id, has_role)
// lösen die Identität in dieser Zeit über admin_impersonations auf, sodass
// RLS und Sichtbarkeiten exakt wie für den Mitarbeiter arbeiten.
//
// WICHTIG: Start/Stop/List laufen NIE über is_admin() (das spiegelt
// während einer Impersonation die Rolle des Mitarbeiters), sondern über
// is_real_admin(), das direkt auf auth.uid() prüft.

import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { writeAuditLog } from "./audit";
import { resolveActiveImpersonation } from "./impersonation";
import { expectMaybe, expectOk, expectVoid } from "@/lib/supabase/expect-ok";

export type ImpersonationStaffOption = {
  staffId: string;
  displayName: string;
  role: "admin" | "manager" | "staff" | "payroll" | null;
  userId: string | null;
  hasAccount: boolean;
};

export type ImpersonationStatus = {
  active: boolean;
  asStaffId: string | null;
  asDisplayName: string | null;
  since: string | null;
};

async function assertRealAdmin(supabase: {
  rpc: (fn: string) => Promise<{ data: unknown; error: { message: string } | null }>;
}): Promise<void> {
  const data = expectMaybe<unknown>(await supabase.rpc("is_real_admin"), "assertRealAdmin");
  if (data !== true) throw new Error("Forbidden");
}

export const listStaffForImpersonation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImpersonationStaffOption[]> => {
    await assertRealAdmin(context.supabase as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Aktive Mitarbeiter der Org des Admins.
    const orgId = expectMaybe<string>(
      await context.supabase.rpc("current_organization_id"),
      "listStaffForImpersonation.orgId",
    );
    if (!orgId) return [];

    const staff = expectOk<
      {
        id: string;
        display_name: string | null;
        first_name: string | null;
        last_name: string | null;
      }[]
    >(
      await supabaseAdmin
        .from("staff")
        .select("id, display_name, first_name, last_name")
        .eq("organization_id", orgId)
        .order("display_name", { ascending: true }),
      "listStaffForImpersonation.staff",
    );

    const ids = (staff ?? []).map((s) => s.id);
    if (ids.length === 0) return [];

    const [linksRes, rolesRes] = await Promise.all([
      supabaseAdmin
        .from("user_links")
        .select("staff_id, user_id, organization_id")
        .eq("organization_id", orgId)
        .in("staff_id", ids),
      supabaseAdmin
        .from("role_assignments")
        .select("staff_id, role")
        .eq("organization_id", orgId)
        .in("staff_id", ids),
    ]);
    const links = expectOk<{ staff_id: string; user_id: string; organization_id: string }[]>(
      linksRes,
      "listStaffForImpersonation.links",
    );
    const roles = expectOk<{ staff_id: string; role: string }[]>(
      rolesRes,
      "listStaffForImpersonation.roles",
    );

    const linkByStaff = new Map<string, string>();
    for (const l of links ?? []) linkByStaff.set(l.staff_id, l.user_id);
    const roleByStaff = new Map<string, ImpersonationStaffOption["role"]>();
    for (const r of roles ?? []) roleByStaff.set(r.staff_id, r.role as never);

    return (staff ?? [])
      .filter((s) => s.id !== null)
      .map((s) => {
        const userId = linkByStaff.get(s.id) ?? null;
        const displayName =
          s.display_name?.trim() ||
          [s.first_name, s.last_name].filter(Boolean).join(" ").trim() ||
          s.id.slice(0, 8);
        return {
          staffId: s.id,
          displayName,
          role: roleByStaff.get(s.id) ?? null,
          userId,
          hasAccount: userId !== null,
        };
      })
      .sort((a, b) => a.displayName.localeCompare(b.displayName, "de"));
  });

export const getImpersonationStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImpersonationStatus> => {
    // IMP2: über die zentrale Auflösung — löst automatisch abgelaufene
    // Sitzungen (inkl. Audit) auf und liefert dann `null`.
    const imp = await resolveActiveImpersonation(context.supabase, context.userId);
    if (!imp) {
      return { active: false, asStaffId: null, asDisplayName: null, since: null };
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // H2-BEFUND: reine Anzeige-Kante (Impersonations-Banner-Text). Ein
    // Postgrest-Ausfall darf die aktive Vorschau nicht scheinbar deaktivieren
    // — Fallback ist die id-Slice als Anzeige-Name.
    const { data: staff } = await supabaseAdmin
      .from("staff")
      .select("display_name, first_name, last_name")
      .eq("id", imp.targetStaffId)
      .maybeSingle();
    const displayName =
      staff?.display_name?.trim() ||
      [staff?.first_name, staff?.last_name].filter(Boolean).join(" ").trim() ||
      imp.targetStaffId.slice(0, 8);

    return {
      active: true,
      asStaffId: imp.targetStaffId,
      asDisplayName: displayName,
      since: imp.startedAt,
    };
  });

export const startImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { staffId: string; reason: string }) => {
    if (!input?.staffId) throw new Error("staffId fehlt");
    const reason = (input.reason ?? "").trim();
    if (reason.length < 3) throw new Error("Grund (mind. 3 Zeichen) angeben.");
    return { staffId: input.staffId, reason };
  })
  .handler(async ({ data, context }) => {
    await assertRealAdmin(context.supabase as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const orgId = expectMaybe<string>(
      await context.supabase.rpc("current_organization_id"),
      "startImpersonation.orgId",
    );
    if (!orgId) throw new Error("Keine Organisation gefunden.");

    // Ziel-Staff muss in derselben Org liegen und einen verknüpften User haben.
    const staff = expectMaybe<{ id: string; organization_id: string }>(
      await supabaseAdmin
        .from("staff")
        .select("id, organization_id")
        .eq("id", data.staffId)
        .maybeSingle(),
      "startImpersonation.staff",
    );
    if (!staff) throw new Error("Mitarbeiter nicht gefunden.");
    if (staff.organization_id !== orgId)
      throw new Error("Mitarbeiter gehört nicht zur Organisation.");

    const link = expectMaybe<{ user_id: string }>(
      await supabaseAdmin
        .from("user_links")
        .select("user_id")
        .eq("staff_id", data.staffId)
        .eq("organization_id", orgId)
        .maybeSingle(),
      "startImpersonation.link",
    );
    if (!link?.user_id) {
      throw new Error("Dieser Mitarbeiter hat keinen Account – Impersonate nicht möglich.");
    }

    // H2-BEFUND: best-effort Cleanup vorheriger offener Sitzungen. Ein Fehler
    // hier darf den Start der neuen Sitzung nicht blockieren (der Insert unten
    // ist die eigentliche Wahrheit); deshalb bewusst kein expectVoid.
    await supabaseAdmin
      .from("admin_impersonations")
      .update({ ended_at: new Date().toISOString() })
      .eq("admin_user_id", context.userId)
      .is("ended_at", null);

    const inserted = expectOk<{ id: string }>(
      await supabaseAdmin
        .from("admin_impersonations")
        .insert({
          organization_id: orgId,
          admin_user_id: context.userId,
          target_staff_id: data.staffId,
          target_user_id: link.user_id,
          reason: data.reason,
        })
        .select("id")
        .single(),
      "startImpersonation.insert",
    );

    await writeAuditLog({
      organizationId: orgId,
      actorUserId: context.userId,
      actorStaffId: null,
      action: "admin.impersonation_started",
      entity: "staff",
      entityId: data.staffId,
      meta: { impersonation_id: inserted.id, reason: data.reason },
    });

    return { ok: true, impersonationId: inserted.id };
  });

export const stopImpersonation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    // KEIN is_real_admin-Check: wer eine offene Sitzung hat, muss sie auch beenden
    // können (selbst wenn die effektive Rolle gerade nicht admin ist).
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const open = expectMaybe<{ id: string; organization_id: string; target_staff_id: string }>(
      await supabaseAdmin
        .from("admin_impersonations")
        .select("id, organization_id, target_staff_id")
        .eq("admin_user_id", context.userId)
        .is("ended_at", null)
        .maybeSingle(),
      "stopImpersonation.open",
    );
    if (!open) return { ok: true, wasActive: false };

    expectVoid(
      await supabaseAdmin
        .from("admin_impersonations")
        .update({ ended_at: new Date().toISOString() })
        .eq("id", open.id),
      "stopImpersonation.update",
    );

    await writeAuditLog({
      organizationId: open.organization_id,
      actorUserId: context.userId,
      actorStaffId: null,
      action: "admin.impersonation_stopped",
      entity: "staff",
      entityId: open.target_staff_id,
      meta: { impersonation_id: open.id },
    });

    return { ok: true, wasActive: true };
  });
