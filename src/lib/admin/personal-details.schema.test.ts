import { describe, it, expect } from "vitest";
import { personalDetailsSchema, redactForAudit } from "./personal-details.schema";

describe("personalDetailsSchema", () => {
  it("normalisiert leere Strings zu null", () => {
    const r = personalDetailsSchema.parse({ phone: "  ", email: "" });
    expect(r.phone).toBeNull();
    expect(r.email).toBeNull();
  });

  it("akzeptiert gültige IBAN (mit Leerzeichen, kleingeschrieben)", () => {
    const r = personalDetailsSchema.parse({ iban: "de89 3704 0044 0532 0130 00" });
    expect(r.iban).toBe("DE89370400440532013000");
  });

  it("lehnt ungültige IBAN ab", () => {
    expect(() => personalDetailsSchema.parse({ iban: "ABC" })).toThrow();
  });

  it("validiert ISO-Datum", () => {
    expect(() => personalDetailsSchema.parse({ date_of_birth: "1.1.2000" })).toThrow();
    const r = personalDetailsSchema.parse({ date_of_birth: "2000-01-01" });
    expect(r.date_of_birth).toBe("2000-01-01");
  });

  it("Urlaubstage müssen im Bereich liegen", () => {
    expect(() => personalDetailsSchema.parse({ vacation_days_taken: -1 })).toThrow();
    expect(() => personalDetailsSchema.parse({ vacation_days_taken: 400 })).toThrow();
  });
});

describe("redactForAudit", () => {
  it("maskiert sensible Felder, lässt andere als geändert markiert", () => {
    const out = redactForAudit({
      iban: "DE89370400440532013000",
      tax_id: "12345678901",
      social_security_number: "12345678A001",
      phone: "0151 1234567",
      bank_name: "Sparkasse",
    });
    expect(out.iban).toBe("[REDACTED]");
    expect(out.tax_id).toBe("[REDACTED]");
    expect(out.social_security_number).toBe("[REDACTED]");
    expect(out.phone).toEqual({ changed: true });
    expect(out.bank_name).toEqual({ changed: true });
  });

  it("leerer Patch → leeres Audit-Objekt", () => {
    expect(redactForAudit({})).toEqual({});
  });
});