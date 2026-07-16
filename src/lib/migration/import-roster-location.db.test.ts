// MIG3 — DB-Integrationstest: Standort-Anreicherung aus dem Dienstplan.
//
// Wenn die CSV keinen `restaurant`-Wert liefert, aber am selben Geschäftstag
// GENAU EIN bestätigter Roster-Standort für den aufgelösten Mitarbeiter
// existiert, wird `location_id` daraus übernommen und
// `counters.locationFromRoster` hochgezählt. Statusmenge = ('planned',
// 'confirmed') — deckungsgleich mit dem Kassen-Pool-Snapshot (KGL).

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
  restaurant = "",
): string {
  return `${id},${empId},${name},,${date},service,${start},${end},,false,0,0,0,0,0,${restaurant}`;
}

describe.skipIf(!dbTestsEnabled)("MIG3 — Standort-Anreicherung aus Dienstplan", () => {
  let org: SeededOrg;
  let admin: SeededUser;
  let worker: SeededUser;
  let locA: string;
  let locB: string;

  beforeAll(async () => {
    org = await seedOrg("mig3-roster-location");
    admin = await org.mkUser("admin");
    worker = await org.mkUser("staff");
    // Zwei benannte Standorte; der Default-Standort aus seedOrg bleibt
    // ungenutzt — die CSV liefert bewusst keine Namen.
    locA = await org.mkLocation("Spicery");
    locB = await org.mkLocation("YUM");

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
    await org.service.from("roster_shifts").delete().eq("organization_id", org.orgId);
    await org.service.from("staff_identity_map").delete().eq("organization_id", org.orgId);
    await org.cleanup();
  });

  async function seedRoster(
    shiftDate: string,
    locationId: string,
    status: "planned" | "confirmed" = "confirmed",
  ): Promise<void> {
    const { error } = await org.service.from("roster_shifts").insert({
      organization_id: org.orgId,
      staff_id: worker.staffId,
      location_id: locationId,
      shift_date: shiftDate,
      area: "service",
      status,
    });
    if (error) throw new Error(`roster seed failed: ${error.message}`);
  }

  async function clearTimeEntries(): Promise<void> {
    await org.service.from("time_entries").delete().eq("organization_id", org.orgId);
  }
  async function clearRoster(): Promise<void> {
    await org.service.from("roster_shifts").delete().eq("organization_id", org.orgId);
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

  it("(a) kein CSV-Standort + genau eine bestätigte Roster-Schicht → Anreicherung", async () => {
    await clearTimeEntries();
    await clearRoster();
    await seedRoster("2026-07-20", locA, "confirmed");
    const csv = `${TA_HEADER}\n${taRow("A1", "EMP-1", "Anna Test", "2026-07-20", "17:00:00", "23:00:00", "")}\n`;
    const res = await dryRunCsv(csv);
    expect(res.counters.read).toBe(1);
    expect(res.counters.imported).toBe(1);
    expect(res.counters.locationFromRoster).toBe(1);
    expect(res.counters.importedWithoutLocation).toBe(0);
  });

  it("(b) kein CSV-Standort + Roster an ZWEI Standorten → location_id NULL", async () => {
    await clearTimeEntries();
    await clearRoster();
    await seedRoster("2026-07-21", locA, "confirmed");
    await seedRoster("2026-07-21", locB, "planned");
    const csv = `${TA_HEADER}\n${taRow("A2", "EMP-1", "Anna Test", "2026-07-21", "17:00:00", "23:00:00", "")}\n`;
    const res = await dryRunCsv(csv);
    expect(res.counters.imported).toBe(1);
    expect(res.counters.locationFromRoster).toBe(0);
    expect(res.counters.importedWithoutLocation).toBe(1);
  });

  it("(c) kein CSV-Standort + keine Roster-Schicht → location_id NULL", async () => {
    await clearTimeEntries();
    await clearRoster();
    const csv = `${TA_HEADER}\n${taRow("A3", "EMP-1", "Anna Test", "2026-07-22", "17:00:00", "23:00:00", "")}\n`;
    const res = await dryRunCsv(csv);
    expect(res.counters.imported).toBe(1);
    expect(res.counters.locationFromRoster).toBe(0);
    expect(res.counters.importedWithoutLocation).toBe(1);
  });

  it("(d) MIT CSV-Standort → Roster wird NICHT konsultiert (Quelle hat Vorrang)", async () => {
    await clearTimeEntries();
    await clearRoster();
    // Roster zeigt locB, CSV nennt „Spicery" (locA) — die Quelle gewinnt.
    await seedRoster("2026-07-23", locB, "confirmed");
    const csv = `${TA_HEADER}\n${taRow("A4", "EMP-1", "Anna Test", "2026-07-23", "17:00:00", "23:00:00", "Spicery")}\n`;
    const res = await dryRunCsv(csv);
    expect(res.counters.imported).toBe(1);
    expect(res.counters.locationFromRoster).toBe(0);
    expect(res.counters.importedWithoutLocation).toBe(0);
  });
});
