// SD1 — Regressionsschutz: listStaff darf keine Kontaktdaten mehr
// zurückliefern. Rein statisch (Typ-Ebene), keine DB.
import { describe, it, expectTypeOf } from "vitest";
import type { listStaff } from "./staff.functions";

type StaffListRow = Awaited<ReturnType<typeof listStaff>>[number];

describe("listStaff Rückgabe-Shape (SD1)", () => {
  it("enthält keine email/phone-Felder mehr", () => {
    expectTypeOf<StaffListRow>().not.toHaveProperty("email");
    expectTypeOf<StaffListRow>().not.toHaveProperty("phone");
  });
  it("liefert weiterhin Anzeigedaten für die Nicht-Personalverwaltungs-Konsumenten", () => {
    expectTypeOf<StaffListRow>().toHaveProperty("id");
    expectTypeOf<StaffListRow>().toHaveProperty("displayName");
    expectTypeOf<StaffListRow>().toHaveProperty("firstName");
    expectTypeOf<StaffListRow>().toHaveProperty("lastName");
  });
});