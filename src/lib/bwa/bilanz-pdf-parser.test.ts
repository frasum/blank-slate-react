// Tests fuer bilanz-pdf-parser. SYNTHETISCHE Fixtures (§6: keine echten
// Finanzdaten im Repo) im exakten ETL-ADHOGA-Layout: Aktiva/Passiva/GuV,
// Positionshierarchie A/I/1, Uebertrag-Zeile, Betraege in innerer + aeusserer
// Spalte, mehrzeiliges Konto-Label. Beleg-Verifikation macht Frank in F4b.

import { describe, expect, it } from "vitest";
import {
  parseBilanzPdf,
  classifyRow,
  checkGuvStaffel,
  checkKontenSumForYear,
  findAnlageAnchors,
  checkAnlageAnchors,
  type Token,
  type ParsedBilanzYear,
  type PositionLike,
  type KontoLike,
} from "./bilanz-pdf-parser";

// ---- Kleine Token-Helper ---------------------------------------------------

function T(text: string, x: number): Token {
  return { text, x };
}
function txt(...pieces: string[]): Token[] {
  return pieces.map((p, i) => T(p, 50 + i * 20));
}
function pos(prefix: string, label: string, gj: string, vj: string): Token[] {
  return [T(prefix, 50), T(label, 70), T(gj, 395), T(vj, 495)];
}
function konto(nr: string, label: string, gj: string, vj: string): Token[] {
  return [T(nr, 100), T(label, 140), T(gj, 395), T(vj, 495)];
}
function header(): Token[] {
  return [T("Geschäftsjahr", 400), T("Vorjahr", 500)];
}

// ---- Fixture: YUM 2024 mit AKTUELL erfuellten Gates ------------------------

function buildFixturePages(
  overrides: {
    konto0300?: string;
    positionB?: string;
    konto0800?: string;
    guv3?: string;
  } = {},
): Token[][][] {
  const doc = txt("YUM", "Gastronomie", "GmbH", "-", "Jahresabschluss", "zum", "31.12.2024");

  const aktivaPage: Token[][] = [
    doc,
    txt("Kontennachweis", "zur", "Handelsbilanz", "zum", "31.12.2024"),
    txt("Aktiva"),
    header(),
    pos("A.", "Anlagevermögen", "1.000,00", "900,00"),
    pos("I.", "Sachanlagen", "1.000,00", "900,00"),
    pos("1.", "Grundstücke", "700,00", "600,00"),
    konto("0300", "Grundstücke", overrides.konto0300 ?? "700,00", "600,00"),
    pos("2.", "Anlagen", "300,00", "300,00"),
    konto("0400", "Anlagen", "300,00", "300,00"),
    [T("Übertrag", 50), T("1.000,00", 395), T("900,00", 495)],
  ];

  const passivaPage: Token[][] = [
    doc,
    txt("Kontennachweis", "zur", "Handelsbilanz", "zum", "31.12.2024"),
    txt("Passiva"),
    header(),
    pos("B.", "Eigenkapital", overrides.positionB ?? "1.000,00", "900,00"),
    konto("0800", "Gezeichnetes Kapital", overrides.konto0800 ?? "1.000,00", "900,00"),
  ];

  const guvPage: Token[][] = [
    doc,
    txt("Kontennachweis", "zur", "Gewinn-", "und", "Verlustrechnung"),
    header(),
    pos("1.", "Umsatzerlöse", "5.000,00", "4.000,00"),
    konto("8400", "Erlöse", "5.000,00", "4.000,00"),
    pos("2.", "Materialaufwand", "-2.000,00", "-1.500,00"),
    konto("5400", "Wareneinkauf", "-2.000,00", "-1.500,00"),
    pos("3.", "Jahresergebnis", overrides.guv3 ?? "3.000,00", "2.500,00"),
  ];

  return [aktivaPage, passivaPage, guvPage];
}

function checkByName(res: ParsedBilanzYear, name: string) {
  return res.checks.find((c) => c.name === name);
}

// ---- Positivtests ----------------------------------------------------------

