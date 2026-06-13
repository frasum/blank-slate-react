// DB-Integrationstest für die Guard-Verdrahtung (B1c-Merkposten, in B2a
// nachgeholt). Läuft NUR in CI mit lokalem `supabase start`.
//
// Geprüft:
//   (1) Nicht-Admin-Aufruf → `loadAdminCaller(..., 'admin')` wirft
//       ForbiddenError; `runGuarded` schreibt KEINEN audit_log-Eintrag.
//   (2) Last-Admin-Schutz: bei einziger aktiver Admin-Rolle liefert die
//       Snapshot-Prüfung `wouldRemoveLastActiveAdmin === true`.
//   (3) Erfolgreicher Admin-Aufruf → audit_log-Eintrag wird geschrieben.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  dbTestsEnabled,
  seedOrg,
  signInAsUser,
  countAuditLog,
  type SeededOrg,
  type SeededUser,
} from "@/test/db-setup";
import { loadAdminCaller } from "./admin-context";
import { runGuarded } from "./admin-call";
import { ForbiddenError } from "./role-guard";
import { writeAuditLog } from "./audit";
import { wouldRemoveLastActiveAdmin, type AdminSnapshotEntry } from "./last-admin-rule";
import type { AppRole } from "./role-guard";

async function loadAdminSnapshot(org: SeededOrg): Promise<AdminSnapshotEntry[]> {
  const { data, error } = await org.service
    .from("staff")
    .select("id, is_active, role_assignments(role)")
    .eq("organization_id", org.orgId);
  if (error) throw error;
  return (data ?? []).map((row) => {
    const ra = row.role_assignments as { role: AppRole }[] | { role: AppRole } | null;
    const role = Array.isArray(ra) ? (ra[0]?.role ?? null) : (ra?.role ?? null);
    return { staffId: row.id, isActive: row.is_active, role };
  });
}

describe.skipIf(!dbTestsEnabled)("role-guard DB-Verdrahtung", () => {
  let org: SeededOrg;
  let admin: SeededUser;
  let staff: SeededUser;

  beforeAll(async () => {
    org = await seedOrg("role-guard");
    admin = await org.mkUser("admin");
    staff = await org.mkUser("staff");
  });
  afterAll(async () => {
    await org.cleanup();
  });

  it("(1) Nicht-Admin-Aufruf wird abgelehnt — KEIN audit_log-Eintrag", async () => {
    const before = await countAuditLog(org.service, org.orgId);
    const client = await signInAsUser(staff.email, staff.password);
    await expect(loadAdminCaller(client, staff.userId, "admin")).rejects.toBeInstanceOf(
      ForbiddenError,
    );
    const after = await countAuditLog(org.service, org.orgId);
    expect(after).toBe(before);
  });

  it("(2) Last-Admin-Schutz: Demotion des einzigen Admins wird erkannt", async () => {
    const snapshot = await loadAdminSnapshot(org);
    const activeAdmins = snapshot.filter((e) => e.isActive && e.role === "admin");
    expect(activeAdmins.length).toBe(1);
    expect(wouldRemoveLastActiveAdmin(snapshot, { staffId: admin.staffId, nextRole: null })).toBe(
      true,
    );
    expect(
      wouldRemoveLastActiveAdmin(snapshot, { staffId: admin.staffId, nextActive: false }),
    ).toBe(true);
  });

  it("(3) Admin-Aufruf mit runGuarded schreibt audit_log", async () => {
    const before = await countAuditLog(org.service, org.orgId);
    const client = await signInAsUser(admin.email, admin.password);
    const caller = await loadAdminCaller(client, admin.userId, "admin");
    await runGuarded(
      caller.role,
      "admin",
      (entry) =>
        writeAuditLog({
          organizationId: caller.organizationId,
          actorUserId: caller.userId,
          actorStaffId: caller.staffId,
          ...entry,
        }),
      async () => ({
        result: 1,
        audit: { action: "test.guard_wiring", entity: "test" },
      }),
    );
    const after = await countAuditLog(org.service, org.orgId);
    expect(after).toBe(before + 1);
  });
});
