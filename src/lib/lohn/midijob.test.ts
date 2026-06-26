/**
 * Midijob (Übergangsbereich) + Werkstudent-Befreiungen (KV/PV).
 */

import { describe, expect, it } from "vitest";
import { midijobBemessungCent, svBeitraege } from "./sv-2026";
import type { PersonenParameter } from "./types";

const basePerson: PersonenParameter = {
  steuerklasse: 1,
  zkf: 0,
  kvzProzent: 2.69,
  kirchensteuerBayern: false,
  kinderzahl: 0,
  elterneigenschaft: false,
  pvKinderlosZuschlag: true,
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

describe("midijobBemessungCent", () => {
  it("AE in (UG, OG]: reduzierte Basis (KRISS-Formel)", () => {
    // 1682,00 € → ca. 1544,74 €
    expect(midijobBemessungCent(168200)).toBe(154474);
  });

  it("AE > OG: keine Reduktion", () => {
    expect(midijobBemessungCent(250000)).toBe(250000);
  });

  it("AE <= UG: keine Reduktion", () => {
    expect(midijobBemessungCent(50000)).toBe(50000);
  });
});

describe("svBeitraege — Midijob & Werkstudent", () => {
  const stSvBruttoCent = 168200;

  it("istMidijob=true → alle Beiträge < Vollbasis", () => {
    const voll = svBeitraege({ stSvBruttoCent, person: basePerson });
    const midi = svBeitraege({
      stSvBruttoCent,
      person: { ...basePerson, istMidijob: true },
    });
    expect(midi.kvCent).toBeLessThan(voll.kvCent);
    expect(midi.rvCent).toBeLessThan(voll.rvCent);
    expect(midi.avCent).toBeLessThan(voll.avCent);
    expect(midi.pvCent).toBeLessThan(voll.pvCent);
  });

  it("Werkstudent + Midijob (kvFrei/avFrei/pvFrei) → kv=av=pv=0, rv reduziert", () => {
    const voll = svBeitraege({ stSvBruttoCent, person: basePerson });
    const r = svBeitraege({
      stSvBruttoCent,
      person: {
        ...basePerson,
        istMidijob: true,
        kvFrei: true,
        avFrei: true,
        pvFrei: true,
      },
    });
    expect(r.kvCent).toBe(0);
    expect(r.avCent).toBe(0);
    expect(r.pvCent).toBe(0);
    expect(r.rvCent).toBeGreaterThan(0);
    expect(r.rvCent).toBeLessThan(voll.rvCent);
  });

  it("Default (alle Flags false) → unverändert gegenüber Vollbasis", () => {
    const r = svBeitraege({ stSvBruttoCent, person: basePerson });
    expect(r.kvCent).toBeGreaterThan(0);
    expect(r.rvCent).toBeGreaterThan(0);
    expect(r.avCent).toBeGreaterThan(0);
    expect(r.pvCent).toBeGreaterThan(0);
  });
});
