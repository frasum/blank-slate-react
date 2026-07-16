// MIG2 — DB-Integrationstest: Überlappungs-Wächter gegen Doppel-Import
// nativ gestempelter Tage.
//
// Befund (16.07.): Alt-Zweitschriften zu Tagen, die in COCO bereits NATIV
// gestempelt wurden, haben keinen import_key-Treffer und würden vom MIG1-
// Duplikat-Check nicht erfasst. Diese Stufe skippt sie überlappungsbasiert
// (>= 30 min), damit echte Split-Dienste weiterhin importierbar bleiben.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dbTestsEnabled, seedOrg, type SeededOrg, type SeededUser } from "@/test/db-setup";
import { executeImport } from "./run-import-core";

const TA_HEADER =
  "id,employee_id,staff_name,staff_nickname,shift_date,department,start_time,end_time,absence_type,is_holiday,total_hours,evening_hours,night_hours,night_deep_hours,sunday_holiday_hours,restaurant";

function taRow(
  id: string,
  empId: string,
  name: string,
  date: string,
  start: string,
  end: string,
): string {
  return `${id},${empId},${name},,${date},service,${start},${end},,false,0,0,0,0,0,`;
}

describe.skipIf(!dbTestsEnabled)("MIG2 — native_overlap-Wächter", () => {
  let org: SeededOrg;
  let admin: SeededUser;
  let worker: SeededUser;

  beforeAll(async () => {
    org = await seedOrg("mig2-native-overlap");
    admin = await org.mkUser("admin");
    worker = await org.mkUser("staff");

    const { error: mapErr } = await org.service.from("staff_identity_map").insert({
      organization_id: org.orgId,
      source_system: "tagesabrechnung",
      alt_id: "EMP-1",
      alt_name: "Anna Test",
      staff_id: worker.staffId,
      confirmed_at: new Date().toISOString(),
      confirmed_by: admin.userId,
    });
    if (mapErr) throw new Error(`identity_map seed failed: ${mapErr.message}`);
  }, 60_000);

  afterAll(async () => {
    await org.service.from("time_entries").delete().eq("organization_id", org.orgId);
    await org.service.from("staff_identity_map").delete().eq("organization_id", org.orgId);
    await org.cleanup();
  });

  async function seedNative(
    businessDate: string,
    startedAt: string,
    endedAt: string,
  ): Promise<void> {
    const { error } = await org.service.from("time_entries").insert({
      organization_id: org.orgId,
      staff_id: worker.staffId,
      started_at: startedAt,
      ended_at: endedAt,
      business_date: businessDate,
      break_minutes: 0,
      source: "manual",
    });
    if (error) throw new Error(`native seed failed: ${error.message}`);
  }

  async function clearTimeEntries(): Promise<void> {
    await org.service.from("time_entries").delete().eq("organization_id", org.orgId);
  }

  async function dryRunCsv(csv: string) {
    return executeImport({
      admin: org.service,
      organizationId: org.orgId,
      actorUserId: admin.userId,
      actorStaffId: admin.staffId,
      sourceSystem: "tagesabrechnung",
      csvText: csv,
      mode: "dry_run",
    });
  }

  it("(a) Nativer Stempel 16:00–23:38 vs. CSV 15:45–23:41 → skip native_overlap", async () => {
    await clearTimeEntries();
    // 2026-07-10 (LAM-Fall): nativ 16:00–23:38 Berlin = 14:00Z–21:38Z.
    await seedNative("2026-07-10", "2026-07-10T14:00:00.000Z", "2026-07-10T21:38:00.000Z");
    const csv = `${TA_HEADER}\n${taRow("A1", "EMP-1", "Anna Test", "2026-07-10", "15:45:00", "23:41:00")}\n`;
    const res = await dryRunCsv(csv);
    expect(res.counters.read).toBe(1);
    expect(res.counters.skippedByReason.native_overlap).toBe(1);
    expect(res.counters.imported).toBe(0);
    expect(res.nativeOverlapSamples).toHaveLength(1);
    expect(res.nativeOverlapSamples[0].businessDate).toBe("2026-07-10");
  });

  it("(b) Nativ 10:00–14:00 + CSV 17:00–23:00 (disjunkt) → wird importiert", async () => {
    await clearTimeEntries();
    // Nativ 10:00–14:00 Berlin = 08:00Z–12:00Z.
    await seedNative("2026-07-11", "2026-07-11T08:00:00.000Z", "2026-07-11T12:00:00.000Z");
    const csv = `${TA_HEADER}\n${taRow("A2", "EMP-1", "Anna Test", "2026-07-11", "17:00:00", "23:00:00")}\n`;
    const res = await dryRunCsv(csv);
    expect(res.counters.skippedByReason.native_overlap).toBe(0);
    expect(res.counters.imported).toBe(1);
  });

  it("(c) Überlappung < 30 min (Randberührung) → wird importiert", async () => {
    await clearTimeEntries();
    // Nativ 12:00–17:15 Berlin = 10:00Z–15:15Z. CSV 17:00–22:00 → 15 min Überlappung.
    await seedNative("2026-07-12", "2026-07-12T10:00:00.000Z", "2026-07-12T15:15:00.000Z");
    const csv = `${TA_HEADER}\n${taRow("A3", "EMP-1", "Anna Test", "2026-07-12", "17:00:00", "22:00:00")}\n`;
    const res = await dryRunCsv(csv);
    expect(res.counters.skippedByReason.native_overlap).toBe(0);
    expect(res.counters.imported).toBe(1);
  });

  it("(d) Mitternachts-Wrap: nativ 17:00–01:00 (Folgetag) + CSV 22:00–23:30 → skip", async () => {
    await clearTimeEntries();
    // Nativ business_date 2026-07-13, 17:00 Berlin = 15:00Z, Ende 01:00 Folgetag = 2026-07-14T23:00:00Z.
    await seedNative("2026-07-13", "2026-07-13T15:00:00.000Z", "2026-07-13T23:00:00.000Z");
    const csv = `${TA_HEADER}\n${taRow("A4", "EMP-1", "Anna Test", "2026-07-13", "22:00:00", "23:30:00")}\n`;
    const res = await dryRunCsv(csv);
    expect(res.counters.skippedByReason.native_overlap).toBe(1);
    expect(res.counters.imported).toBe(0);
  });
});
