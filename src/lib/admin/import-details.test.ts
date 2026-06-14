// Unit-Tests für das reine Details-Mapping (Welle 2) + CSV-Parser.
import { describe, it, expect } from "vitest";
import {
  computeDetailsPlan,
  type CurrentDetailsRow,
  type DetailsRowInput,
} from "./import-details";
import { parseDetailsCsv } from "./import-details-csv";

const STAFF_A = "staff-a";

function row(over: Partial<DetailsRowInput> = {}): DetailsRowInput {
  return {
    personnelNumber: "000006",
    firstName: "Andi",
    lastName: "S",
    salutation: null,
    phone: "030 1234",
    email: "a@b.de",
    address: "Strasse 1",
    dateOfBirth: "1990-01-01",
    placeOfBirth: null,
    nationality: null,
    taxClass: "I",
    taxId: "12345678901",
    socialSecurityNumber: "11223344",
    isMinijob: false,
    isSvExempt: null,
    healthInsurance: "TK",
    churchTaxLiable: false,
    childTaxAllowances: 0,
    iban: "DE89370400440532013000",
    bankName: "Sparkasse",
    accountHolder: "Andi S",
    employmentStartDate: "2024-01-15",
    employmentEndDate: null,
    personnelGroup: "Vollzeit",
    jobTitle: "Koch",
    vacationDaysContractual: 24,
    vacationDaysPreviousYear: 0,
    vacationDaysCurrentYear: 24,
    vacationDaysTaken: 5,
    ...over,
  };
}

describe("computeDetailsPlan", () => {
  it("(a) PN-Brücke: '000006' → perso_nr 6 → insert mit allen Feldern", () => {
    const r = computeDetailsPlan({
      rows: [row()],
      staffByPersoNr: new Map([[6, STAFF_A]]),
      ambiguousPersoNrs: new Set(),
      currentDetails: new Map(),
    });
    expect(r.totals.skippedCount).toBe(0);
    expect(r.totals.inserts).toBe(1);
    expect(r.totals.updates).toBe(0);
    expect(r.perStaff[0].staffId).toBe(STAFF_A);
    expect(r.perStaff[0].op).toBe("insert");
  });

  it("(b) Dummy 123456 → kein staff → skipped unknown_personnel_number", () => {
    const r = computeDetailsPlan({
      rows: [row({ personnelNumber: "123456" })],
      staffByPersoNr: new Map([[6, STAFF_A]]),
      ambiguousPersoNrs: new Set(),
      currentDetails: new Map(),
    });
    expect(r.totals.skippedCount).toBe(1);
    expect(r.skippedRows[0].reason).toBe("unknown_personnel_number");
    expect(r.totals.inserts).toBe(0);
  });

  it("(c) UPSERT update: bestehende Zeile + geänderte phone → 1 Update, andere Felder unverändert", () => {
    const current: CurrentDetailsRow = {
      staffId: STAFF_A,
      phone: "alt",
      email: "a@b.de",
      iban: "DE89370400440532013000",
    };
    const r = computeDetailsPlan({
      rows: [row({ phone: "neu" })],
      staffByPersoNr: new Map([[6, STAFF_A]]),
      ambiguousPersoNrs: new Set(),
      currentDetails: new Map([[STAFF_A, current]]),
    });
    expect(r.totals.updates).toBe(1);
    expect(r.ops[0].op).toBe("update");
    expect((r.ops[0].fields as { phone?: string }).phone).toBe("neu");
    // email/iban unverändert → nicht im write-set
    expect((r.ops[0].fields as { email?: string }).email).toBeUndefined();
    expect((r.ops[0].fields as { iban?: string }).iban).toBeUndefined();
  });

  it("(d) Leere CSV-Werte überschreiben bestehende NICHT", () => {
    const current: CurrentDetailsRow = {
      staffId: STAFF_A,
      iban: "DE_BESTAND",
      phone: "030",
    };
    const r = computeDetailsPlan({
      rows: [row({ iban: null, phone: null })],
      staffByPersoNr: new Map([[6, STAFF_A]]),
      ambiguousPersoNrs: new Set(),
      currentDetails: new Map([[STAFF_A, current]]),
    });
    // Weder iban noch phone in write-fields
    const write = r.ops[0]?.fields ?? {};
    expect((write as { iban?: string }).iban).toBeUndefined();
    expect((write as { phone?: string }).phone).toBeUndefined();
  });

  it("(e) sensible Felder im Bericht maskiert (kein IBAN-Klartext in fieldDiffs)", () => {
    const r = computeDetailsPlan({
      rows: [row()],
      staffByPersoNr: new Map([[6, STAFF_A]]),
      ambiguousPersoNrs: new Set(),
      currentDetails: new Map(),
    });
    const diff = r.perStaff[0].fieldDiffs.find((d) => d.field === "iban");
    expect(diff?.sensitive).toBe(true);
    expect(diff?.from).toBeUndefined();
    expect(diff?.to).toBeUndefined();
    const ssn = r.perStaff[0].fieldDiffs.find((d) => d.field === "social_security_number");
    expect(ssn?.to).toBeUndefined();
    const taxid = r.perStaff[0].fieldDiffs.find((d) => d.field === "tax_id");
    expect(taxid?.to).toBeUndefined();
    // nicht-sensible: from/to vorhanden
    const phone = r.perStaff[0].fieldDiffs.find((d) => d.field === "phone");
    expect(phone?.to).toBe("030 1234");
  });

  it("ambiguous perso_nr → skipped ambiguous_or_null_perso_nr", () => {
    const r = computeDetailsPlan({
      rows: [row()],
      staffByPersoNr: new Map(),
      ambiguousPersoNrs: new Set([6]),
      currentDetails: new Map(),
    });
    expect(r.skippedRows[0].reason).toBe("ambiguous_or_null_perso_nr");
  });

  it("Idempotenz: identische Eingabe + bestehende Zeile mit allen Werten = 0 Ops", () => {
    const r1 = computeDetailsPlan({
      rows: [row()],
      staffByPersoNr: new Map([[6, STAFF_A]]),
      ambiguousPersoNrs: new Set(),
      currentDetails: new Map(),
    });
    // Simuliere "danach": current = was geschrieben wurde.
    const current: CurrentDetailsRow = { staffId: STAFF_A, ...r1.ops[0].fields };
    const r2 = computeDetailsPlan({
      rows: [row()],
      staffByPersoNr: new Map([[6, STAFF_A]]),
      ambiguousPersoNrs: new Set(),
      currentDetails: new Map([[STAFF_A, current]]),
    });
    expect(r2.totals.inserts).toBe(0);
    expect(r2.totals.updates).toBe(0);
  });
});

