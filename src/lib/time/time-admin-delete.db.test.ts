// WP1 — DB-Integrationstest für deleteTimeEntry (Kern-Helfer).
//
// (a) Löschung → Zeile weg, audit_log-Eintrag time_entry.manual_delete mit
//     vollständigem Snapshot in meta vorhanden.
// (b) Gesperrter Geschäftstag (business_date ≤ Wasserlinie) → TimeLockedError,
//     Zeile bleibt, KEIN audit_log-Eintrag.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  countAuditLog,
  dbTestsEnabled,
  seedOrg,
  type SeededOrg,
  type SeededUser,
} from "@/test/db-setup";
import { makeAuditWriter } from "@/lib/admin/audit";
import { TimeLockedError } from "./time-lock";
import { _deleteTimeEntryCore } from "./time-admin.functions";

describe.skipIf(!dbTestsEnabled)("time_entries — manual_delete (WP1)", () => {
  let org: SeededOrg;
  let manager: SeededUser;

  beforeAll(async () => {
    org = await seedOrg("time-delete");
    manager = await org.mkUser("manager");
  });
  afterAll(async () => {
    await org.cleanup();
  });

  async function insertEntry(businessDate: string): Promise<string> {
    const start = new Date(`${businessDate}T15:00:00Z`);
    const end = new Date(`${businessDate}T22:00:00Z`);
    const { data, error } = await org.service
      .from("time_entries")
      .insert({
        organization_id: org.orgId,
        staff_id: manager.staffId,
        location_id: org.defaultLocationId,
        started_at: start.toISOString(),
        ended_at: end.toISOString(),
        business_date: businessDate,
        break_minutes: 0,
        source: "manual",
      })
      .select("id")
      .single();
    if (error) throw error;
    return data.id;
  }

  it("(a) löscht Zeile und schreibt manual_delete-Audit mit Snapshot", async () => {
    const businessDate = "2027-05-10";
    const id = await insertEntry(businessDate);
    const auditBefore = await countAuditLog(org.service, org.orgId);

    const { audit } = await _deleteTimeEntryCore(
      org.service,
      org.orgId,
      id,
      "Wochenplan-Korrektur",
    );
    await makeAuditWriter({
      organizationId: org.orgId,
      userId: manager.userId,
      staffId: manager.staffId,
    })(audit);

    const gone = await org.service
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .eq("id", id);
    expect(gone.count ?? 0).toBe(0);

    const auditAfter = await countAuditLog(org.service, org.orgId);
    expect(auditAfter).toBe(auditBefore + 1);

    const { data: row, error } = await org.service
      .from("audit_log")
      .select("action, entity, entity_id, meta")
      .eq("organization_id", org.orgId)
      .eq("action", "time_entry.manual_delete")
      .eq("entity_id", id)
      .maybeSingle();
    expect(error).toBeNull();
    expect(row).not.toBeNull();
    expect(row?.entity).toBe("time_entry");
    const meta = row?.meta as {
      reason: string;
      snapshot: { id: string; business_date: string; started_at: string };
    };
    expect(meta.reason).toBe("Wochenplan-Korrektur");
    expect(meta.snapshot?.id).toBe(id);
    expect(meta.snapshot?.business_date).toBe(businessDate);
    expect(meta.snapshot?.started_at).toBeTruthy();
  });

  it("(b) gesperrter Geschäftstag → TimeLockedError, Zeile bleibt, kein Audit", async () => {
    const businessDate = "2027-06-15";
    const id = await insertEntry(businessDate);
    await org.service
      .from("organization_settings")
      .update({ time_locked_through_date: businessDate })
      .eq("organization_id", org.orgId);

    const auditBefore = await countAuditLog(org.service, org.orgId);
    await expect(
      _deleteTimeEntryCore(org.service, org.orgId, id, "Sperrtag-Test"),
    ).rejects.toBeInstanceOf(TimeLockedError);

    const still = await org.service
      .from("time_entries")
      .select("id", { count: "exact", head: true })
      .eq("id", id);
    expect(still.count ?? 0).toBe(1);

    const auditAfter = await countAuditLog(org.service, org.orgId);
    expect(auditAfter).toBe(auditBefore);

    // Wasserlinie zurücksetzen, damit spätere Tests nicht hängen.
    await org.service
      .from("organization_settings")
      .update({ time_locked_through_date: null })
      .eq("organization_id", org.orgId);
  });
});