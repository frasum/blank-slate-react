// Z5 — DB-Integrationstest für den Planer-Editier-Guard auf time_entries.
//
// Rekonstruiert exakt die Pipeline aus dem `deleteTimeEntry`-Handler in
// `src/lib/time/time-admin.functions.ts` (loadAdminCaller → Rollen-Gate →
// Billing-Cycle-Guard für Planer → runWithPermission("time.entry.edit") →
// _deleteTimeEntryCore → makeAuditWriter). Direkt aufrufbar ist der
// createServerFn-Handler in DB-Tests nicht (Middleware `requireSupabaseAuth`
// verlangt HTTP-Kontext); die Suite verankert stattdessen dieselben
// Bausteine, die der Handler in Reihenfolge verdrahtet — siehe das analoge
// Muster in `time-admin-all-locations.db.test.ts`.
//
// Fälle (Datumseeds relativ zu `todayIso()` — Test läuft an jedem Kalendertag):
//   (a) Planer mit `time.entry.edit`-Override, Eintrag im laufenden Zyklus
//       (26.–25., heute enthalten) → Erfolg, audit_log-Zeile
//       `time_entry.manual_delete` vorhanden.
//   (b) Planer, Eintrag mit business_date VOR Zyklusbeginn → abgelehnt mit
//       deutscher Fehlermeldung; KEIN audit_log-Eintrag; Zeile bleibt.
//   (c) Planer OHNE `time.entry.edit`-Override → ForbiddenError aus
//       assertPermission; KEIN audit_log-Eintrag; Zeile bleibt.
//   (d) Staff → loadAdminCaller wirft ForbiddenError (Bestandsverhalten:
//       Rollen-Gate lässt nur manager/admin/planer zu).
//   (e) Manager, Eintrag außerhalb des laufenden Zyklus → weiterhin erlaubt
//       (Billing-Cycle-Guard greift ausschließlich für Planer).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  countAuditLog,
  dbTestsEnabled,
  seedOrg,
  signInAsUser,
  type SeededOrg,
  type SeededUser,
} from "@/test/db-setup";
import { loadAdminCaller } from "@/lib/admin/admin-context";
import { runWithPermission } from "@/lib/admin/admin-call";
import { ForbiddenError } from "@/lib/admin/role-guard";
import { makeAuditWriter } from "@/lib/admin/audit";
import { todayIso } from "@/lib/format";
import { currentBillingCycle, isInCurrentBillingCycle } from "./billing-cycle";
import { _deleteTimeEntryCore } from "./time-admin.functions";

