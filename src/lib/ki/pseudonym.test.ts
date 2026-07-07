import { describe, expect, it } from "vitest";
import {
  buildPseudonymMap,
  depseudonymize,
  pseudonymize,
  pseudonymizeDeep,
} from "./pseudonym";

describe("buildPseudonymMap + pseudonymize", () => {
  it("ersetzt Anzeige-, Vor- und Nachname deterministisch", () => {
    const map = buildPseudonymMap([
      { id: "1", displayName: "Max Mustermann", firstName: "Max", lastName: "Mustermann" },
      { id: "2", displayName: "Bäng Müller", firstName: "Bäng", lastName: "Müller" },
    ]);
    const text = "Max hat gestern mit Bäng Müller Kasse gemacht.";
    const p = pseudonymize(text, map);
    expect(p).toBe("MA-1 hat gestern mit MA-2 Kasse gemacht.");
  });

  it("respektiert Wortgrenzen (Anna ≠ Ananas)", () => {
    const map = buildPseudonymMap([
      { id: "1", displayName: "Anna", firstName: "Anna", lastName: null },
    ]);
    const p = pseudonymize("Anna isst Ananas.", map);
    expect(p).toBe("MA-1 isst Ananas.");
  });

  it("kollidiert nicht zwischen gleichlangen Namen (längster zuerst)", () => {
    const map = buildPseudonymMap([
      { id: "1", displayName: "Max Mustermann", firstName: "Max", lastName: "Mustermann" },
    ]);
    // Der Vollname MUSS als ein MA-1 erscheinen — nicht zwei getrennte Ersetzungen.
    const p = pseudonymize("Max Mustermann hat frei.", map);
    expect(p).toBe("MA-1 hat frei.");
  });

  it("Rücktausch stellt Anzeigenamen wieder her", () => {
    const map = buildPseudonymMap([
      { id: "1", displayName: "Max Mustermann", firstName: "Max", lastName: null },
      { id: "2", displayName: "Bäng", firstName: null, lastName: null },
    ]);
    const withCodes = "MA-1 hatte 3 Krankheitstage, MA-2 keine.";
    expect(depseudonymize(withCodes, map)).toBe(
      "Max Mustermann hatte 3 Krankheitstage, Bäng keine.",
    );
  });

  it("mehrstellige MA-Codes werden korrekt zurückersetzt", () => {
    const staff = Array.from({ length: 12 }, (_, i) => ({
      id: String(i + 1),
      displayName: `Mitarbeiter${i + 1}`,
      firstName: null,
      lastName: null,
    }));
    const map = buildPseudonymMap(staff);
    expect(depseudonymize("Top: MA-10 und MA-12", map)).toBe("Top: Mitarbeiter10 und Mitarbeiter12");
  });

  it("pseudonymizeDeep läuft rekursiv durch Objekte & Arrays", () => {
    const map = buildPseudonymMap([
      { id: "1", displayName: "Bäng", firstName: null, lastName: null },
    ]);
    const data = { staff: [{ name: "Bäng", stunden: 40 }], hinweis: "Bäng hat frei" };
    const p = pseudonymizeDeep(data, map);
    expect(p).toEqual({ staff: [{ name: "MA-1", stunden: 40 }], hinweis: "MA-1 hat frei" });
  });

  it("leere Staff-Liste → Identität", () => {
    const map = buildPseudonymMap([]);
    expect(pseudonymize("Hallo Welt", map)).toBe("Hallo Welt");
    expect(depseudonymize("Hallo Welt", map)).toBe("Hallo Welt");
  });

  it("case-insensitiv, aber Anzeigename bleibt erhalten", () => {
    const map = buildPseudonymMap([
      { id: "1", displayName: "Bäng", firstName: null, lastName: null },
    ]);
    expect(pseudonymize("bäng, BÄNG und Bäng", map)).toBe("MA-1, MA-1 und MA-1");
  });
});