describe("parseBilanzPdf – Positivfall (YUM 2024, alle Gates erfuellt)", () => {
  const res = parseBilanzPdf(buildFixturePages());

  it("liest Entity und Geschaeftsjahr aus dem Kopf", () => {
    expect(res.entity).toBe("YUM Gastronomie GmbH");
    expect(res.fiscalYear).toBe(2024);
  });

  it("erzeugt Positionen inkl. Hierarchie-Codes", () => {
    const codes = res.positions.map((p) => `${p.statement}:${p.code}:${p.level}`);
    expect(codes).toEqual([
      "aktiva:A:0",
      "aktiva:A.I:1",
      "aktiva:A.I.1:2",
      "aktiva:A.I.2:2",
      "passiva:B:0",
      "guv:guv.1:0",
      "guv:guv.2:0",
      "guv:guv.3:0",
    ]);
  });

  it("uebernimmt GJ- und VJ-Betraege korrekt (nearest-anchor)", () => {
    const aI1 = res.positions.find((p) => p.code === "A.I.1")!;
    expect(aI1.betragCents).toBe(70000);
    expect(aI1.vorjahrCents).toBe(60000);
    const guv2 = res.positions.find((p) => p.code === "guv.2")!;
    expect(guv2.betragCents).toBe(-200000);
  });

  it("verknuepft Konten mit der jeweils uebergeordneten Position", () => {
    const k = res.konten.find((k) => k.kontoNr === "0300")!;
    expect(k.positionCode).toBe("A.I.1");
    expect(k.betragCents).toBe(70000);
  });

  it("alle Konsistenz-Gates ok", () => {
    expect(checkByName(res, "konten_sum:aktiva:A.I.1")?.ok).toBe(true);
    expect(checkByName(res, "konten_sum:aktiva:A.I.2")?.ok).toBe(true);
    expect(checkByName(res, "konten_sum:passiva:B")?.ok).toBe(true);
    expect(checkByName(res, "bilanzsumme_aktiva_eq_passiva")?.ok).toBe(true);
    expect(checkByName(res, "guv_staffel_summe")?.ok).toBe(true);
  });
});

// ---- Negativtests ----------------------------------------------------------

describe("parseBilanzPdf – Negativfaelle", () => {
  it("manipulierte Kontosumme → Gate 1 (konten_sum) faellt", () => {
    const res = parseBilanzPdf(buildFixturePages({ konto0300: "800,00" }));
    const c = checkByName(res, "konten_sum:aktiva:A.I.1")!;
    expect(c.ok).toBe(false);
    expect(c.expectedCents).toBe(70000);
    expect(c.actualCents).toBe(80000);
  });

  it("vertauschte Bilanzsumme → Gate 2 (aktiva=passiva) faellt", () => {
    const res = parseBilanzPdf(buildFixturePages({ positionB: "1.100,00", konto0800: "1.100,00" }));
    const c = checkByName(res, "bilanzsumme_aktiva_eq_passiva")!;
    expect(c.ok).toBe(false);
  });

  it("GuV-Staffelbruch → Gate 3 (guv_staffel_summe) faellt", () => {
    const res = parseBilanzPdf(buildFixturePages({ guv3: "4.000,00" }));
    const c = checkByName(res, "guv_staffel_summe")!;
    expect(c.ok).toBe(false);
  });
});

// ---- Klassifizierer-Unit-Tests --------------------------------------------

describe("classifyRow", () => {
  it("erkennt Positions-, Konto-, Summen-, Uebertrag-Zeilen", () => {
    expect(classifyRow(pos("A.", "Anlagevermögen", "1.000,00", "900,00"), "aktiva")).toBe(
      "position-letter",
    );
    expect(classifyRow(pos("I.", "Sachanlagen", "1.000,00", "900,00"), "aktiva")).toBe(
      "position-roman",
    );
    expect(classifyRow(pos("1.", "Grundstücke", "700,00", "600,00"), "aktiva")).toBe(
      "position-arabic",
    );
    expect(classifyRow([T("a)", 90), T("Sonstiges", 110), T("50,00", 395)], "aktiva")).toBe(
      "position-buchstabe",
    );
    expect(classifyRow(konto("0300", "Grundstücke", "700,00", "600,00"), "aktiva")).toBe("konto");
    expect(classifyRow([T("1.000,00", 395), T("900,00", 495)], "aktiva")).toBe("subtotal");
    expect(classifyRow([T("Übertrag", 50), T("1.000,00", 395)], "aktiva")).toBe("carry");
    expect(classifyRow([T("davon", 60), T("Restlaufzeit", 90)], "aktiva")).toBe("davon");
    expect(classifyRow(pos("1.", "Umsatzerlöse", "5.000", "4.000"), "guv")).toBe("position-guv");
  });
});

