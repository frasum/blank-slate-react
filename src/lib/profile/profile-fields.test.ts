import { describe, it, expect } from "vitest";
import {
  DIRECT_EDIT_FIELDS,
  REQUEST_FIELDS,
  SELF_VIEW_FIELDS,
  MANUAL_ONLY_FIELDS,
  validateIban,
  validateSvNumber,
  validateTaxId,
  validateTaxClass,
  validateChildTaxAllowances,
  validateChangeRequestPayload,
  validateDirectEditPayload,
  splitApplicableFields,
  normalizeIban,
} from "./profile-fields";

describe("Whitelist-Disjunktheit", () => {
  it("DIRECT ∩ REQUEST = ∅", () => {
    const direct = new Set<string>(DIRECT_EDIT_FIELDS);
    for (const f of REQUEST_FIELDS) expect(direct.has(f)).toBe(false);
  });
  it("SELF_VIEW enthält alle DIRECT- und REQUEST-Felder außer Pseudonamen", () => {
    const view = new Set<string>(SELF_VIEW_FIELDS);
    for (const f of DIRECT_EDIT_FIELDS) expect(view.has(f)).toBe(true);
    for (const f of REQUEST_FIELDS) {
      if ((MANUAL_ONLY_FIELDS as readonly string[]).includes(f)) continue;
      expect(view.has(f)).toBe(true);
    }
  });
  it("Pseudofelder (first_name/last_name) NICHT in SELF_VIEW", () => {
    const view = new Set<string>(SELF_VIEW_FIELDS);
    for (const f of MANUAL_ONLY_FIELDS) expect(view.has(f)).toBe(false);
  });
});

describe("validateIban", () => {
  it("akzeptiert gültige DE-IBAN mit Leerzeichen/Kleinschreibung", () => {
    expect(validateIban("de89 3704 0044 0532 0130 00")).toBeNull();
    expect(normalizeIban("de89 3704 0044 0532 0130 00")).toBe("DE89370400440532013000");
  });
  it("lehnt Zahlendreher ab", () => {
    expect(validateIban("DE89370400440532013001")).not.toBeNull();
  });
  it("erzwingt DE-Länge 22", () => {
    expect(validateIban("DE8937040044053201300")).not.toBeNull();
  });
  it("akzeptiert AT-IBAN (Länge 20)", () => {
    expect(validateIban("AT611904300234573201")).toBeNull();
  });
  it("lehnt Müll ab", () => {
    expect(validateIban("keine iban")).not.toBeNull();
    expect(validateIban(123)).not.toBeNull();
  });
});

describe("validateSvNumber", () => {
  it("akzeptiert korrektes Muster", () => {
    expect(validateSvNumber("15070649C103")).toBeNull();
  });
  it("lehnt falsche Länge ab", () => {
    expect(validateSvNumber("15070649C10")).not.toBeNull();
  });
  it("lehnt fehlenden Buchstaben ab", () => {
    expect(validateSvNumber("150706491103")).not.toBeNull();
  });
});

describe("validateTaxId", () => {
  it("akzeptiert 11 Ziffern nicht mit 0", () => {
    expect(validateTaxId("12345678901")).toBeNull();
  });
  it("lehnt führende 0 ab", () => {
    expect(validateTaxId("01234567890")).not.toBeNull();
  });
  it("lehnt falsche Länge ab", () => {
    expect(validateTaxId("1234")).not.toBeNull();
  });
});

describe("validateTaxClass", () => {
  it("erlaubt 1..6", () => {
    for (const n of [1, 2, 3, 4, 5, 6]) expect(validateTaxClass(n)).toBeNull();
  });
  it("lehnt 0 und 7 ab", () => {
    expect(validateTaxClass(0)).not.toBeNull();
    expect(validateTaxClass(7)).not.toBeNull();
  });
});

describe("validateChildTaxAllowances", () => {
  it("akzeptiert 0, 0.5, 1, 1.5", () => {
    for (const n of [0, 0.5, 1, 1.5, 2]) expect(validateChildTaxAllowances(n)).toBeNull();
  });
  it("lehnt 0.25 ab", () => {
    expect(validateChildTaxAllowances(0.25)).not.toBeNull();
  });
});

describe("validateChangeRequestPayload", () => {
  it("lehnt unbekannte Keys ab", () => {
    const r = validateChangeRequestPayload({ evil: "x" });
    expect(r.ok).toBe(false);
  });
  it("lehnt leere Payloads ab", () => {
    expect(validateChangeRequestPayload({}).ok).toBe(false);
    expect(validateChangeRequestPayload(null).ok).toBe(false);
  });
  it("akzeptiert gültigen Antrag inkl. Namen", () => {
    const r = validateChangeRequestPayload({
      first_name: "Anna",
      iban: "DE89370400440532013000",
      tax_class: 1,
    });
    expect(r.ok).toBe(true);
  });
});

describe("validateDirectEditPayload", () => {
  it("lehnt Nicht-DIRECT-Felder ab", () => {
    const r = validateDirectEditPayload({ iban: "x" });
    expect(r.ok).toBe(false);
  });
  it("akzeptiert Adresse+Phone+Email", () => {
    const r = validateDirectEditPayload({
      address: "Musterstr. 1, 10115 Berlin",
      phone: "+49 30 1234567",
      email: "a@b.de",
    });
    expect(r.ok).toBe(true);
  });
});

describe("splitApplicableFields", () => {
  it("trennt Namensfelder von restlichen", () => {
    const s = splitApplicableFields({
      first_name: "Anna",
      last_name: "B",
      iban: "DE89370400440532013000",
    });
    expect(Object.keys(s.applicable)).toEqual(["iban"]);
    expect(Object.keys(s.manualOnly).sort()).toEqual(["first_name", "last_name"]);
  });
});