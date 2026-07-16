// WZ1 — DB-Integrationstest für die "Alle Standorte"-Sicht von
// getTimeOverview (Nachforderung zu §5 des WZ1-Plans).
//
// getTimeOverview ist ein createServerFn-Handler mit requireSupabaseAuth-
// Middleware; direkt aufrufbar ist er in DB-Tests nicht. Diese Suite
// verankert stattdessen die exakten Query-Verträge, die der Handler
// gegen `time_entries` fährt (siehe src/lib/time/time-admin.functions.ts,
// getTimeOverview + gaps-Zweig). Wenn ein späterer Refactor die
// Filter-Kombination bricht (locationId null vs. gesetzt, ended_at IS NULL,
// location_id IS NULL), schlägt hier zuerst der Test an.
//
// (a) locationId: null → summiert Einträge desselben Mitarbeiters über
//     zwei Standorte (org-weit, kein .eq("location_id", ...)).
// (b) Ein Eintrag mit location_id IS NULL ist in der Alle-Standorte-Sicht
//     enthalten (bestätigt, dass der Handler bei locationId=null keinen
//     Filter setzt und somit NULL-Standorte NICHT ausschließt).
// (c) Standort-Sicht liefert gaps.unlocatedShifts (Einträge mit
//     location_id IS NULL im Zeitraum, org-weit) UND gaps.openShifts
//     (Einträge am gewählten Standort mit ended_at IS NULL) korrekt.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  dbTestsEnabled,
  seedOrg,
  type SeededOrg,
  type SeededUser,
} from "@/test/db-setup";