describe("parseDetailsCsv", () => {
  it("parst Pflichtfelder + deutsche Booleans + Komma-Dezimal", () => {
    const csv =
      "personnel_number;first_name;last_name;phone;is_minijob;church_tax_liable;child_tax_allowances\n" +
      "000006;Andi;S;030 1234;ja;nein;1,5";
    const r = parseDetailsCsv(csv);
    expect(r.warnings).toEqual([]);
    expect(r.rows[0].personnelNumber).toBe("000006");
    expect(r.rows[0].isMinijob).toBe(true);
    expect(r.rows[0].churchTaxLiable).toBe(false);
    expect(r.rows[0].childTaxAllowances).toBe(1.5);
  });

  it("akzeptiert DD.MM.YYYY für Datumsfelder", () => {
    const csv =
      "personnel_number;first_name;last_name;date_of_birth;employment_start_date\n" +
      "6;Andi;S;01.01.1990;15.01.2024";
    const r = parseDetailsCsv(csv);
    expect(r.warnings).toEqual([]);
    expect(r.rows[0].dateOfBirth).toBe("1990-01-01");
    expect(r.rows[0].employmentStartDate).toBe("2024-01-15");
  });

  it("wirft, wenn Pflichtspalte fehlt", () => {
    expect(() => parseDetailsCsv("first_name;last_name\nA;B")).toThrow(/personnel_number/);
  });

  it("leere Zellen → null, kein Schreiben (Pflichtfelder erzwingen Skip)", () => {
    const csv =
      "personnel_number;first_name;last_name;phone;iban\n" +
      "6;Andi;S;;\n" +
      ";Geist;G;;";
    const r = parseDetailsCsv(csv);
    expect(r.rows).toHaveLength(1);
    expect(r.rows[0].phone).toBeNull();
    expect(r.rows[0].iban).toBeNull();
    expect(r.warnings.some((w) => w.kind === "missing_field")).toBe(true);
  });
});
