// Test-Helper für DB-Integrationstests gegen einen LOKAL via `supabase start`
// hochgezogenen Stack. Wird ausschließlich von `*.db.test.ts` benutzt.
//
// Aktivierung: `SUPABASE_DB_TESTS=1` + `SUPABASE_URL` + `SUPABASE_ANON_KEY` +
// `SUPABASE_SERVICE_ROLE_KEY` aus `supabase status -o env`. Siehe
// `.github/workflows/ci.yml`, Job `db-integration`.
//
// KEIN Aufruf gegen die Produktiv-Datenbank: in CI zeigen die Env-Vars auf
// `http://127.0.0.1:54321`, lokal sind sie nicht gesetzt → Tests werden via
// `dbTestsEnabled` geskippt.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";
import type { AppRole } from "@/lib/admin/role-guard";

export const dbTestsEnabled =
  process.env.SUPABASE_DB_TESTS === "1" &&
  !!process.env.SUPABASE_URL &&
  !!process.env.SUPABASE_ANON_KEY &&
  !!process.env.SUPABASE_SERVICE_ROLE_KEY;

export function getServiceClient(): SupabaseClient<Database> {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}

export async function signInAsUser(
  email: string,
  password: string,
): Promise<SupabaseClient<Database>> {
  const client = createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_ANON_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const { error } = await client.auth.signInWithPassword({ email, password });
  if (error) throw new Error(`signIn failed for ${email}: ${error.message}`);
  return client;
}

export type SeededUser = {
  userId: string;
  staffId: string;
  email: string;
  password: string;
};

export type SeededOrg = {
  orgId: string;
  service: SupabaseClient<Database>;
  mkUser: (role: AppRole | null, opts?: { isActive?: boolean }) => Promise<SeededUser>;
  cleanup: () => Promise<void>;
};

const PASSWORD = "Test-Password-123!";

export async function seedOrg(label: string): Promise<SeededOrg> {
  const service = getServiceClient();
  const orgName = `${label}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const { data: org, error: orgErr } = await service
    .from("organizations")
    .insert({ name: orgName })
    .select("id")
    .single();
  if (orgErr || !org) throw new Error(`org insert failed: ${orgErr?.message}`);
  const orgId = org.id;

  const createdUsers: string[] = [];
  const createdStaff: string[] = [];

  const mkUser: SeededOrg["mkUser"] = async (role, opts) => {
    const tag = role ?? "none";
    const email = `${tag}-${crypto.randomUUID()}@test.local`;
    const { data: u, error: uErr } = await service.auth.admin.createUser({
      email,
      password: PASSWORD,
      email_confirm: true,
    });
    if (uErr || !u.user) throw new Error(`createUser failed: ${uErr?.message}`);
    const userId = u.user.id;
    createdUsers.push(userId);

    const { data: staff, error: sErr } = await service
      .from("staff")
      .insert({
        organization_id: orgId,
        first_name: tag,
        last_name: "Test",
        display_name: `${tag} ${userId.slice(0, 6)}`,
        email,
        is_active: opts?.isActive ?? true,
      })
      .select("id")
      .single();
    if (sErr || !staff) throw new Error(`staff insert failed: ${sErr?.message}`);
    createdStaff.push(staff.id);

    const { error: linkErr } = await service.from("user_links").insert({
      user_id: userId,
      staff_id: staff.id,
      organization_id: orgId,
    });
    if (linkErr) throw new Error(`user_links insert failed: ${linkErr.message}`);

    if (role) {
      const { error: raErr } = await service.from("role_assignments").insert({
        staff_id: staff.id,
        organization_id: orgId,
        role,
      });
      if (raErr) throw new Error(`role_assignments insert failed: ${raErr.message}`);
    }

    return { userId, staffId: staff.id, email, password: PASSWORD };
  };

  const cleanup: SeededOrg["cleanup"] = async () => {
    // Reihenfolge: abhängige Daten zuerst.
    // Kasse: sessions kaskadiert auf satelliten + waiter_settlements.
    await service.from("sessions").delete().eq("organization_id", orgId);
    await service.from("payment_terminals").delete().eq("organization_id", orgId);
    await service.from("revenue_channels").delete().eq("organization_id", orgId);
    await service.from("time_entries").delete().eq("organization_id", orgId);
    await service.from("audit_log").delete().eq("organization_id", orgId);
    await service.from("organization_settings").delete().eq("organization_id", orgId);
    await service.from("role_assignments").delete().eq("organization_id", orgId);
    await service.from("user_links").delete().eq("organization_id", orgId);
    await service.from("staff_locations").delete().eq("organization_id", orgId);
    if (createdStaff.length > 0) {
      await service.from("staff").delete().in("id", createdStaff);
    }
    await service.from("organizations").delete().eq("id", orgId);
    for (const uid of createdUsers) {
      await service.auth.admin.deleteUser(uid).catch(() => undefined);
    }
  };

  return { orgId, service, mkUser, cleanup };
}

export async function countAuditLog(
  service: SupabaseClient<Database>,
  orgId: string,
): Promise<number> {
  const { count, error } = await service
    .from("audit_log")
    .select("*", { count: "exact", head: true })
    .eq("organization_id", orgId);
  if (error) throw error;
  return count ?? 0;
}