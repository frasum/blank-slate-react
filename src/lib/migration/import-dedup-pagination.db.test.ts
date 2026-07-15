// MIG1-Fix — DB-Integrationstest: Duplikat-Erkennung im Zeit-Importer
// arbeitet über die PostgREST-Kappung bei 1000 Zeilen hinweg.
//
// Regression: `.select("import_key")` ohne `.range()` lieferte höchstens
// 1000 Bestands-Schlüssel. Bei realen 4094 importierten Zeilen fielen
// Duplikate ab Position 1001 durch → beim Commit doppelter Import.
//
// Setup: 1005 time_entries mit source='import' und fortlaufenden
// import_keys. Dry-Run mit CSV, deren Zeile #1003 einen bereits vorhandenen
// Schlüssel trifft und deren Zeile #9999 neu ist. Erwartung:
//   - counters.skippedByReason.duplicate === 1
//   - counters.imported === 1
//   - existingKeyCount === 1005

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  dbTestsEnabled,
  seedOrg,
  type SeededOrg,
  type SeededUser,
} from "@/test/db-setup";
import { executeImport } from "./run-import-core";

const TA_HEADER =
  "id,employee_id,staff_name,staff_nickname,shift_date,department,start_time,end_time,absence_type,is_holiday,total_hours,evening_hours,night_hours,night_deep_hours,sunday_holiday_hours,restaurant";

function taRow(id: string, empId: string, name: string, date: string): string {
  return `${id},${empId},${name},,${date},service,17:00:00,21:30:00,,false,4.5,0.5,0,0,0,`;
}

describe.skipIf(!dbTestsEnabled)("MIG1-Fix — Duplikat-Erkennung >1000 Zeilen", () => {
  let org: SeededOrg;
  let admin: SeededUser;
  let worker: SeededUser;

  beforeAll(async () => {
    org = await seedOrg("mig1-pagination");
    admin = await org.mkUser("admin");
    worker = await org.mkUser("staff");

    // Identity-Mapping für Alt-ID EMP-1 → worker.
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

    // 1005 Bestands-Einträge mit fortlaufenden import_keys.
    // Alle am gleichen Tag mit derselben Start-Zeit — der import_key
    // (= "tagesabrechnung:<altId>") ist der Eindeutigkeits-Bestandteil.
    const rows = Array.from({ length: 1005 }, (_, i) => ({
      organization_id: org.orgId,
      staff_id: worker.staffId,
      started_at: "2026-02-10T16:00:00.000Z",
      ended_at: "2026-02-10T20:00:00.000Z",
      business_date: "2026-02-10",
      break_minutes: 0,
      source: "import" as const,
      import_key: `tagesabrechnung:SEED-${i.toString().padStart(5, "0")}`,
    }));
    // Batch-Insert in 500er-Häppchen (PostgREST-freundlich).
    for (let i = 0; i < rows.length; i += 500) {
      const { error } = await org.service.from("time_entries").insert(rows.slice(i, i + 500));
      if (error) throw new Error(`seed insert failed: ${error.message}`);
    }
  }, 60_000);

  afterAll(async () => {
    await org.service.from("time_entries").delete().eq("organization_id", org.orgId);
    await org.service.from("staff_identity_map").delete().eq("organization_id", org.orgId);
    await org.cleanup();
  });

  it("Dry-Run erkennt Duplikat jenseits der ersten 1000 Bestands-Schlüssel", async () => {
    // CSV mit zwei Zeilen: eine trifft SEED-01003 (Duplikat), eine ist neu.
    const csv =
      `${TA_HEADER}\n` +
      `${taRow("SEED-01003", "EMP-1", "Anna Test", "2026-02-10")}\n` +
      `${taRow("NEW-00001", "EMP-1", "Anna Test", "2026-02-11")}\n`;

    const res = await executeImport({
      admin: org.service,
      organizationId: org.orgId,
      actorUserId: admin.userId,
      actorStaffId: admin.staffId,
      sourceSystem: "tagesabrechnung",
      csvText: csv,
      mode: "dry_run",
    });

    expect(res.existingKeyCount).toBe(1005);
    expect(res.counters.read).toBe(2);
    expect(res.counters.skippedByReason.duplicate).toBe(1);
    expect(res.counters.imported).toBe(1);
  });
});
