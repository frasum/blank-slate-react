// KGL-2 (04.07. spät): Sicherstellen, dass der PDF-Datenpfad GL-Terminal-
// Zeilen NICHT zum Kartenabzug hinzuzieht — identisch zum Bildschirm.
// Wir importieren die reine Regel `sumNonGlTerminalCents` und rekonstruieren
// den Join Terminal-Beträge ↔ Terminals aus PdfExportData, so wie
// `generateDailySummaryPdf` (Zeile ~192) es tut. Ein Vergleich zum
// Bildschirm-Pfad (`cardDeductionFromTerminalRows`) stellt Bit-Gleichheit
// sicher.

import { describe, expect, it } from "vitest";
import { cardDeductionFromTerminalRows, sumNonGlTerminalCents } from "./session-channels";
import { parseEuroToCents } from "./kasse-helpers";
import type { PdfExportData } from "./pdfExport";

function pdfLikeCardTotal(data: Pick<PdfExportData, "terminals" | "terminalAmounts">): number {
  const glById = new Map(data.terminals.map((t) => [t.id, t.isGl]));
  return sumNonGlTerminalCents(
    data.terminalAmounts.map((a) => ({
      amountCents: a.amountCents,
      isGl: glById.get(a.terminalId) ?? false,
    })),
  );
}

describe("pdfExport — §33 GL-Terminals mindern Bargeld NICHT (KGL-2)", () => {
  it("Eine GL-Zeile + zwei Normal-Zeilen → nur die Normalen zählen", () => {
    const terminals = [
      { id: "T1", label: "Terminal 1", isGl: false },
      { id: "T2", label: "Terminal 2", isGl: false },
      { id: "GL", label: "GL-Karte", isGl: true },
    ];
    const terminalAmounts = [
      { terminalId: "T1", amountCents: 605164 },
      { terminalId: "T2", amountCents: 0 },
      { terminalId: "GL", amountCents: 2780 },
    ];
    const pdfTotal = pdfLikeCardTotal({ terminals, terminalAmounts });
    expect(pdfTotal).toBe(605164);
  });

  it("Bildschirm ≙ PDF: dieselben Zeilen ergeben denselben Kartenabzug", () => {
    const terminals = [
      { id: "T1", label: "Terminal 1", isGl: false },
      { id: "GL", label: "GL", isGl: true },
    ];
    const terminalAmounts = [
      { terminalId: "T1", amountCents: 403444 },
      { terminalId: "GL", amountCents: 2780 },
    ];
    const pdfTotal = pdfLikeCardTotal({ terminals, terminalAmounts });
    const screenRows = terminalAmounts.map((a) => ({
      euro: (a.amountCents / 100).toString().replace(".", ","),
      isGl: terminals.find((t) => t.id === a.terminalId)!.isGl,
    }));
    const screenTotal = cardDeductionFromTerminalRows(screenRows, parseEuroToCents);
    expect(pdfTotal).toBe(screenTotal);
    expect(pdfTotal).toBe(403444);
  });

  it("Nur GL-Zeilen → Kartenabzug 0 (roher reduce hätte GL-Betrag gezählt)", () => {
    const terminals = [{ id: "GL", label: "GL", isGl: true }];
    const terminalAmounts = [{ terminalId: "GL", amountCents: 10_00 }];
    expect(pdfLikeCardTotal({ terminals, terminalAmounts })).toBe(0);
  });
});
