/**
 * Aktivrente — RV/AV-Befreiung + monatlicher LSt-Freibetrag (LZZFREIB).
 */

import { describe, expect, it } from "vitest";
import { lohnsteuer2026 } from "./lohnsteuer-2026";
import { svBeitraege } from "./sv-2026";
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
};

describe("svBeitraege — RV/AV-Befreiung", () => {
  const stSvBruttoCent = 300000;

  it("rvFrei=true → rvCent=0, avCent>0", () => {
    const r = svBeitraege({ stSvBruttoCent, person: { ...basePerson, rvFrei: true } });
    expect(r.rvCent).toBe(0);
    expect(r.avCent).toBeGreaterThan(0);
  });

  it("avFrei=true → avCent=0, rvCent>0", () => {
    const r = svBeitraege({ stSvBruttoCent, person: { ...basePerson, avFrei: true } });
    expect(r.avCent).toBe(0);
    expect(r.rvCent).toBeGreaterThan(0);
  });

  it("Default (beide false) → rv und av > 0", () => {
    const r = svBeitraege({ stSvBruttoCent, person: basePerson });
    expect(r.rvCent).toBeGreaterThan(0);
    expect(r.avCent).toBeGreaterThan(0);
  });
});

describe("lohnsteuer2026 — monatlicher Freibetrag (LZZFREIB)", () => {
  const common = {
    stkl: 1 as const,
    lzz: 2 as const,
    zkf: 0,
    kvzProzent: 2.69,
    kirchensteuer: false,
    pvz: true,
    pva: 0 as const,
  };

  it("freibetragCent>0 senkt LSTLZZ gegenüber 0", () => {
    const re4Cent = 365295;
    const ohne = lohnsteuer2026({ ...common, re4Cent, freibetragCent: 0 });
    const mit = lohnsteuer2026({ ...common, re4Cent, freibetragCent: 200000 });
    expect(mit.lstlzzCent).toBeLessThan(ohne.lstlzzCent);
  });

  it("Freibetrag ≥ Brutto → LSTLZZ=0", () => {
    const r = lohnsteuer2026({ ...common, re4Cent: 150000, freibetragCent: 200000 });
    expect(r.lstlzzCent).toBe(0);
  });
});