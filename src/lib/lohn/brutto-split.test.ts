/**
 * Tests für den St-/SV-Brutto-Split sowie die neuen Zusatz-Lohnarten
 * (bav_frei, bav_sv, sachbezug_pflichtig, entgeltumwandlung).
 *
 * Basis ist Fall 3 aus den edlohn-Referenzfällen (StKl 4, 2 Kinder).
 */

import { describe, expect, it } from "vitest";
import { berechneLohn } from "./lohn-core";
import type { Entgeltzeile, LohnEingabe } from "./types";

const basePerson: LohnEingabe["person"] = {
  steuerklasse: 4,
  zkf: 2,
  kvzProzent: 2.69,
  kirchensteuerBayern: false,
  kinderzahl: 2,
  elterneigenschaft: true,
  pvKinderlosZuschlag: false,
  beschaeftigung: "normal",
  rvFrei: false,
  avFrei: false,
  lstFreibetragMonatCent: 0,
  istMidijob: false,
  kvFrei: false,
  pvFrei: false,
  istPkv: false,
  pkvBasisBeitragMonatCent: 0,
};

const baseZeilen: Entgeltzeile[] = [
  { kategorie: "zeitlohn", bezeichnung: "Grundlohn", betragCent: 333600 },
  { kategorie: "zuschlag_frei", bezeichnung: "SFN-Zuschläge", betragCent: 95560 },
];

function run(extra: Entgeltzeile[] = []) {
  return berechneLohn({ person: basePerson, zeilen: [...baseZeilen, ...extra] });
}

describe("St-/SV-Brutto-Split", () => {
  it("Standardfall: stBrutto === svBrutto (Golden-Master-Symmetrie)", () => {
    const r = run();
    expect(r.stBruttoCent).toBe(r.svBruttoCent);
    expect(r.stSvBruttoCent).toBe(r.stBruttoCent);
  });

  it("bav_sv: erhöht SV-Brutto, NICHT St-Brutto; SV höher, LSt unverändert", () => {
    const baseline = run();
    const r = run([
      { kategorie: "bav_sv", bezeichnung: "Direktvers. stfr-svpfl", betragCent: 23147 },
    ]);
    expect(r.stBruttoCent).toBe(baseline.stBruttoCent);
    expect(r.svBruttoCent).toBe(baseline.svBruttoCent + 23147);
    expect(r.lstCent).toBe(baseline.lstCent);
    expect(r.rvCent).toBeGreaterThan(baseline.rvCent);
    expect(r.avCent).toBeGreaterThan(baseline.avCent);
    expect(r.gesamtbruttoCent).toBe(baseline.gesamtbruttoCent + 23147);
  });

  it("bav_frei: in Gesamtbrutto, NICHT in St, NICHT in SV", () => {
    const baseline = run();
    const r = run([
      { kategorie: "bav_frei", bezeichnung: "Direktvers. stsv-frei", betragCent: 10000 },
    ]);
    expect(r.gesamtbruttoCent).toBe(baseline.gesamtbruttoCent + 10000);
    expect(r.stBruttoCent).toBe(baseline.stBruttoCent);
    expect(r.svBruttoCent).toBe(baseline.svBruttoCent);
    expect(r.lstCent).toBe(baseline.lstCent);
    expect(r.kvCent).toBe(baseline.kvCent);
  });

  it("sachbezug_pflichtig: in St+SV, Auszahlung um Betrag niedriger als Netto-Differenz", () => {
    const baseline = run();
    const r = run([
      { kategorie: "sachbezug_pflichtig", bezeichnung: "Dienstrad 1 %", betragCent: 5000 },
    ]);
    expect(r.stBruttoCent).toBe(baseline.stBruttoCent + 5000);
    expect(r.svBruttoCent).toBe(baseline.svBruttoCent + 5000);
    // Auszahlung sinkt um den geldwerten Vorteil zusätzlich zu Steuer-/SV-Anstieg.
    const nettoDiff = baseline.gesamtnettoCent - r.gesamtnettoCent;
    const auszahlungDiff = baseline.auszahlungCent - r.auszahlungCent;
    expect(auszahlungDiff).toBe(nettoDiff + 5000);
  });

  it("entgeltumwandlung (negativ): senkt Gesamt-, St- und SV-Brutto", () => {
    const baseline = run();
    const r = run([
      { kategorie: "entgeltumwandlung", bezeichnung: "Gehaltsumwandlung", betragCent: -10000 },
    ]);
    expect(r.gesamtbruttoCent).toBe(baseline.gesamtbruttoCent - 10000);
    expect(r.stBruttoCent).toBe(baseline.stBruttoCent - 10000);
    expect(r.svBruttoCent).toBe(baseline.svBruttoCent - 10000);
  });
});
