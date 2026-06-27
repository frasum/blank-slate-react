import { describe, it, expect } from "vitest";
import { isPayslipPathAllowed, sanitizePayslipFileName } from "./payslip-path";

const ORG_A = "00000000-0000-0000-0000-0000000000a1";
const ORG_B = "00000000-0000-0000-0000-0000000000b1";
const STAFF_1 = "11111111-1111-1111-1111-111111111111";
const STAFF_2 = "22222222-2222-2222-2222-222222222222";

describe("isPayslipPathAllowed", () => {
  it("erlaubt eigene Datei (role staff)", () => {
    expect(
      isPayslipPathAllowed({
        path: `${ORG_A}/${STAFF_1}/Lohn_2026-06.pdf`,
        organizationId: ORG_A,
        staffId: STAFF_1,
        role: "staff",
      }),
    ).toBe(true);
  });

  it("verbietet fremde staff_id (role staff)", () => {
    expect(
      isPayslipPathAllowed({
        path: `${ORG_A}/${STAFF_2}/Lohn_2026-06.pdf`,
        organizationId: ORG_A,
        staffId: STAFF_1,
        role: "staff",
      }),
    ).toBe(false);
  });

  it("erlaubt Admin auf fremde Datei in eigener Org", () => {
    expect(
      isPayslipPathAllowed({
        path: `${ORG_A}/${STAFF_2}/Lohn_2026-06.pdf`,
        organizationId: ORG_A,
        staffId: STAFF_1,
        role: "admin",
      }),
    ).toBe(true);
  });

  it("verbietet Admin in fremder Org", () => {
    expect(
      isPayslipPathAllowed({
        path: `${ORG_B}/${STAFF_2}/Lohn_2026-06.pdf`,
        organizationId: ORG_A,
        staffId: STAFF_1,
        role: "admin",
      }),
    ).toBe(false);
  });

  it("verbietet Manager auf fremde Datei in eigener Org", () => {
    expect(
      isPayslipPathAllowed({
        path: `${ORG_A}/${STAFF_2}/Lohn_2026-06.pdf`,
        organizationId: ORG_A,
        staffId: STAFF_1,
        role: "manager",
      }),
    ).toBe(false);
  });
});

describe("sanitizePayslipFileName", () => {
  it("lässt gültigen Namen durch", () => {
    expect(sanitizePayslipFileName("Lohn_2026-06.pdf")).toBe("Lohn_2026-06.pdf");
  });

  it("lehnt Pfad-Anteile ab", () => {
    expect(sanitizePayslipFileName("../x")).toBe(null);
    expect(sanitizePayslipFileName("a/b")).toBe(null);
    expect(sanitizePayslipFileName("a\\b")).toBe(null);
  });

  it("lehnt leer und Punkt-Start ab", () => {
    expect(sanitizePayslipFileName("")).toBe(null);
    expect(sanitizePayslipFileName("   ")).toBe(null);
    expect(sanitizePayslipFileName(".env")).toBe(null);
  });

  it("lehnt unerlaubte Zeichen ab", () => {
    expect(sanitizePayslipFileName("Lohn$.pdf")).toBe(null);
    expect(sanitizePayslipFileName("Löhn.pdf")).toBe(null);
  });
});