// ---------------------------------------------------------------------------
// F4a-Fix: realistische GuV-Staffel-Fixture (Ergebnis n. Steuern /
// Jahresueberschuss / Bilanzgewinn) — Positiv, Negativ, Fallback.
// ---------------------------------------------------------------------------

describe("checkGuvStaffel (shared, staffelbewusst)", () => {
  function mkGuv(
    overrides: Partial<Record<"ens" | "jues" | "bilg", number>> = {},
  ): PositionLike[] {
    // 1..8 operative Σ = 4000; 9 Ergebnis n. St. = 4000; 10 Sonst. Steuern -500;
    // 11 Jahresueberschuss = 3500; 12 Vortrag +200; 13 Bilanzgewinn = 3700.
    return [
      { statement: "guv", code: "guv.1", level: 0, label: "Umsatzerlöse", betragCents: 10000 },
      { statement: "guv", code: "guv.2", level: 0, label: "Materialaufwand", betragCents: -6000 },
      {
        statement: "guv",
        code: "guv.9",
        level: 0,
        label: "Ergebnis nach Steuern",
        betragCents: overrides.ens ?? 4000,
      },
      {
        statement: "guv",
        code: "guv.10",
        level: 0,
        label: "Sonstige Steuern",
        betragCents: -500,
      },
      {
        statement: "guv",
        code: "guv.11",
        level: 0,
        label: "Jahresüberschuss",
        betragCents: overrides.jues ?? 3500,
      },
      {
        statement: "guv",
        code: "guv.12",
        level: 0,
        label: "Gewinnvortrag aus Vorjahr",
        betragCents: 200,
      },
      {
        statement: "guv",
        code: "guv.13",
        level: 0,
        label: "Bilanzgewinn",
        betragCents: overrides.bilg ?? 3700,
      },
    ];
  }

  it("Positivfall: alle 3 Segmente ok", () => {
    const checks = checkGuvStaffel(mkGuv(), []);
    const byName = Object.fromEntries(checks.map((c) => [c.name, c]));
    expect(byName["guv_ergebnis_nach_steuern"]?.ok).toBe(true);
    expect(byName["guv_jahresueberschuss"]?.ok).toBe(true);
    expect(byName["guv_bilanzgewinn"]?.ok).toBe(true);
  });

  it("Negativ: Bilanzgewinn falsch", () => {
    const checks = checkGuvStaffel(mkGuv({ bilg: 3800 }), []);
    const c = checks.find((x) => x.name === "guv_bilanzgewinn")!;
    expect(c.ok).toBe(false);
    expect(c.expectedCents).toBe(3800);
    expect(c.actualCents).toBe(3700);
  });

  it("Fallback: keine Anker-Labels → guv_staffel_summe (rueckwaertskompatibel)", () => {
    const guv: PositionLike[] = [
      { statement: "guv", code: "guv.1", level: 0, label: "Umsatz", betragCents: 500 },
      { statement: "guv", code: "guv.2", level: 0, label: "Aufwand", betragCents: -200 },
      { statement: "guv", code: "guv.3", level: 0, label: "Jahresergebnis", betragCents: 300 },
    ];
    const checks = checkGuvStaffel(guv, []);
    expect(checks).toHaveLength(1);
    expect(checks[0].name).toBe("guv_staffel_summe");
    expect(checks[0].ok).toBe(true);
  });

  it("Teil-Anker: nur Bilanzgewinn → Warnung + kein guv_ergebnis_nach_steuern check", () => {
    const guv = mkGuv();
    // "Ergebnis nach Steuern" und "Jahresüberschuss" umbenennen.
    guv[2].label = "Zwischenergebnis A";
    guv[4].label = "Zwischenergebnis B";
    const warnings: string[] = [];
    const checks = checkGuvStaffel(guv, warnings);
    expect(warnings.join(" ")).toMatch(/nicht alle Anker erkannt/);
    expect(checks.find((c) => c.name === "guv_ergebnis_nach_steuern")).toBeUndefined();
    expect(checks.find((c) => c.name === "guv_jahresueberschuss")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Gate 1 VJ (shared)
// ---------------------------------------------------------------------------

describe("checkKontenSumForYear – VJ", () => {
  const positions: PositionLike[] = [
    {
      statement: "aktiva",
      code: "A.I.1",
      level: 2,
      label: "Grund",
      betragCents: 700,
      vorjahrCents: 600,
    },
    {
      statement: "aktiva",
      code: "A.I.2",
      level: 2,
      label: "Anlagen",
      betragCents: 300,
      vorjahrCents: null, // Vorjahr fehlt
    },
  ];
  const konten: KontoLike[] = [
    {
      statement: "aktiva",
      positionCode: "A.I.1",
      betragCents: 700,
      vorjahrCents: 600,
    },
    {
      statement: "aktiva",
      positionCode: "A.I.2",
      betragCents: 300,
      vorjahrCents: null,
    },
  ];

  it("Positivfall: VJ-Konto = VJ-Position", () => {
    const c = checkKontenSumForYear(positions, konten, "vj").find(
      (x) => x.name === "konten_sum_vj:aktiva:A.I.1",
    )!;
    expect(c.ok).toBe(true);
  });

  it("Negativ: VJ-Konto abweichend", () => {
    const bad = konten.map((k) => ({ ...k }));
    bad[0].vorjahrCents = 500;
    const c = checkKontenSumForYear(positions, bad, "vj").find(
      (x) => x.name === "konten_sum_vj:aktiva:A.I.1",
    )!;
    expect(c.ok).toBe(false);
    expect(c.actualCents).toBe(500);
    expect(c.expectedCents).toBe(600);
  });

  it("Fallback: fehlende VJ auf Konto oder Position → uebersprungen", () => {
    const checks = checkKontenSumForYear(positions, konten, "vj");
    expect(checks.find((c) => c.name === "konten_sum_vj:aktiva:A.I.2")).toBeUndefined();
  });
});

// ---------------------------------------------------------------------------
// Gate 4: Anlage-Anker (parser-only)
// ---------------------------------------------------------------------------

describe("Gate 4 – Anlage-Anker vs. parsed Bilanz", () => {
  function anlagePages(sumAktiva: string, sumPassiva: string, bilg: string): Token[][][] {
    const doc = txt("YUM", "Gastronomie", "GmbH", "-", "Jahresabschluss", "zum", "31.12.2024");
    const anlageBilanz: Token[][] = [
      doc,
      txt("Handelsbilanz", "zum", "31.12.2024"),
      [T("Summe", 50), T("Aktiva", 80), T(sumAktiva, 395), T("900,00", 495)],
      [T("Summe", 50), T("Passiva", 80), T(sumPassiva, 395), T("900,00", 495)],
      [T("Bilanzgewinn", 50), T(bilg, 395), T("0,00", 495)],
    ];
    return [anlageBilanz];
  }

  it("findAnlageAnchors liest die drei Anker aus", () => {
    const anchors = findAnlageAnchors(anlagePages("1.000,00", "1.000,00", "0,00"));
    expect(anchors.summeAktivaCents).toBe(100000);
    expect(anchors.summePassivaCents).toBe(100000);
    expect(anchors.bilanzgewinnCents).toBe(0);
  });

  it("Positivfall: Anker stimmen mit parsed Top-Level-Summen ueberein", () => {
    // Anlage-Summen == Σ Top-Level der buildFixturePages()-Aktiva/Passiva (je 1000,00 = 100000 cents).
    const pages = [...buildFixturePages(), ...anlagePages("1.000,00", "1.000,00", "0,00")];
    const res = parseBilanzPdf(pages);
    const cA = res.checks.find((c) => c.name === "anlage_summe_aktiva")!;
    const cP = res.checks.find((c) => c.name === "anlage_summe_passiva")!;
    expect(cA.ok).toBe(true);
    expect(cP.ok).toBe(true);
  });

  it("Negativ: Anlage-Summe Aktiva ≠ Σ Top-Level Aktiva", () => {
    const anchors = { summeAktivaCents: 99900, summePassivaCents: null, bilanzgewinnCents: null };
    const positions: PositionLike[] = [
      { statement: "aktiva", code: "A", level: 0, label: "AV", betragCents: 100000 },
    ];
    const c = checkAnlageAnchors(anchors, positions)[0];
    expect(c.name).toBe("anlage_summe_aktiva");
    expect(c.ok).toBe(false);
  });

  it("Fehlende Anker → keine Checks", () => {
    const checks = checkAnlageAnchors(
      { summeAktivaCents: null, summePassivaCents: null, bilanzgewinnCents: null },
      [],
    );
    expect(checks).toEqual([]);
  });
});