describe.skipIf(!dbTestsEnabled)("time_entries — Planer-Editier-Guard (Z5)", () => {
  let org: SeededOrg;
  let planer: SeededUser;
  let manager: SeededUser;
  let staff: SeededUser;

  // Datums-Seeds relativ zu heute — damit der Test an jedem Kalendertag läuft.
  const TODAY = todayIso();
  const { startDate: CYCLE_START } = currentBillingCycle(TODAY);

  // "Heute" für den Zyklus-Treffer (garantiert innerhalb der laufenden Periode).
  const IN_CYCLE = TODAY;
  // Zyklusstart − 5 Tage → sicher vor Zyklusbeginn (Kalender-Arithmetik über
  // Date-UTC, damit Monatsgrenzen korrekt fallen).
  const beforeStart = new Date(`${CYCLE_START}T12:00:00Z`);
  beforeStart.setUTCDate(beforeStart.getUTCDate() - 5);
  const BEFORE_CYCLE = beforeStart.toISOString().slice(0, 10);

  beforeAll(async () => {
    org = await seedOrg("time-planer-edit");
    planer = await org.mkUser("planer");
    manager = await org.mkUser("manager");
    staff = await org.mkUser("staff");

    // §96-Regel: Vor jedem Test-Seed prüfen, dass die Voraussetzungen des
    // Guards inhaltlich stimmen — sonst würde ein grüner Test die Regression
    // verstecken.
    if (!isInCurrentBillingCycle(IN_CYCLE, TODAY)) {
      throw new Error(`Seed-Sanity: ${IN_CYCLE} nicht im laufenden Zyklus.`);
    }
    if (isInCurrentBillingCycle(BEFORE_CYCLE, TODAY)) {
      throw new Error(`Seed-Sanity: ${BEFORE_CYCLE} fälschlich im Zyklus.`);
    }
  });
  afterAll(async () => {
    await org.cleanup();
  });

  async function insertEntry(staffId: string, businessDate: string): Promise<string> {
    const start = new Date(`${businessDate}T15:00:00Z`).toISOString();
    const end = new Date(`${businessDate}T19:00:00Z`).toISOString();
    const { data, error } = await org.service
      .from("time_entries")
      .insert({
        organization_id: org.orgId,
        staff_id: staffId,
        location_id: org.defaultLocationId,
        started_at: start,
        ended_at: end,
        business_date: businessDate,
        break_minutes: 0,
        source: "manual",
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  async function setPlanerOverride(effect: "allow" | "deny" | null): Promise<void> {
    // Delete+Insert-Muster wie in permissions-area.db.test.ts (P-3a): das
    // Unique-Constraint auf permission_overrides erlaubt kein blindes Upsert.
    await org.service
      .from("permission_overrides")
      .delete()
      .eq("staff_id", planer.staffId)
      .eq("permission", "time.entry.edit");
    if (effect === null) return;
    const { error } = await org.service.from("permission_overrides").insert({
      organization_id: org.orgId,
      staff_id: planer.staffId,
      permission: "time.entry.edit" as never,
      effect: effect as never,
      location_id: null,
      area: null as never,
    });
    if (error) throw new Error(`override insert failed: ${error.message}`);
  }

  // Mirror des deleteTimeEntry-Handlers (createServerFn-Handler ist ohne
  // requireSupabaseAuth-HTTP-Kontext nicht direkt aufrufbar). Reihenfolge
  // 1:1 wie in src/lib/time/time-admin.functions.ts (Zeilen 1584–1621):
  //   loadAdminCaller → Pre-Load → Planer-Billing-Cycle-Guard →
  //   runWithPermission("time.entry.edit", location) → _deleteTimeEntryCore →
  //   makeAuditWriter.
  async function runDeletePipeline(user: SeededUser, entryId: string): Promise<void> {
    const supabase = await signInAsUser(user.email, user.password);
    const caller = await loadAdminCaller(supabase, user.userId, ["manager", "admin", "planer"]);
    const { data: pre, error: preErr } = await org.service
      .from("time_entries")
      .select("location_id, business_date")
      .eq("id", entryId)
      .eq("organization_id", caller.organizationId)
      .maybeSingle();
    if (preErr) throw preErr;
    if (!pre) throw new Error("Eintrag nicht gefunden.");
    if (caller.role === "planer") {
      if (!isInCurrentBillingCycle(pre.business_date, todayIso())) {
        throw new Error("Planer dürfen nur Einträge der laufenden Abrechnungsperiode löschen.");
      }
    }
    await runWithPermission(
      supabase,
      "time.entry.edit",
      pre.location_id,
      makeAuditWriter(caller),
      async () => {
        const { audit } = await _deleteTimeEntryCore(
          org.service,
          caller.organizationId,
          entryId,
          "Z5-Test",
        );
        return { result: { ok: true as const }, audit };
      },
    );
  }

  async function entryStillExists(id: string): Promise<boolean> {
    const { count, error } = await org.service
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .eq("id", id);
    if (error) throw error;
    return (count ?? 0) === 1;
  }

  it("(a) Planer mit time.entry.edit im laufenden Zyklus → Erfolg + audit_log", async () => {
    await setPlanerOverride("allow");
    const id = await insertEntry(staff.staffId, IN_CYCLE);
    const auditBefore = await countAuditLog(org.service, org.orgId);

    await runDeletePipeline(planer, id);

    expect(await entryStillExists(id)).toBe(false);
    expect(await countAuditLog(org.service, org.orgId)).toBe(auditBefore + 1);
    const { data: row, error } = await org.service
      .from("audit_log")
      .select("action, entity, entity_id, actor_user_id")
      .eq("organization_id", org.orgId)
      .eq("action", "time_entry.manual_delete")
      .eq("entity_id", id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(row).not.toBeNull();
    expect(row?.entity).toBe("time_entry");
    expect(row?.actor_user_id).toBe(planer.userId);
  });

  it("(b) Planer, Eintrag VOR Zyklusbeginn → abgelehnt (deutsche Meldung), kein Audit", async () => {
    await setPlanerOverride("allow");
    const id = await insertEntry(staff.staffId, BEFORE_CYCLE);
    const auditBefore = await countAuditLog(org.service, org.orgId);

    await expect(runDeletePipeline(planer, id)).rejects.toThrow(
      /Planer dürfen nur Einträge der laufenden Abrechnungsperiode/,
    );

    expect(await entryStillExists(id)).toBe(true);
    expect(await countAuditLog(org.service, org.orgId)).toBe(auditBefore);
  });

  it("(c) Planer OHNE time.entry.edit → abgelehnt, kein Audit", async () => {
    await setPlanerOverride(null);
    const id = await insertEntry(staff.staffId, IN_CYCLE);
    const auditBefore = await countAuditLog(org.service, org.orgId);

    await expect(runDeletePipeline(planer, id)).rejects.toBeInstanceOf(ForbiddenError);

    expect(await entryStillExists(id)).toBe(true);
    expect(await countAuditLog(org.service, org.orgId)).toBe(auditBefore);
  });

  it("(d) Staff → Rollen-Gate lehnt ab (Bestandsverhalten)", async () => {
    const id = await insertEntry(staff.staffId, IN_CYCLE);
    const auditBefore = await countAuditLog(org.service, org.orgId);

    await expect(runDeletePipeline(staff, id)).rejects.toBeInstanceOf(ForbiddenError);

    expect(await entryStillExists(id)).toBe(true);
    expect(await countAuditLog(org.service, org.orgId)).toBe(auditBefore);
  });

  it("(e) Manager, Eintrag außerhalb des laufenden Zyklus → weiterhin erlaubt", async () => {
    const id = await insertEntry(staff.staffId, BEFORE_CYCLE);
    const auditBefore = await countAuditLog(org.service, org.orgId);

    await runDeletePipeline(manager, id);

    expect(await entryStillExists(id)).toBe(false);
    expect(await countAuditLog(org.service, org.orgId)).toBe(auditBefore + 1);
  });
});
