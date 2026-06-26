/**
 * Thin Wrapper um die PAP-2026-Implementierung in `pap-2026/pap2026.ts`.
 *
 * Belichtet die im Bauplan vereinbarte Schnittstelle
 * `lohnsteuer2026(PapEingabe): PapErgebnis`. Die eigentliche Lohnsteuer-
 * Arithmetik bleibt 1:1 wie aus dem amtlichen Programmablaufplan
 * (BMF, Stand 2025-10-23) generiert.
 */

import { Pap2026 } from "./pap-2026/pap2026";
import type { LohnsteuerInputs } from "./pap-2026/pap-types";
import type { PapEingabe, PapErgebnis } from "./types";

export function lohnsteuer2026(e: PapEingabe): PapErgebnis {
  const inputs: LohnsteuerInputs = {
    af: 1,
    f: 1,
    STKL: e.stkl,
    LZZ: e.lzz,
    RE4: e.re4Cent,
    ZKF: e.zkf,
    KVZ: e.kvzProzent,
    R: e.kirchensteuer ? 1 : 0,
    PKV: e.pkv ? 1 : 0,
    PVZ: e.pvz ? 1 : 0,
    PVA: e.pva ?? 0,
    PVS: e.pvs ? 1 : 0,
    ALV: 0,
    KRV: 0,
    LZZFREIB: e.freibetragCent ?? 0,
  };

  const pap = new Pap2026();
  pap.setInputs(inputs);
  pap.calculate();
  const out = pap.getOutputs();

  return {
    lstlzzCent: out.LSTLZZ,
    solzlzzCent: out.SOLZLZZ,
    bkCent: out.BK,
  };
}
