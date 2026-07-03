// Reine Unit-Tests fuer die Zod-Validierung und die serverseitige
// Re-Validierung der Konsistenz-Gates in replaceBilanzYear. Die
// eigentliche Server-Function wird per DB-Test in F4b/E2E abgedeckt.

import { describe, expect, it } from "vitest";
import {
  replaceBilanzYearInput,
  validateReplacePayload,
  type ReplaceBilanzPayload,
} from "./bilanz.functions";

describe("replaceBilanzYearInput (Zod)", () => {
  it("weist Payload ohne Positionen ab", () => {
    const r = replaceBilanzYearInput.safeParse({
      entity: "YUM",
      fiscalYear: 2024,
      positions: [],
      konten: [],
    });
    expect(r.success).toBe(false);
  });

  it("weist ungueltiges statement ab", () => {
    const r = replaceBilanzYearInput.safeParse({
      entity: "YUM",
      fiscalYear: 2024,
      positions: [
        {
          statement: "sonst",
          code: "A",
          parentCode: null,
          label: "X",
          level: 0,
          sortOrder: 0,
          betragCents: 100,
          vorjahrCents: null,
        },
      ],
      konten: [],
    });
    expect(r.success).toBe(false);
  });
});

function baseValidPayload() {
  return {
    entity: "YUM",
    fiscalYear: 2024,
    positions: [
      {
        statement: "aktiva" as const,
        code: "A",
        parentCode: null,
        label: "AV",
        level: 0,
        sortOrder: 0,
        betragCents: 1000,
        vorjahrCents: null,
        source: "pdf" as const,
      },
      {
        statement: "passiva" as const,
        code: "B",
        parentCode: null,
        label: "EK",
        level: 0,
        sortOrder: 1,
        betragCents: 1000,
        vorjahrCents: null,
        source: "pdf" as const,
      },
      {
        statement: "guv" as const,
        code: "guv.1",
        parentCode: null,
        label: "Umsatz",
        level: 0,
        sortOrder: 2,
        betragCents: 5000,
        vorjahrCents: null,
        source: "pdf" as const,
      },
      {
        statement: "guv" as const,
        code: "guv.2",
        parentCode: null,
        label: "Aufwand",
        level: 0,
        sortOrder: 3,
        betragCents: -2000,
        vorjahrCents: null,
        source: "pdf" as const,
      },
      {
        statement: "guv" as const,
        code: "guv.3",
        parentCode: null,
        label: "Ergebnis",
        level: 0,
        sortOrder: 4,
        betragCents: 3000,
        vorjahrCents: null,
        source: "pdf" as const,
      },
    ],
    konten: [
      {
        statement: "aktiva" as const,
        positionCode: "A",
        kontoNr: "0300",
        label: "Grund",
        betragCents: 1000,
        vorjahrCents: null,
        sortOrder: 0,
      },
      {
        statement: "passiva" as const,
        positionCode: "B",
        kontoNr: "0800",
        label: "EK",
        betragCents: 1000,
        vorjahrCents: null,
        sortOrder: 1,
      },
    ],
  };
}

describe("validateReplacePayload (server-seitige Gates)", () => {
  it("gueltige Payload passiert alle Gates", () => {
    const r = validateReplacePayload(baseValidPayload());
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("Gate 1: Konten-Summe ≠ Position → error", () => {
    const p = baseValidPayload();
    p.konten[0].betragCents = 900;
    const r = validateReplacePayload(p);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/Gate 1 GJ.*konten_sum:aktiva:A/);
  });

  it("Gate 2: Aktiva ≠ Passiva → error", () => {
    const p = baseValidPayload();
    p.positions[1].betragCents = 1100;
    p.konten[1].betragCents = 1100;
    const r = validateReplacePayload(p);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/Bilanzsumme/);
  });

  it("Gate 3 (Fallback ohne Label-Anker): letzter Posten ≠ Σ Rest → error", () => {
    const p = baseValidPayload();
    p.positions[4].betragCents = 4000;
    const r = validateReplacePayload(p);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/guv_staffel_summe/);
  });
});

// ---------------------------------------------------------------------------
// F4a-Fix: realistische Staffel-Fixture (Ergebnis n. St. / Jahresueberschuss
// / Bilanzgewinn) — deckt Gate 3 segmentweise ab, sowie Gate 1 VJ.
// ---------------------------------------------------------------------------

