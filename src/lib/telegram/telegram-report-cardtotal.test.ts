// KGL-3 (05.07.): Der Telegram-Tagesbericht rekonstruiert den Kartenabzug
// aus `ov.terminalAmounts` (Beträge) + `payment_terminals.is_gl` (Meta),
// gejoint per `terminalId`, summiert über die eine §33-Implementierung
// `sumNonGlTerminalCents`. Dieser Test bildet den Server-Pfad 1:1 nach und
// vergleicht das Ergebnis mit dem Bildschirm-Pfad (`cardDeductionFromTerminalRows`).

import { describe, expect, it } from "vitest";
import {
  cardDeductionFromTerminalRows,
  sumNonGlTerminalCents,
} from "@/lib/cash/session-channels";
import { parseEuroToCents } from "@/lib/cash/kasse-helpers";

function telegramLikeCardTotal(
  terminalAmounts: { terminalId: string; amountCents: number }[],
  terminalsMeta: { id: string; is_gl: boolean }[],
): number {
  const isGlById = new Map(terminalsMeta.map((t) => [t.id, t.is_gl]));
  return sumNonGlTerminalCents(
    terminalAmounts.map((a) => ({
      amountCents: a.amountCents,
      isGl: isGlById.get(a.terminalId) ?? false,
    })),
  );
}

describe("telegram-report — §33 GL-Terminals mindern Bargeld NICHT (KGL-3)", () => {
  it("Eine GL-Zeile + zwei Normal-Zeilen → nur die Normalen zählen", () => {
    const terminalAmounts = [
      { terminalId: "T1", amountCents: 605164 },
      { terminalId: "T2", amountCents: 0 },
      { terminalId: "GL", amountCents: 2780 },
    ];
    const terminalsMeta = [
      { id: "T1", is_gl: false },
      { id: "T2", is_gl: false },
      { id: "GL", is_gl: true },
    ];
    expect(telegramLikeCardTotal(terminalAmounts, terminalsMeta)).toBe(605164);
  });

  it("Bildschirm ≙ Telegram: dieselben Zeilen ergeben denselben Kartenabzug", () => {
    const terminalAmounts = [
      { terminalId: "T1", amountCents: 403444 },
      { terminalId: "GL", amountCents: 2780 },
    ];
    const terminalsMeta = [
      { id: "T1", is_gl: false },
      { id: "GL", is_gl: true },
    ];
    const telegramTotal = telegramLikeCardTotal(terminalAmounts, terminalsMeta);
    const screenRows = terminalAmounts.map((a) => ({
      euro: (a.amountCents / 100).toString().replace(".", ","),
      isGl: terminalsMeta.find((t) => t.id === a.terminalId)!.is_gl,
    }));
    const screenTotal = cardDeductionFromTerminalRows(screenRows, parseEuroToCents);
    expect(telegramTotal).toBe(screenTotal);
    expect(telegramTotal).toBe(403444);
  });

  it("Nur GL-Zeilen → Kartenabzug 0", () => {
    const terminalAmounts = [{ terminalId: "GL", amountCents: 10_00 }];
    const terminalsMeta = [{ id: "GL", is_gl: true }];
    expect(telegramLikeCardTotal(terminalAmounts, terminalsMeta)).toBe(0);
  });
});