/**
 * PAP-2026-Wrapper isoliert getestet (Fall 1 und Fall 3).
 * RE4 = St/SV-Brutto; STKL, ZKF, KVZ wie im jeweiligen edlohn-Fall.
 */

import { describe, expect, it } from "vitest";
import { lohnsteuer2026 } from "./lohnsteuer-2026";

describe("lohnsteuer2026 (PAP-Wrapper)", () => {
  it("Fall 1: StKl 1, kinderlos, RE4 365295 → LSt 44233", () => {
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
    expect(r.solzlzzCent).toBe(0);
  });

  it("Fall 3: StKl 4, 2 Kinder, RE4 333600 → LSt 37691", () => {
    const r = lohnsteuer2026({
      stkl: 4,
      lzz: 2,
      re4Cent: 333600,
      zkf: 2,
      kvzProzent: 2.69,
      kirchensteuer: false,
      pvz: false,
      pva: 1,
    });
    expect(r.lstlzzCent).toBe(37691);
    expect(r.solzlzzCent).toBe(0);
  });
});
