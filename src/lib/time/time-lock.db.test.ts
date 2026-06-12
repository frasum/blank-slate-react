// B2b Gate (d): assertBusinessDateUnlocked schlägt fehl, wenn business_date
// ≤ time_locked_through_date — UND es wird KEIN audit_log-Eintrag geschrieben
// (weil die runGuarded-Schleife in der SFN bei Wurf vor writeAudit abbricht).
//
// Wir testen hier die reine Helper-Funktion gegen einen echten Supabase-Stack,
// damit das RLS-/Daten-Verhalten exakt dem Server-Pfad entspricht.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { dbTestsEnabled, seedOrg, type SeededOrg } from "@/test/db-setup";
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
});