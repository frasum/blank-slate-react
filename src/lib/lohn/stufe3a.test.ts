/**
 * M4 Stufe 3a — Härtungs-Unit-Tests (Fixes 1–6).
 * Ergänzen die neuen Golden-Master-Fälle 4–8 um zielgerichtete Kanten-Checks.
 */

import { describe, expect, it } from "vitest";
import { berechneLohn } from "./lohn-core";
import { midijobBemessungGesamtCent, svBeitraegeMinijob } from "./sv-2026";
import type { LohnEingabe } from "./types";

const minijobPerson: LohnEingabe["person"] = {
  steuerklasse: 1,
  zkf: 0,
  kvzProzent: 0,
  kirchensteuerBayern: false,
  kinderzahl: 0,
  elterneigenschaft: false,
  pvKinderlosZuschlag: false,
  beschaeftigung: "minijob",
  rvFrei: false,
  avFrei: false,
  lstFreibetragMonatCent: 0,
  istMidijob: false,
  kvFrei: false,
  pvFrei: false,
  istPkv: false,
  pkvBasisBeitragMonatCent: 0,
};

describe("Fix 2 — Minijob RV-Mindestbemessung 175 €", () => {
  it("AE = 0 → rvCent = 0 (kein Aufziehen auf 175 €)", () => {
    expect(svBeitraegeMinijob({ aushilfeZeitlohnCent: 0 })).toEqual({
      kvCent: 0,
      rvCent: 0,
      avCent: 0,
      pvCent: 0,
    });
  });

  it("AE < 175 € → RV auf 175 € gerechnet, AG-Pauschale auf tatsächlichem AE", () => {
    // 115,50 € → round(175 × 18,6 %) − round(115,50 × 15 %) = 3255 − 1733 = 1522
    expect(svBeitraegeMinijob({ aushilfeZeitlohnCent: 11550 }).rvCent).toBe(1522);
  });

  it("AE ≥ 175 € → wie zuvor (keine Regression Fall 2)", () => {
    expect(svBeitraegeMinijob({ aushilfeZeitlohnCent: 39550 }).rvCent).toBe(1423);
  });
});

describe("Fix 3 — Minijob-Invariante", () => {
  it("Zeitlohn-Zeile bei Minijob → Error", () => {
    expect(() =>
      berechneLohn({
        person: minijobPerson,
        zeilen: [{ kategorie: "zeitlohn", bezeichnung: "Grundlohn", betragCent: 10000 }],
      }),
    ).toThrow(/Minijob/);
  });

  it("Einmalbezug-Zeile bei Minijob → Error", () => {
    expect(() =>
      berechneLohn({
        person: minijobPerson,
        zeilen: [{ kategorie: "einmalbezug", bezeichnung: "Tantieme", betragCent: 5000 }],
      }),
    ).toThrow(/Minijob/);
  });
});

describe("Fix 4 — midijobBemessungGesamtCent (Randwerte)", () => {
  it("AE ≤ UG → AE unverändert", () => {
    expect(midijobBemessungGesamtCent(50000)).toBe(50000);
  });

  it("AE > OG → AE unverändert (keine Reduktion)", () => {
    expect(midijobBemessungGesamtCent(250000)).toBe(250000);
  });

  it("AE in (UG, OG]: BE_G > BE_AN (Faktor F < 1)", () => {
    // Bei AE = 164 850 Cent liegt BE_G ≈ 159 696 Cent — bewiesen an Fall 7.
    const beG = midijobBemessungGesamtCent(164850);
    expect(beG).toBeGreaterThan(150000);
    expect(beG).toBeLessThan(164850);
  });
});

describe("Fix 6 — stBruttoAusweisCent (Kappung bei 0)", () => {
  const person: LohnEingabe["person"] = {
    ...minijobPerson,
    beschaeftigung: "normal",
    lstFreibetragMonatCent: 500000,
  };

  it("Freibetrag > St-Brutto → Ausweis 0 (nicht negativ)", () => {
    const r = berechneLohn({
      person,
      zeilen: [{ kategorie: "zeitlohn", bezeichnung: "Grundlohn", betragCent: 100000 }],
    });
    expect(r.stBruttoAusweisCent).toBe(0);
  });

  it("Ohne Freibetrag: Ausweis == stBruttoCent", () => {
    const r = berechneLohn({
      person: { ...person, lstFreibetragMonatCent: 0 },
      zeilen: [{ kategorie: "zeitlohn", bezeichnung: "Grundlohn", betragCent: 300000 }],
    });
    expect(r.stBruttoAusweisCent).toBe(r.stBruttoCent);
  });
});