// B2c — DB-Integrationstests für Migration & Parallelbetrieb.
// Läuft NUR in CI gegen lokalen `supabase start` (siehe src/test/db-setup.ts).
//
// Geprüft:
//   (1) Idempotenz: zweiter Commit-Lauf mit gleicher Datei ⇒ identische
//       time_entries-Anzahl, zweiter Lauf zählt alle Zeilen als 'duplicate'.
//   (2) source='import' Constraint: INSERT mit source='import' erlaubt,
//       mit ungültigem Enum-Wert lehnt Postgres ab.
//   (3) Wasserlinie nach Commit: time_locked_through_date == max(business_date).
//   (4) RLS-Härtung: Manager-Client kann import_runs/staff_identity_map weder
//       INSERTen noch UPDATEn (silent 0-rows oder permission denied — beides ok).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  dbTestsEnabled,
  seedOrg,
  signInAsUser,
  type SeededOrg,
  type SeededUser,
} from "@/test/db-setup";
import { executeImport } from "./run-import-core";
import { bootstrapMissingStaffCore } from "./bootstrap-missing-staff";

const TA_HEADER =
  "id,employee_id,staff_name,staff_nickname,shift_date,department,start_time,end_time,absence_type,is_holiday,total_hours,evening_hours,night_hours,night_deep_hours,sunday_holiday_hours";

function taCsv(rows: { id: string; empId: string; name: string; date: string; start: string; end: string }[]): string {
  const body = rows
    .map(
      (r) =>
        `${r.id},${r.empId},${r.name},,${r.date},service,${r.start},${r.end},,false,4.5,0.5,0,0,0`,
    )
    .join("\n");
  return `${TA_HEADER}\n${body}\n`;
}

