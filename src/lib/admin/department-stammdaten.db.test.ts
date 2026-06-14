// DB-Integrationstest für P1 (Block "Abrechnung live"): Stammdaten-
// Fundament für Trinkgeld-/Provisionsverteilung.
//
// Geprüft:
//   (a) ein Mitarbeiter kann an EINEM Standort gleichzeitig in `kitchen`
//       UND `service` geführt werden (neuer Unique-Constraint inkl.
//       department).
//   (b) Doppelter Eintrag (staff_id, location_id, department) schlägt fehl.
//   (c) revenue_channels: je bestehender Location existiert `delivery_souse`,
//       `delivery_wolt`, `delivery_vectron` mit `is_takeaway=true`;
//       `pos` mit `is_takeaway=false`.
//   (d) location_department_defaults: SELECT als Manager liefert
//       kitchen=15:00 und service=16:00; FREMDE Org liefert 0 Zeilen.
//   (e) Direkter PostgREST-Schreibzugriff (INSERT/UPDATE/DELETE) als
//       Manager auf location_department_defaults schlägt fehl (DENY-ALL).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import {
  dbTestsEnabled,
  seedOrg,
  signInAsUser,
  type SeededOrg,
  type SeededUser,
} from "@/test/db-setup";

describe.skipIf(!dbTestsEnabled)(
  "P1 Stammdaten: department + is_takeaway + checkin-defaults",
  () => {
    let org: SeededOrg;
    let otherOrg: SeededOrg;
    let manager: SeededUser;
    let waiter: SeededUser;

    beforeAll(async () => {
      org = await seedOrg("p1-stammdaten");
      otherOrg = await seedOrg("p1-stammdaten-other");
      manager = await org.mkUser("manager");
      waiter = await org.mkUser("staff");

      // KEIN manueller Kanal-Seed: seit Migration
      // `tg_locations_seed_defaults` legt der AFTER-INSERT-Trigger auf
      // public.locations je neuer Location automatisch den vollständigen
      // Kanal-Satz (pos + delivery_souse/wolt/vectron) + LDDs an. Tests (c)
      // und (d) lesen genau diese Trigger-Ausgabe — das ist der Beweis,
      // dass die Produktionslogik greift, nicht eine Testbequemlichkeit.
    });

    afterAll(async () => {
      await org.cleanup();
      await otherOrg.cleanup();
    });

    it("(a) Mitarbeiter kann an einem Standort gleichzeitig kitchen UND service sein", async () => {
      // waiter ist beim Anlegen bereits mit department='service' an
      // defaultLocation gebunden (siehe seedOrg.mkUser). Wir ergänzen
      // 'kitchen' am SELBEN Standort.
      const { error } = await org.service.from("staff_locations").insert({
        organization_id: org.orgId,
        staff_id: waiter.staffId,
        location_id: org.defaultLocationId,
        department: "kitchen",
      });
      expect(error).toBeNull();

      const { data, error: readErr } = await org.service
        .from("staff_locations")
        .select("department")
        .eq("staff_id", waiter.staffId)
        .eq("location_id", org.defaultLocationId);
      expect(readErr).toBeNull();
      const departments = (data ?? []).map((r) => r.department).sort();
      expect(departments).toEqual(["kitchen", "service"]);
    });

    it("(b) Doppelter Eintrag (staff, location, department) schlägt fehl", async () => {
      // service-Eintrag existiert bereits aus seedOrg.mkUser.
      const { error } = await org.service.from("staff_locations").insert({
        organization_id: org.orgId,
        staff_id: waiter.staffId,
        location_id: org.defaultLocationId,
        department: "service",
      });
      expect(error).not.toBeNull();
    });

    it("(c) revenue_channels: delivery_* sind takeaway, pos nicht; Vectron ist je Location vorhanden", async () => {
      const { data, error } = await org.service
        .from("revenue_channels")
        .select("kind, is_takeaway")
        .eq("location_id", org.defaultLocationId);
      expect(error).toBeNull();
      const byKind = new Map((data ?? []).map((r) => [r.kind, r.is_takeaway]));
      expect(byKind.get("delivery_vectron")).toBe(true);
      expect(byKind.get("pos")).toBe(false);
      // Trigger seedet zur Laufzeit den vollständigen Satz — alle vier
      // Kanäle müssen existieren, alle Liefer-Kinds auf takeaway=true.
      expect(byKind.get("delivery_souse")).toBe(true);
      expect(byKind.get("delivery_wolt")).toBe(true);
    });

    it("(d) location_department_defaults: kitchen=15:00 + service=16:00, FREMDE Org liefert nichts", async () => {
      const cM = await signInAsUser(manager.email, manager.password);
      const { data, error } = await cM
        .from("location_department_defaults")
        .select("department, default_checkin, location_id")
        .eq("location_id", org.defaultLocationId);
      expect(error).toBeNull();
      const map = new Map((data ?? []).map((r) => [r.department, r.default_checkin]));
      expect(map.get("kitchen")).toMatch(/^15:00/);
      expect(map.get("service")).toMatch(/^16:00/);
      expect(map.has("gl")).toBe(false);

      // FREMDE Org: gleicher Manager darf nichts sehen.
      const { data: dataOther, error: errOther } = await cM
        .from("location_department_defaults")
        .select("id")
        .eq("location_id", otherOrg.defaultLocationId);
      expect(errOther).toBeNull();
      expect(dataOther?.length).toBe(0);
    });

    it("(e) DENY-ALL: Manager kann location_department_defaults nicht schreiben", async () => {
      const cM = await signInAsUser(manager.email, manager.password);
      const ins = await cM.from("location_department_defaults").insert({
        organization_id: org.orgId,
        location_id: org.defaultLocationId,
        department: "gl",
        default_checkin: "12:00",
      });
      expect(ins.error).not.toBeNull();
      const upd = await cM
        .from("location_department_defaults")
        .update({ default_checkin: "17:00" })
        .eq("location_id", org.defaultLocationId)
        .eq("department", "service");
      expect(upd.error).not.toBeNull();
      const del = await cM
        .from("location_department_defaults")
        .delete()
        .eq("location_id", org.defaultLocationId);
      expect(del.error).not.toBeNull();
    });

    it("(f) Locations-Trigger: neuer Standort bekommt 4 Kanäle + 2 LDDs automatisch", async () => {
      // Beweis, dass die Teil-B-Zusage "je Location vollständiger Satz Kinds
      // beim Seeding" strukturell eingelöst ist: jeder INSERT in
      // public.locations triggert tg_locations_seed_defaults (greift auf
      // DB-Ebene, unabhängig davon ob die Insertion aus createLocation
      // (Server-Fn) oder direkt via service-Client kommt).
      const freshLocId = await org.mkLocation("Trigger-Probe");

      const { data: channels, error: cErr } = await org.service
        .from("revenue_channels")
        .select("kind, is_takeaway")
        .eq("location_id", freshLocId)
        .order("sort_order");
      expect(cErr).toBeNull();
      const ch = new Map((channels ?? []).map((r) => [r.kind, r.is_takeaway]));
      expect(ch.size).toBe(4);
      expect(ch.get("pos")).toBe(false);
      expect(ch.get("delivery_souse")).toBe(true);
      expect(ch.get("delivery_wolt")).toBe(true);
      expect(ch.get("delivery_vectron")).toBe(true);

      const { data: ldds, error: lErr } = await org.service
        .from("location_department_defaults")
        .select("department, default_checkin")
        .eq("location_id", freshLocId);
      expect(lErr).toBeNull();
      const lm = new Map((ldds ?? []).map((r) => [r.department, r.default_checkin]));
      expect(lm.size).toBe(2);
      expect(lm.get("kitchen")).toMatch(/^15:00/);
      expect(lm.get("service")).toMatch(/^16:00/);
      expect(lm.has("gl")).toBe(false);
    });
  },
);
