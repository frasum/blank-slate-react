import { describe, expect, it } from "vitest";
import { allChecksOk, footerForServer, parsePosReport } from "./pos-report-parser";

// Realitätsnahe Testfixtures gegen die vier von Frank importierten Dateien
// nachgestellt — 4-Spalten- und 6-Spalten-Layout, Fußzeile, Klammern,
// namenlose PLU, Duplikat, negative Werte, Cents-Rundung.

describe("parsePosReport — 4 Spalten", () => {
  it("parst Standardfall inkl. Fußzeile und Klammer-Strip", () => {
    const raw = [
      ["Nummer", "Name", "Verkauf", "€"],
      [1, "Espresso", 10, 25.5],
      [2, "[Deaktiviert] Latte", 2, 5.6],
      ["*", "Alle (Artikel)", 12, 31.1],
    ];
    const p = parsePosReport(raw);
    expect(p.rows).toEqual([
      { nummer: 1, name: "Espresso", verkaufCount: 10, umsatzCents: 2550 },
      { nummer: 2, name: "[Deaktiviert] Latte", verkaufCount: 2, umsatzCents: 560 },
    ]);
    // Klammer-Strip nur, wenn der GESAMTE Name in Klammern steht.
    const raw2 = [
      ["Nummer", "Name", "Verkauf", "€"],
      [3, "[Alter Name]", 1, 1.0],
      ["*", "Alle (Artikel)", 1, 1.0],
    ];
    const p2 = parsePosReport(raw2);
    expect(p2.rows[0].name).toBe("Alter Name");
    expect(allChecksOk(p2)).toBe(true);
    expect(allChecksOk(p)).toBe(true);
  });
});

describe("parsePosReport — 6 Spalten", () => {
  it("erkennt Verkauf-/€-Spalten per Kopfzeile (nicht per Position)", () => {
    const raw = [
      ["Nummer", "Name", "Verbrauch", "€", "Verkauf", "€"],
      [10, "Wein", 99, 999.99, 4, 20.0],
      ["*", "Alle (Artikel)", 99, 999.99, 4, 20.0],
    ];
    const p = parsePosReport(raw);
    expect(p.rows).toEqual([{ nummer: 10, name: "Wein", verkaufCount: 4, umsatzCents: 2000 }]);
    expect(p.footer).toEqual({ verkaufCount: 4, umsatzCents: 2000 });
    expect(allChecksOk(p)).toBe(true);
  });
});

describe("parsePosReport — Warnungen & Checks", () => {
  it("namenlose Zeile wird geskippt, Kontrollsumme trotzdem grün", () => {
    const raw = [
      ["Nummer", "Name", "Verkauf", "€"],
      [1, "Espresso", 5, 12.5],
      [402, "", 3, 6.0], // namenlose PLU
      ["*", "Alle (Artikel)", 8, 18.5],
    ];
    const p = parsePosReport(raw);
    expect(p.rows).toHaveLength(1);
    expect(p.skipped).toEqual([{ nummer: 402, verkaufCount: 3, umsatzCents: 600 }]);
    expect(allChecksOk(p)).toBe(true);
    expect(p.warnings.length).toBeGreaterThan(0);
  });

  it("fehlende Fußzeile → checks fail", () => {
    const raw = [
      ["Nummer", "Name", "Verkauf", "€"],
      [1, "Espresso", 5, 12.5],
    ];
    const p = parsePosReport(raw);
    expect(p.footer).toBeNull();
    expect(p.checks.find((c) => c.name === "footer_stueck")!.ok).toBe(false);
    expect(p.checks.find((c) => c.name === "footer_umsatz")!.ok).toBe(false);
    expect(allChecksOk(p)).toBe(false);
  });

  it("Duplikat-Nummer → nummer_unique fail + Warnung", () => {
    const raw = [
      ["Nummer", "Name", "Verkauf", "€"],
      [1, "A", 1, 1.0],
      [1, "B", 2, 2.0],
      ["*", "Alle (Artikel)", 3, 3.0],
    ];
    const p = parsePosReport(raw);
    const uniq = p.checks.find((c) => c.name === "nummer_unique")!;
    expect(uniq.ok).toBe(false);
    expect(p.warnings.some((w) => w.includes("Doppelte"))).toBe(true);
  });

  it("negative Werte werden durchgereicht (Storno/Rabatt)", () => {
    const raw = [
      ["Nummer", "Name", "Verkauf", "€"],
      [50, "Rabatt", -3, -6.0],
      ["*", "Alle (Artikel)", -3, -6.0],
    ];
    const p = parsePosReport(raw);
    expect(p.rows[0]).toEqual({
      nummer: 50,
      name: "Rabatt",
      verkaufCount: -3,
      umsatzCents: -600,
    });
    expect(allChecksOk(p)).toBe(true);
  });

  it("rundet € kaufmännisch auf Cent (0.005 → 1 Cent)", () => {
    const raw = [
      ["Nummer", "Name", "Verkauf", "€"],
      [1, "X", 1, 0.005],
      ["*", "Alle (Artikel)", 1, 0.01],
    ];
    const p = parsePosReport(raw);
    expect(p.rows[0].umsatzCents).toBe(1);
    // JS round(0.005*100)=1, footer 0.01*100=1 → ok.
    expect(allChecksOk(p)).toBe(true);
  });

  it("keine Kopfzeile → nur Warnungen, alle Checks fail", () => {
    const p = parsePosReport([["irgendwas"], [1, 2, 3, 4]]);
    expect(p.rows).toEqual([]);
    expect(allChecksOk(p)).toBe(false);
  });
});

describe("footerForServer", () => {
  it("zieht die skipped-Beträge vom Footer ab", () => {
    const p = parsePosReport([
      ["Nummer", "Name", "Verkauf", "€"],
      [1, "A", 5, 12.5],
      [9999, "", 3, 6.0],
      ["*", "Alle (Artikel)", 8, 18.5],
    ]);
    expect(footerForServer(p)).toEqual({ verkaufCount: 5, umsatzCents: 1250 });
  });

  it("liefert null, wenn keine Fußzeile gefunden wurde", () => {
    const p = parsePosReport([
      ["Nummer", "Name", "Verkauf", "€"],
      [1, "A", 5, 12.5],
    ]);
    expect(footerForServer(p)).toBeNull();
  });
});