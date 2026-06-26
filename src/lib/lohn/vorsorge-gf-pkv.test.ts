/**
 * Vorsorgepauschale-Pfad für voll SV-freie Gesellschafter-Geschäftsführer (PKV).
 *
 * Ohne KRV/ALV/PKV/PKPV-Flags rechnet die PAP-Engine den RV-/GKV-/AV-Teilbetrag
 * der Vorsorgepauschale dazu — das ist für einen voll SV-freien PKV-GF falsch
 * und senkt die LSt zu stark. Mit den Flags muss die LSt höher ausfallen.
 */

import { describe, expect, it } from "vitest";
import { lohnsteuer2026 } from "./lohnsteuer-2026";

const common = {
  stkl: 1 as const,
  lzz: 2 as const,
  re4Cent: 800000,
  zkf: 0,
  kvzProzent: 2.69,
  kirchensteuer: false,
  pvz: true,
  pva: 0 as const,
};

describe("Vorsorgepauschale — GGF/PKV-Pfad", () => {
  it("krvKeinRv + alvKeinAv heben die LSt gegenüber GKV-Default", () => {
    const ohne = lohnsteuer2026({ ...common });
    const mit = lohnsteuer2026({
      ...common,
      pkv: true,
      krvKeinRv: true,
      alvKeinAv: true,
      pkpvCent: 0,
    });
    expect(mit.lstlzzCent).toBeGreaterThan(ohne.lstlzzCent);
  });

  it("pkpvCent > 0 senkt die LSt gegenüber PKV ohne Basisbeitrag", () => {
    const ohnePkpv = lohnsteuer2026({
      ...common,
      pkv: true,
      krvKeinRv: true,
      alvKeinAv: true,
      pkpvCent: 0,
    });
    const mitPkpv = lohnsteuer2026({
      ...common,
      pkv: true,
      krvKeinRv: true,
      alvKeinAv: true,
      pkpvCent: 80000,
    });
    expect(mitPkpv.lstlzzCent).toBeLessThanOrEqual(ohnePkpv.lstlzzCent);
  });

  it("Default-Verhalten unverändert (keine Flags = altes Ergebnis)", () => {
    // Fall 1 aus lohnsteuer-2026.test.ts: bit-identisch.
    const r = lohnsteuer2026({
      stkl: 1,
      lzz: 2,
      re4Cent: 365295,
      zkf: 0,
      kvzProzent: 2.69,
      kirchensteuer: false,
      pvz: true,
      pva: 0,
    });
    expect(r.lstlzzCent).toBe(44233);
  });
});
