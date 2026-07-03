import { describe, expect, it } from "vitest";
import {
  buildSvNetDataBlock,
  sofortmeldungMissingFields,
  sofortmeldungStatus,
  type SofortmeldungDetails,
  type SofortmeldungStaff,
} from "./sofortmeldung-rules";

const staff: SofortmeldungStaff = { first_name: "Anna", last_name: "Muster" };

const fullDetails: SofortmeldungDetails = {
  date_of_birth: "1990-05-14",
  employment_start_date: "2026-07-01",
  social_security_number: "12 345678 A 123",
  place_of_birth: null,
  nationality: null,
  health_insurance: "TK",
};

describe("sofortmeldungMissingFields", () => {
  it("vollständig ⇒ leer", () => {
    expect(sofortmeldungMissingFields(staff, fullDetails)).toEqual([]);
  });

  it("ohne SV-Nr, aber mit Geburtsort + Nationalität ⇒ vollständig", () => {
    const d: SofortmeldungDetails = {
      ...fullDetails,
      social_security_number: null,
      place_of_birth: "Berlin",
      nationality: "DE",
    };
    expect(sofortmeldungMissingFields(staff, d)).toEqual([]);
  });

  it("ohne SV-Nr und ohne Geburtsort ⇒ SV-Feld fehlt", () => {
    const d: SofortmeldungDetails = {
      ...fullDetails,
      social_security_number: null,
      place_of_birth: null,
      nationality: "DE",
    };
    expect(sofortmeldungMissingFields(staff, d)).toContain("social_security_number");
  });

  it("details=null ⇒ alle Detailfelder fehlen", () => {
    const m = sofortmeldungMissingFields(staff, null);
    expect(m).toEqual(
      expect.arrayContaining([
        "date_of_birth",
        "employment_start_date",
        "social_security_number",
      ]),
    );
  });

  it("leere Strings zählen als fehlend", () => {
    const d: SofortmeldungDetails = { ...fullDetails, date_of_birth: "  " };
    expect(sofortmeldungMissingFields(staff, d)).toContain("date_of_birth");
  });
});

describe("sofortmeldungStatus", () => {
  it("required=false ⇒ nicht_erforderlich", () => {
    expect(
      sofortmeldungStatus({ required: false, missingFields: ["x"], reportedAt: null }),
    ).toBe("nicht_erforderlich");
  });
  it("required + vollständig + nicht gemeldet ⇒ bereit", () => {
    expect(
      sofortmeldungStatus({ required: true, missingFields: [], reportedAt: null }),
    ).toBe("bereit");
  });
  it("required + unvollständig ⇒ unvollstaendig", () => {
    expect(
      sofortmeldungStatus({ required: true, missingFields: ["a"], reportedAt: null }),
    ).toBe("unvollstaendig");
  });
  it("reportedAt gesetzt ⇒ gemeldet gewinnt auch bei unvollständigen Daten", () => {
    expect(
      sofortmeldungStatus({
        required: true,
        missingFields: ["a"],
        reportedAt: "2026-07-03T10:00:00Z",
      }),
    ).toBe("gemeldet");
  });
});

describe("buildSvNetDataBlock", () => {
  it("formatiert Geburtsdatum de-DE", () => {
    const block = buildSvNetDataBlock(staff, fullDetails, "12345678");
    expect(block.find((r) => r.label === "Geburtsdatum")?.value).toBe("14.05.1990");
  });
  it("ohne Betriebsnummer ⇒ Hinweiszeile", () => {
    const block = buildSvNetDataBlock(staff, fullDetails, null);
    expect(block.find((r) => r.label === "Betriebsnummer")?.value).toMatch(/Einstellungen/);
  });
  it("ohne SV-Nr ⇒ Geburtsort + Nationalität statt SV-Nummer", () => {
    const d: SofortmeldungDetails = {
      ...fullDetails,
      social_security_number: null,
      place_of_birth: "Berlin",
      nationality: "DE",
    };
    const block = buildSvNetDataBlock(staff, d, "12345678");
    expect(block.some((r) => r.label === "Geburtsort" && r.value === "Berlin")).toBe(true);
    expect(block.some((r) => r.label === "Nationalität" && r.value === "DE")).toBe(true);
  });
});
