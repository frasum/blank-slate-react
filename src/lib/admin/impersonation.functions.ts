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
  const { data, error } = await supabase.rpc("is_real_admin");
  if (error) throw new Error(`is_real_admin failed: ${error.message}`);
  if (data !== true) throw new Error("Forbidden");
}

export const listStaffForImpersonation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<ImpersonationStaffOption[]> => {
    await assertRealAdmin(context.supabase as never);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Aktive Mitarbeiter der Org des Admins.
    const { data: orgRow, error: orgErr } = await context.supabase.rpc("current_organization_id");
    if (orgErr) throw new Error(`org lookup failed: ${orgErr.message}`);
    const orgId = orgRow as string | null;
    if (!orgId) return [];

    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, display_name, first_name, last_name")
      .eq("organization_id", orgId)
      .order("display_name", { ascending: true });
    if (staffErr) throw new Error(`staff list failed: ${staffErr.message}`);

    const ids = (staff ?? []).map((s) => s.id);
    if (ids.length === 0) return [];

    const [{ data: links }, { data: roles }] = await Promise.all([
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
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data, error } = await supabaseAdmin
      .from("admin_impersonations")
      .select("target_staff_id, started_at")
      .eq("admin_user_id", context.userId)
      .is("ended_at", null)
      .maybeSingle();
    if (error) throw new Error(`impersonation status failed: ${error.message}`);
    if (!data) return { active: false, asStaffId: null, asDisplayName: null, since: null };

    const { data: staff } = await supabaseAdmin
      .from("staff")
      .select("display_name, first_name, last_name")
      .eq("id", data.target_staff_id)
      .maybeSingle();
    const displayName =
      staff?.display_name?.trim() ||
      [staff?.first_name, staff?.last_name].filter(Boolean).join(" ").trim() ||
      data.target_staff_id.slice(0, 8);

    return {
      active: true,
      asStaffId: data.target_staff_id,
      asDisplayName: displayName,
      since: data.started_at,
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

    const { data: orgRow, error: orgErr } = await context.supabase.rpc("current_organization_id");
    if (orgErr) throw new Error(`org lookup failed: ${orgErr.message}`);
    const orgId = orgRow as string | null;
    if (!orgId) throw new Error("Keine Organisation gefunden.");

    // Ziel-Staff muss in derselben Org liegen und einen verknüpften User haben.
    const { data: staff, error: staffErr } = await supabaseAdmin
      .from("staff")
      .select("id, organization_id")
      .eq("id", data.staffId)
      .maybeSingle();
    if (staffErr || !staff) throw new Error("Mitarbeiter nicht gefunden.");
    if (staff.organization_id !== orgId)
      throw new Error("Mitarbeiter gehört nicht zur Organisation.");

    const { data: link } = await supabaseAdmin
      .from("user_links")
      .select("user_id")
      .eq("staff_id", data.staffId)
      .eq("organization_id", orgId)
      .maybeSingle();
    if (!link?.user_id) {
      throw new Error("Dieser Mitarbeiter hat keinen Account – Impersonate nicht möglich.");
    }

    // Vorhandene offene Sitzung dieses Admins beenden.
    await supabaseAdmin
      .from("admin_impersonations")
      .update({ ended_at: new Date().toISOString() })
      .eq("admin_user_id", context.userId)
      .is("ended_at", null);

    const { data: inserted, error: insErr } = await supabaseAdmin
      .from("admin_impersonations")
      .insert({
        organization_id: orgId,
        admin_user_id: context.userId,
        target_staff_id: data.staffId,
        target_user_id: link.user_id,
        reason: data.reason,
      })
      .select("id")
      .single();
    if (insErr || !inserted)
      throw new Error(`impersonation insert failed: ${insErr?.message ?? "unknown"}`);

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
    const { data: open } = await supabaseAdmin
      .from("admin_impersonations")
      .select("id, organization_id, target_staff_id")
      .eq("admin_user_id", context.userId)
      .is("ended_at", null)
      .maybeSingle();
    if (!open) return { ok: true, wasActive: false };

    const { error: updErr } = await supabaseAdmin
      .from("admin_impersonations")
      .update({ ended_at: new Date().toISOString() })
      .eq("id", open.id);
    if (updErr) throw new Error(`impersonation stop failed: ${updErr.message}`);

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