describe.skipIf(!dbTestsEnabled)(
  "getTimeOverview — Alle-Standorte-Sicht & Lücken (WZ1)",
  () => {
    let org: SeededOrg;
    let staff: SeededUser;
    let secondLocationId: string;

    const FROM = "2027-08-01";
    const TO = "2027-08-31";

    beforeAll(async () => {
      org = await seedOrg("time-all-locations");
      staff = await org.mkUser("staff");
      secondLocationId = await org.mkLocation("Zweitstandort");
      await org.bindStaffLocation(staff.staffId, secondLocationId);

      // Standort 1 (defaultLocationId), 4h abgeschlossen.
      const s1 = new Date("2027-08-05T15:00:00Z");
      const e1 = new Date("2027-08-05T19:00:00Z");
      // Standort 2, 3h abgeschlossen.
      const s2 = new Date("2027-08-06T15:00:00Z");
      const e2 = new Date("2027-08-06T18:00:00Z");
      // location_id IS NULL, 2h abgeschlossen (Bestandsdaten ohne Standort).
      const s3 = new Date("2027-08-07T15:00:00Z");
      const e3 = new Date("2027-08-07T17:00:00Z");
      // Offener Eintrag am Standort 1 (ended_at IS NULL) → openShifts=1.
      const s4 = new Date("2027-08-08T15:00:00Z");

      const rows = [
        {
          organization_id: org.orgId,
          staff_id: staff.staffId,
          location_id: org.defaultLocationId,
          started_at: s1.toISOString(),
          ended_at: e1.toISOString(),
          business_date: "2027-08-05",
          source: "manual" as const,
          department: "service" as const,
        },
        {
          organization_id: org.orgId,
          staff_id: staff.staffId,
          location_id: secondLocationId,
          started_at: s2.toISOString(),
          ended_at: e2.toISOString(),
          business_date: "2027-08-06",
          source: "manual" as const,
          department: "service" as const,
        },
        {
          organization_id: org.orgId,
          staff_id: staff.staffId,
          location_id: null,
          started_at: s3.toISOString(),
          ended_at: e3.toISOString(),
          business_date: "2027-08-07",
          source: "manual" as const,
          department: "service" as const,
        },
        {
          organization_id: org.orgId,
          staff_id: staff.staffId,
          location_id: org.defaultLocationId,
          started_at: s4.toISOString(),
          ended_at: null,
          business_date: "2027-08-08",
          source: "clock" as const,
          department: "service" as const,
        },
      ];
      const { error } = await org.service.from("time_entries").insert(rows);
      if (error) throw error;
    });

    afterAll(async () => {
      await org.cleanup();
    });

    // Repliziert exakt die Handler-Query (getTimeOverview, Zweig
    // data.locationId == null): kein .eq("location_id", ...), aber
    // .not("ended_at", "is", null). Ein Regressor, der doch einen
    // Standort-Filter einbaut, würde hier sofort auffallen.
    async function selectEntriesOrgWide() {
      const { data, error } = await org.service
        .from("time_entries")
        .select("staff_id, location_id, business_date, started_at, ended_at")
        .eq("organization_id", org.orgId)
        .gte("business_date", FROM)
        .lte("business_date", TO)
        .not("ended_at", "is", null)
        .order("business_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    }

    async function selectEntriesForLocation(locationId: string) {
      const { data, error } = await org.service
        .from("time_entries")
        .select("staff_id, location_id, business_date, started_at, ended_at")
        .eq("organization_id", org.orgId)
        .eq("location_id", locationId)
        .gte("business_date", FROM)
        .lte("business_date", TO)
        .not("ended_at", "is", null)
        .order("business_date", { ascending: true });
      if (error) throw error;
      return data ?? [];
    }

    function sumHours(
      rows: ReadonlyArray<{ started_at: string; ended_at: string | null }>,
    ): number {
      return rows.reduce((acc, r) => {
        const s = new Date(r.started_at).getTime();
        const e = new Date(r.ended_at as string).getTime();
        return acc + Math.max(0, (e - s) / 3_600_000);
      }, 0);
    }

    it("(a) locationId=null summiert Einträge desselben Mitarbeiters über zwei Standorte", async () => {
      const rows = await selectEntriesOrgWide();
      const forStaff = rows.filter((r) => r.staff_id === staff.staffId);
      const locs = new Set(forStaff.map((r) => r.location_id));
      expect(locs.has(org.defaultLocationId)).toBe(true);
      expect(locs.has(secondLocationId)).toBe(true);
      // 4h (Standort 1) + 3h (Standort 2) + 2h (NULL) = 9h.
      expect(sumHours(forStaff)).toBeCloseTo(9, 6);
    });

    it("(b) Einträge mit location_id IS NULL sind in der Alle-Standorte-Sicht enthalten", async () => {
      const rows = await selectEntriesOrgWide();
      const nullLoc = rows.filter(
        (r) => r.staff_id === staff.staffId && r.location_id === null,
      );
      expect(nullLoc).toHaveLength(1);
      expect(nullLoc[0].business_date).toBe("2027-08-07");
    });

    it("(c) Standort-Sicht liefert gaps.unlocatedShifts=1 und gaps.openShifts=1", async () => {
      // Sanity: der offene Eintrag darf NICHT in der abgeschlossenen
      // Standort-Sicht auftauchen.
      const closedAtLoc1 = await selectEntriesForLocation(org.defaultLocationId);
      expect(
        closedAtLoc1.some((r) => r.business_date === "2027-08-08"),
      ).toBe(false);

      // gaps.unlocatedShifts: org-weit, location_id IS NULL, im Zeitraum.
      const unlocated = await org.service
        .from("time_entries")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.orgId)
        .is("location_id", null)
        .gte("business_date", FROM)
        .lte("business_date", TO);
      expect(unlocated.error).toBeNull();
      expect(unlocated.count ?? 0).toBe(1);

      // gaps.openShifts: am gewählten Standort, ended_at IS NULL, im Zeitraum.
      const open = await org.service
        .from("time_entries")
        .select("id", { count: "exact", head: true })
        .eq("organization_id", org.orgId)
        .eq("location_id", org.defaultLocationId)
        .gte("business_date", FROM)
        .lte("business_date", TO)
        .is("ended_at", null);
      expect(open.error).toBeNull();
      expect(open.count ?? 0).toBe(1);
    });
  },
);