function realisticStaffelPayload(): ReplaceBilanzPayload {
  // 1.-8. operative (Umsatz 10000, Aufwand -6000) → Σ = 4000
  // 9. Ergebnis n. Steuern = 4000
  // 10. Sonstige Steuern -500
  // 11. Jahresueberschuss = 3500 (= 4000 + (-500))
  // 12. Gewinnvortrag 200
  // 13. Bilanzgewinn = 3700 (= 3500 + 200)
  const guv: Array<{ code: string; label: string; betragCents: number; vorjahrCents: number | null }> = [
    { code: "guv.1", label: "Umsatzerlöse", betragCents: 10000, vorjahrCents: 9000 },
    { code: "guv.2", label: "Materialaufwand", betragCents: -6000, vorjahrCents: -5000 },
    { code: "guv.9", label: "Ergebnis nach Steuern", betragCents: 4000, vorjahrCents: 4000 },
    { code: "guv.10", label: "Sonstige Steuern", betragCents: -500, vorjahrCents: -400 },
    { code: "guv.11", label: "Jahresüberschuss", betragCents: 3500, vorjahrCents: 3600 },
    { code: "guv.12", label: "Gewinnvortrag aus Vorjahr", betragCents: 200, vorjahrCents: 100 },
    { code: "guv.13", label: "Bilanzgewinn", betragCents: 3700, vorjahrCents: 3700 },
  ];
  return {
    entity: "YUM",
    fiscalYear: 2024,
    positions: [
      {
        statement: "aktiva" as const,
        code: "A",
        parentCode: null,
        label: "AV",
        level: 0,
        sortOrder: 0,
        betragCents: 1000,
        vorjahrCents: 900,
        source: "pdf" as const,
      },
      {
        statement: "passiva" as const,
        code: "B",
        parentCode: null,
        label: "EK",
        level: 0,
        sortOrder: 1,
        betragCents: 1000,
        vorjahrCents: 900,
        source: "pdf" as const,
      },
      ...guv.map((g, i) => ({
        statement: "guv" as const,
        code: g.code,
        parentCode: null,
        label: g.label,
        level: 0,
        sortOrder: 2 + i,
        betragCents: g.betragCents,
        vorjahrCents: g.vorjahrCents,
        source: "pdf" as const,
      })),
    ],
    konten: [
      {
        statement: "aktiva" as const,
        positionCode: "A",
        kontoNr: "0300",
        label: "Grund",
        betragCents: 1000,
        vorjahrCents: 900,
        sortOrder: 0,
      },
      {
        statement: "passiva" as const,
        positionCode: "B",
        kontoNr: "0800",
        label: "EK",
        betragCents: 1000,
        vorjahrCents: 900,
        sortOrder: 1,
      },
    ],
  };
}

describe("validateReplacePayload — staffelbewusstes Gate 3", () => {
  it("Positivfall: alle Segmente stimmen", () => {
    const r = validateReplacePayload(realisticStaffelPayload());
    expect(r.ok).toBe(true);
    expect(r.errors).toEqual([]);
  });

  it("Negativ: Jahresueberschuss ≠ Ergebnis n. St. + Sonstige Steuern → guv_jahresueberschuss", () => {
    const p = realisticStaffelPayload();
    const jues = p.positions.find((x) => x.code === "guv.11")!;
    jues.betragCents = 3400; // sollte 3500 sein
    const r = validateReplacePayload(p);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/guv_jahresueberschuss/);
  });

  it("Negativ: Bilanzgewinn ≠ Jahresueberschuss + Vortrag → guv_bilanzgewinn", () => {
    const p = realisticStaffelPayload();
    const bilg = p.positions.find((x) => x.code === "guv.13")!;
    bilg.betragCents = 3800; // sollte 3700 sein
    const r = validateReplacePayload(p);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/guv_bilanzgewinn/);
  });

  it("Negativ: Ergebnis n. Steuern ≠ Σ operative → guv_ergebnis_nach_steuern", () => {
    const p = realisticStaffelPayload();
    const ens = p.positions.find((x) => x.code === "guv.9")!;
    ens.betragCents = 3900; // sollte 4000 sein
    const r = validateReplacePayload(p);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/guv_ergebnis_nach_steuern/);
  });

  it("Teil-Anker: nur Bilanzgewinn → Warnung, keine Blockade wenn Segment stimmt", () => {
    const p = realisticStaffelPayload();
    // Ergebnis n. Steuern + Jahresueberschuss umbenennen → nicht mehr als Anker erkannt.
    const ens = p.positions.find((x) => x.code === "guv.9")!;
    ens.label = "Zwischenergebnis A";
    const jues = p.positions.find((x) => x.code === "guv.11")!;
    jues.label = "Zwischenergebnis B";
    const r = validateReplacePayload(p);
    expect(r.warnings.join(" ")).toMatch(/GuV-Staffel: nicht alle Anker erkannt/);
  });
});

describe("validateReplacePayload — Gate 1 VJ", () => {
  it("Positivfall: VJ-Konten stimmen mit VJ-Position ueberein", () => {
    const r = validateReplacePayload(realisticStaffelPayload());
    expect(r.ok).toBe(true);
  });

  it("Negativ: VJ-Konto abweichend → konten_sum_vj:aktiva:A", () => {
    const p = realisticStaffelPayload();
    p.konten[0].vorjahrCents = 800; // sollte 900 sein
    const r = validateReplacePayload(p);
    expect(r.ok).toBe(false);
    expect(r.errors.join(" ")).toMatch(/Gate 1 VJ.*konten_sum_vj:aktiva:A/);
  });

  it("Fallback: fehlender VJ auf Konto oder Position wird uebersprungen (kein Fehler)", () => {
    const p = realisticStaffelPayload();
    p.konten[0].vorjahrCents = null;
    p.positions.find((x) => x.code === "A")!.vorjahrCents = null;
    p.positions.find((x) => x.code === "B")!.vorjahrCents = null;
    p.konten[1].vorjahrCents = null;
    const r = validateReplacePayload(p);
    // Gate 1 VJ liefert nur checks fuer Positionen mit vollstaendigem VJ.
    const vjErrors = r.errors.filter((e) => e.includes("Gate 1 VJ"));
    expect(vjErrors).toEqual([]);
  });
});