describe.skipIf(!dbTestsEnabled)("migration — Importer + RLS", () => {
  let org: SeededOrg;
  let admin: SeededUser;
  let manager: SeededUser;
  let worker: SeededUser;

  beforeAll(async () => {
    org = await seedOrg("migration");
    admin = await org.mkUser("admin");
    manager = await org.mkUser("manager");
    worker = await org.mkUser("staff");
    // Identity-Mapping: alt_id 'EMP-1' → worker.staffId, bestätigt.
    await org.service.from("staff_identity_map").insert({
      organization_id: org.orgId,
      source_system: "tagesabrechnung",
      alt_id: "EMP-1",
      alt_name: "Anna Test",
      staff_id: worker.staffId,
      confirmed_at: new Date().toISOString(),
      confirmed_by: admin.userId,
    });
  });
  afterAll(async () => {
    await org.service.from("import_runs").delete().eq("organization_id", org.orgId);
    await org.service.from("staff_identity_map").delete().eq("organization_id", org.orgId);
    await org.cleanup();
  });

  it("(2) source='import' ist erlaubt; ungültiger Enum-Wert wird abgelehnt", async () => {
    const ok = await org.service.from("time_entries").insert({
      organization_id: org.orgId,
      staff_id: worker.staffId,
      started_at: "2026-02-10T16:00:00.000Z",
      ended_at: "2026-02-10T20:00:00.000Z",
      business_date: "2026-02-10",
      break_minutes: 0,
      source: "import",
      import_key: "constraint-check:1",
    });
    expect(ok.error).toBeNull();
    await org.service.from("time_entries").delete().eq("import_key", "constraint-check:1");

    const bad = await org.service.from("time_entries").insert({
      organization_id: org.orgId,
      staff_id: worker.staffId,
      started_at: "2026-02-10T16:00:00.000Z",
      ended_at: "2026-02-10T20:00:00.000Z",
      business_date: "2026-02-10",
      break_minutes: 0,
      // @ts-expect-error — bewusst ungültiger Enum-Wert.
      source: "foo",
      import_key: "constraint-check:bad",
    });
    expect(bad.error).not.toBeNull();
  });

  it("(1+3) Idempotenz + Wasserlinie: Doppellauf identische Zeilenzahl, Lock = max(business_date)", async () => {
    const csv = taCsv([
      { id: "S-1", empId: "EMP-1", name: "Anna Test", date: "2026-03-10", start: "17:00:00", end: "21:30:00" },
      { id: "S-2", empId: "EMP-1", name: "Anna Test", date: "2026-03-12", start: "17:00:00", end: "21:30:00" },
    ]);

    const first = await executeImport({
      admin: org.service,
      organizationId: org.orgId,
      actorUserId: admin.userId,
      actorStaffId: admin.staffId,
      sourceSystem: "tagesabrechnung",
      csvText: csv,
      mode: "commit",
    });
    expect(first.counters.imported).toBe(2);
    expect(first.lockedThrough).toBe("2026-03-12");

    const { count: afterFirst } = await org.service
      .from("time_entries")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.orgId)
      .eq("source", "import");
    expect(afterFirst).toBe(2);

    const second = await executeImport({
      admin: org.service,
      organizationId: org.orgId,
      actorUserId: admin.userId,
      actorStaffId: admin.staffId,
      sourceSystem: "tagesabrechnung",
      csvText: csv,
      mode: "commit",
    });
    expect(second.counters.imported).toBe(0);
    expect(second.counters.skippedByReason.duplicate).toBe(2);

    const { count: afterSecond } = await org.service
      .from("time_entries")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.orgId)
      .eq("source", "import");
    expect(afterSecond).toBe(2);

    const { data: settings } = await org.service
      .from("organization_settings")
      .select("time_locked_through_date")
      .eq("organization_id", org.orgId)
      .maybeSingle();
    expect(settings?.time_locked_through_date).toBe("2026-03-12");
  });

  it("(4) RLS: Manager kann import_runs/staff_identity_map weder INSERTen noch UPDATEn", async () => {
    const mgrClient = await signInAsUser(manager.email, manager.password);

    const ins = await mgrClient.from("import_runs").insert({
      organization_id: org.orgId,
      source_system: "tagesabrechnung",
      file_hash: "deadbeef",
      mode: "commit",
    });
    expect(ins.error).not.toBeNull();

    const ins2 = await mgrClient.from("staff_identity_map").insert({
      organization_id: org.orgId,
      source_system: "tagesabrechnung",
      alt_id: "MGR-HACK",
      alt_name: "Hacker",
    });
    expect(ins2.error).not.toBeNull();

    // Bestätigtes Mapping bleibt unverändert, selbst wenn ein Manager UPDATEt.
    const before = await org.service
      .from("staff_identity_map")
      .select("staff_id")
      .eq("organization_id", org.orgId)
      .eq("alt_id", "EMP-1")
      .maybeSingle();
    await mgrClient
      .from("staff_identity_map")
      .update({ staff_id: manager.staffId })
      .eq("organization_id", org.orgId)
      .eq("alt_id", "EMP-1");
    const after = await org.service
      .from("staff_identity_map")
      .select("staff_id")
      .eq("organization_id", org.orgId)
      .eq("alt_id", "EMP-1")
      .maybeSingle();
    expect(after.data?.staff_id).toBe(before.data?.staff_id);
  });

  it("(5) bootstrap: bei identischem display_name wird verknüpft statt neu angelegt", async () => {
    // Vorhandener Staff (z. B. aus regulärer Anlage).
    const { data: existing, error: insErr } = await org.service
      .from("staff")
      .insert({
        organization_id: org.orgId,
        first_name: "Bea",
        last_name: "Bestand",
        display_name: "Bea Bestand",
        is_active: true,
      })
      .select("id")
      .single();
    expect(insErr).toBeNull();

    // Mapping ohne staff_id mit identischem alt_name (Whitespace + Case egal).
    const { data: map, error: mErr } = await org.service
      .from("staff_identity_map")
      .insert({
        organization_id: org.orgId,
        source_system: "tagesabrechnung",
        alt_id: "EMP-DUP",
        alt_name: "  bea bestand  ",
      })
      .select("id")
      .single();
    expect(mErr).toBeNull();

    const res = await bootstrapMissingStaffCore({
      admin: org.service,
      organizationId: org.orgId,
      sourceSystem: "tagesabrechnung",
    });
    expect(res.linked).toBeGreaterThanOrEqual(1);

    const { data: linkedMap } = await org.service
      .from("staff_identity_map")
      .select("staff_id")
      .eq("id", map!.id)
      .single();
    expect(linkedMap?.staff_id).toBe(existing!.id);

    // Kein zweiter Staff mit demselben display_name angelegt.
    const { count } = await org.service
      .from("staff")
      .select("*", { count: "exact", head: true })
      .eq("organization_id", org.orgId)
      .eq("display_name", "Bea Bestand");
    expect(count).toBe(1);

    // Aufräumen.
    await org.service.from("staff_identity_map").delete().eq("id", map!.id);
    await org.service.from("staff").delete().eq("id", existing!.id);
  });

  it("(6) bootstrap: leeres alt_name → skipped mit Grund empty_alt_name", async () => {
    const { data: map } = await org.service
      .from("staff_identity_map")
      .insert({
        organization_id: org.orgId,
        source_system: "tagesabrechnung",
        alt_id: "EMP-EMPTY",
        alt_name: "   ",
      })
      .select("id")
      .single();

    const res = await bootstrapMissingStaffCore({
      admin: org.service,
      organizationId: org.orgId,
      sourceSystem: "tagesabrechnung",
    });
    expect(res.skippedNames.some((s) => s.altId === "EMP-EMPTY" && s.reason === "empty_alt_name"))
      .toBe(true);

    const { data: still } = await org.service
      .from("staff_identity_map")
      .select("staff_id")
      .eq("id", map!.id)
      .single();
    expect(still?.staff_id).toBeNull();

    await org.service.from("staff_identity_map").delete().eq("id", map!.id);
  });
});