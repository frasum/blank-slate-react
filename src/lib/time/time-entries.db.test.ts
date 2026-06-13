// DB-Integrationstests für B2a — RLS und Unique-Index auf `time_entries`.
// Läuft NUR in CI mit lokalem `supabase start`.
//
// (a) Direkter INSERT als `authenticated`-Rolle wird von RLS abgelehnt.
// (b) Zweiter offener Eintrag pro Mitarbeiter wird vom partiellen
//     Unique-Index `time_entries_one_open_per_staff` abgelehnt.
// (c) Lesezugriff auf Einträge eines anderen Mitarbeiters liefert 0 Zeilen.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  dbTestsEnabled,
  seedOrg,
  signInAsUser,
  type SeededOrg,
  type SeededUser,
} from "@/test/db-setup";
import { businessDateOf } from "@/lib/business-date";

describe.skipIf(!dbTestsEnabled)("time_entries — RLS & Unique-Index", () => {
  let org: SeededOrg;
  let userA: SeededUser;
  let userB: SeededUser;

  beforeAll(async () => {
    org = await seedOrg("time-entries");
    userA = await org.mkUser("staff");
    userB = await org.mkUser("staff");
  });
  afterAll(async () => {
    await org.cleanup();
  });

  it("(a) authenticated darf NICHT direkt in time_entries schreiben", async () => {
    const client = await signInAsUser(userA.email, userA.password);
    const now = new Date();
    const { data, error } = await client
      .from("time_entries")
      .insert({
        organization_id: org.orgId,
        staff_id: userA.staffId,
        started_at: now.toISOString(),
        business_date: businessDateOf(now),
        source: "clock",
      })
      .select();
    // Supabase/PostgREST liefert bei RLS-Verweigerung entweder einen Fehler
    // oder leere data (je nach Client-Version). Beides ist akzeptabel —
    // entscheidend: KEINE Zeile wurde tatsächlich angelegt.
    expect(error !== null || (data ?? []).length === 0).toBe(true);
    const { count } = await org.service
      .from("time_entries")
      .select("*", { count: "exact", head: true })
      .eq("staff_id", userA.staffId);
    expect(count ?? 0).toBe(0);
  });

  it("(b) zweiter offener Eintrag pro Staff wird vom Unique-Index abgelehnt", async () => {
    const now = new Date();
    const first = await org.service.from("time_entries").insert({
      organization_id: org.orgId,
      staff_id: userA.staffId,
      started_at: now.toISOString(),
      business_date: businessDateOf(now),
      source: "clock",
    });
    expect(first.error).toBeNull();

    const second = await org.service.from("time_entries").insert({
      organization_id: org.orgId,
      staff_id: userA.staffId,
      started_at: new Date(now.getTime() + 1000).toISOString(),
      business_date: businessDateOf(now),
      source: "clock",
    });
    expect(second.error).not.toBeNull();
    expect(second.error?.code).toBe("23505"); // unique_violation

    // Aufräumen: offenen Eintrag schließen, damit weitere Tests nicht hängen.
    await org.service
      .from("time_entries")
      .update({ ended_at: new Date(now.getTime() + 60_000).toISOString() })
      .eq("staff_id", userA.staffId)
      .is("ended_at", null);
  });

  it("(c) Lesezugriff auf fremde Einträge liefert 0 Zeilen", async () => {
    const now = new Date();
    const ins = await org.service.from("time_entries").insert({
      organization_id: org.orgId,
      staff_id: userB.staffId,
      started_at: now.toISOString(),
      ended_at: new Date(now.getTime() + 60_000).toISOString(),
      business_date: businessDateOf(now),
      source: "clock",
    });
    expect(ins.error).toBeNull();

    const clientA = await signInAsUser(userA.email, userA.password);
    const { data, error } = await clientA
      .from("time_entries")
      .select("id")
      .eq("staff_id", userB.staffId);
    expect(error).toBeNull();
    expect(data ?? []).toEqual([]);
  });
});
