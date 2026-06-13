// B2b Gate (d): assertBusinessDateUnlocked schlägt fehl, wenn business_date
// ≤ time_locked_through_date — UND es wird KEIN audit_log-Eintrag geschrieben
// (weil die runGuarded-Schleife in der SFN bei Wurf vor writeAudit abbricht).
//
// Wir testen hier die reine Helper-Funktion gegen einen echten Supabase-Stack,
// damit das RLS-/Daten-Verhalten exakt dem Server-Pfad entspricht.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dbTestsEnabled, seedOrg, signInAsUser, type SeededOrg } from "@/test/db-setup";
import { assertBusinessDateUnlocked, loadTimeLock, TimeLockedError } from "./time-lock";

describe.skipIf(!dbTestsEnabled)("time-lock — Wasserlinie", () => {
  let org: SeededOrg;

  beforeAll(async () => {
    org = await seedOrg("time-lock");
  });
  afterAll(async () => {
    await org.cleanup();
  });

  it("(setup) Migration legt eine organization_settings-Zeile pro Org an", async () => {
    const { data, error } = await org.service
      .from("organization_settings")
      .select("organization_id, time_locked_through_date")
      .eq("organization_id", org.orgId)
      .maybeSingle();
    expect(error).toBeNull();
    expect(data).not.toBeNull();
    expect(data?.time_locked_through_date).toBeNull();
  });

  it("(d) Datum ≤ Wasserlinie wirft TimeLockedError", async () => {
    await org.service
      .from("organization_settings")
      .update({ time_locked_through_date: "2026-01-15" })
      .eq("organization_id", org.orgId);

    const through = await loadTimeLock(org.service, org.orgId);
    expect(through).toBe("2026-01-15");

    await expect(
      assertBusinessDateUnlocked(org.service, org.orgId, "2026-01-15"),
    ).rejects.toBeInstanceOf(TimeLockedError);
    await expect(
      assertBusinessDateUnlocked(org.service, org.orgId, "2026-01-14"),
    ).rejects.toBeInstanceOf(TimeLockedError);
    // Datum nach der Wasserlinie ist offen
    await expect(
      assertBusinessDateUnlocked(org.service, org.orgId, "2026-01-16"),
    ).resolves.toBeUndefined();
  });

  it("(härtung) UPDATE auf organization_settings als Admin via authenticated-Client wird von RLS abgelehnt", async () => {
    const admin = await org.mkUser("admin");
    const adminClient = await signInAsUser(admin.email, admin.password);

    // Lesen ist erlaubt (SELECT-Policy bleibt).
    const read = await adminClient
      .from("organization_settings")
      .select("organization_id, time_locked_through_date")
      .eq("organization_id", org.orgId)
      .maybeSingle();
    expect(read.error).toBeNull();
    expect(read.data).not.toBeNull();

    // UPDATE muss von RLS/GRANT abgelehnt werden — entweder Fehler oder 0 betroffene Zeilen,
    // und der Wert in der DB darf sich NICHT ändern.
    const before = read.data?.time_locked_through_date ?? null;
    const upd = await adminClient
      .from("organization_settings")
      .update({ time_locked_through_date: "2030-12-31" })
      .eq("organization_id", org.orgId)
      .select("organization_id");
    // Egal ob hard error (permission denied) oder silent 0 rows: der Wert in der DB
    // darf sich nicht geändert haben. Beides ist akzeptables RLS/GRANT-Verhalten.
    const after = await org.service
      .from("organization_settings")
      .select("time_locked_through_date")
      .eq("organization_id", org.orgId)
      .maybeSingle();
    expect(after.error).toBeNull();
    expect(after.data?.time_locked_through_date ?? null).toBe(before);
    // Wenn kein Fehler kam, muss das affected-rows-Array leer sein.
    if (!upd.error) {
      expect(upd.data ?? []).toEqual([]);
    }

    // INSERT muss ebenfalls scheitern (kein neuer Datensatz für eine andere Org).
    const ins = await adminClient
      .from("organization_settings")
      .insert({ organization_id: org.orgId, time_locked_through_date: "2030-12-31" });
    expect(ins.error).not.toBeNull();
  });
});
