import { describe, expect, it } from "vitest";
import { staffDetailsToPerson, type StaffDetailsForLohn } from "./person-mapping";

const base: StaffDetailsForLohn = {
  tax_class: "I",
  child_tax_allowances: 0,
  kk_zusatzbeitrag: 2.69,
  church_tax_liable: false,
  children_count: 0,
  has_parent_status: false,
  is_minijob: false,
  date_of_birth: "1980-01-01",
};

describe("staffDetailsToPerson", () => {
  it("mappt römische Steuerklassen 1:1", () => {
    expect(staffDetailsToPerson({ ...base, tax_class: "I" }, "2026-01-31").steuerklasse).toBe(1);
    expect(staffDetailsToPerson({ ...base, tax_class: "IV" }, "2026-01-31").steuerklasse).toBe(4);
    expect(staffDetailsToPerson({ ...base, tax_class: "VI" }, "2026-01-31").steuerklasse).toBe(6);
  });

  it("setzt pvKinderlosZuschlag = true bei kinderlos und Alter >= 23", () => {
    const p = staffDetailsToPerson(
      { ...base, children_count: 0, date_of_birth: "1980-01-01" },
      "2026-01-31",
    );
    expect(p.pvKinderlosZuschlag).toBe(true);
  });

  it("setzt pvKinderlosZuschlag = false und kinderzahl korrekt bei children_count=2", () => {
    const p = staffDetailsToPerson({ ...base, children_count: 2 }, "2026-01-31");
    expect(p.pvKinderlosZuschlag).toBe(false);
    expect(p.kinderzahl).toBe(2);
  });

  it("mappt is_minijob:true auf beschaeftigung:'minijob'", () => {
    const p = staffDetailsToPerson({ ...base, is_minijob: true }, "2026-01-31");
    expect(p.beschaeftigung).toBe("minijob");
  });

  it("wirft, wenn tax_class fehlt", () => {
    expect(() => staffDetailsToPerson({ ...base, tax_class: null }, "2026-01-31")).toThrow();
  });

  it("übernimmt kk_zusatzbeitrag als kvzProzent", () => {
    const p = staffDetailsToPerson({ ...base, kk_zusatzbeitrag: 2.69 }, "2026-01-31");
    expect(p.kvzProzent).toBe(2.69);
  });

  it("übernimmt has_parent_status nach elterneigenschaft", () => {
    const yes = staffDetailsToPerson({ ...base, has_parent_status: true }, "2026-01-31");
    const no = staffDetailsToPerson({ ...base, has_parent_status: false }, "2026-01-31");
    expect(yes.elterneigenschaft).toBe(true);
    expect(no.elterneigenschaft).toBe(false);
  });

  it("pvKinderlosZuschlag bei unbekanntem Alter vorsichtshalber true (kinderlos)", () => {
    const p = staffDetailsToPerson(
      { ...base, children_count: 0, date_of_birth: null },
      "2026-01-31",
    );
    expect(p.pvKinderlosZuschlag).toBe(true);
  });
});
