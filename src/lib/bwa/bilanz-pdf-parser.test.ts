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

// F4b: realistische Geometrie — rechtsbuendige Spalten (stabile rechte
// Kante), inneres GJ-Band fuer Konten (xEnd ~ 373), aeusseres GJ-Band fuer
// Positionen und Zwischensummen (xEnd ~ 452), VJ-Band (xEnd ~ 533). Linke
// Kanten variieren bewusst mit der Textlaenge.
const CHAR_W = 6;
function T(text: string, x: number, w = text.length * CHAR_W): Token {
  return { text, x, xEnd: x + w };
}
// Right-aligned token: bekannter xEnd, x = xEnd - textbreite.
function rT(text: string, xEnd: number): Token {
  const w = text.length * CHAR_W;
  return { text, x: xEnd - w, xEnd };
}
function txt(...pieces: string[]): Token[] {
  return pieces.map((p, i) => T(p, 50 + i * 20));
}
// Kopfzeilen: Geschäftsjahr/Vorjahr-Titel + Jahres-Anker + EUR EUR.
function headerRows(fy = 2024): Token[][] {
  return [
    [T("Geschäftsjahr", 380), T("Vorjahr", 480)],
    [rT(String(fy), 453), rT(String(fy - 1), 533)],
    [rT("EUR", 453), rT("EUR", 533)],
  ];
}
// Positionszeile mit Inline-Beträgen (aeusseres Band).
function pos(prefix: string, label: string, gj: string, vj: string): Token[] {
  return [T(prefix, 68), T(label, 93), rT(gj, 452), rT(vj, 533)];
}
// Positionszeile OHNE Inline-Beträge (Rollup- oder Subtotal-Kandidat).
function posNoAmt(prefix: string, label: string): Token[] {
  return [T(prefix, 68), T(label, 93)];
}
// Konto mit Inline-Beträgen: inneres GJ-Band + aeusseres VJ-Band.
function konto(nr: string, label: string, gj: string, vj: string): Token[] {
  return [T(nr, 93), T(label, 126), rT(gj, 373), rT(vj, 533)];
}
// Konto ohne Beträge (wird von Fortsetzungs-/Innere-Betragszeile geschlossen).
function kontoNoAmt(nr: string, ...labelParts: string[]): Token[] {
  return [T(nr, 93), ...labelParts.map((l, i) => T(l, 126 + i * 40))];
}
// Reine Betragszeile im inneren Band (schliesst offenes Konto).
function innerAmtLine(gj: string, vj: string): Token[] {
  return [rT(gj, 373), rT(vj, 533)];
}
// Reine Betragszeile im aeusseren Band (schliesst offene Position).
function outerAmtLine(gj: string, vj: string): Token[] {
  return [rT(gj, 452), rT(vj, 533)];
}
// Benannte Zwischensumme (Label + Beträge im aeusseren Band) — muss ignoriert
// werden, weil kein Hierarchie-Prefix vorhanden ist.
function namedIntermediate(label: string, gj: string, vj: string): Token[] {
  return [T(label, 93), rT(gj, 452), rT(vj, 533)];
}
// Uebertrag-Zeile (3 Beträge — innerer GJ, aeusserer GJ, VJ) → verworfen.
function carryLine(gj: string, vj: string): Token[] {
  return [T("Übertrag", 50), rT(gj, 373), rT(gj, 452), rT(vj, 533)];
}

// ---- Fixture: YUM 2024 mit AKTUELL erfuellten Gates ------------------------

function buildFixturePages(
  overrides: {
    konto0300?: string;
    positionBII?: string;
    konto0800?: string;
    guv3?: string;
  } = {},
): Token[][][] {
  const doc = txt("YUM", "Gastronomie", "GmbH", "-", "Jahresabschluss", "zum", "31.12.2024");

  // AKTIVA: A ohne Inline (Rollup), I mit Inline, zwei Konten je eigener
  // Position; Uebertrag-Zeile am Ende. Summen: A = I = 500; 1.=300, 2.=200.
  const aktivaPage: Token[][] = [
    doc,
    txt("Kontennachweis", "zur", "Handelsbilanz", "zum", "31.12.2024"),
    txt("Aktiva"),
    ...headerRows(2024),
    posNoAmt("A.", "Anlagevermögen"),
    pos("I.", "Sachanlagen", "500,00", "450,00"),
    pos("1.", "Grundstücke", "300,00", "270,00"),
    konto("0300", "Grundstücke", overrides.konto0300 ?? "300,00", "270,00"),
    pos("2.", "Anlagen", "200,00", "180,00"),
    konto("0400", "Anlagen", "200,00", "180,00"),
    carryLine("500,00", "450,00"),
  ];

  // PASSIVA: B ohne Inline (Rollup), B.I ohne Inline (Rollup+Subtotal-Line),
  // B.I.1 mit Konto 800 (Inline), B.I.2 mit Konto 820 (Label-Umbruch +
  // Inner-Amt-Line + Outer-Amt-Line), benannte Zwischensumme (skip),
  // B.II mit Konto 900 (Inline). Summen: B=500, B.I=300 (200+100), B.II=200.
  const passivaPage: Token[][] = [
    doc,
    txt("Kontennachweis", "zur", "Handelsbilanz", "zum", "31.12.2024"),
    txt("Passiva"),
    ...headerRows(2024),
    posNoAmt("B.", "Eigenkapital"),
    posNoAmt("I.", "Gezeichnetes Kapital"),
    posNoAmt("1.", "Gezeichnetes Kapital"),
    konto("0800", "Gezeichnetes Kapital", overrides.konto0800 ?? "200,00", "180,00"),
    outerAmtLine("200,00", "180,00"),
    posNoAmt("2.", "Nicht eingeforderte"),
    kontoNoAmt("0820", "Ausstehende"),
    [T("eingefordertes", 93), T("Kapital", 151)],
    innerAmtLine("100,00", "90,00"),
    outerAmtLine("100,00", "90,00"),
    namedIntermediate("eingefordertes Kapital", "100,00", "90,00"),
    pos("II.", "Bilanzgewinn", overrides.positionBII ?? "200,00", "180,00"),
    konto("0900", "Bilanzgewinn", "200,00", "180,00"),
  ];

  const guvPage: Token[][] = [
    doc,
    txt("Kontennachweis", "zur", "Gewinn-", "und", "Verlustrechnung"),
    ...headerRows(2024),
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
      "passiva:B.I:1",
      "passiva:B.I.1:2",
      "passiva:B.I.2:2",
      "passiva:B.II:1",
      "guv:guv.1:0",
      "guv:guv.2:0",
      "guv:guv.3:0",
    ]);
  });

  it("uebernimmt Inline-Beträge korrekt (rechtsbuendig, aeusseres Band)", () => {
    const aI1 = res.positions.find((p) => p.code === "A.I.1")!;
    expect(aI1.betragCents).toBe(30000);
    expect(aI1.vorjahrCents).toBe(27000);
    const guv2 = res.positions.find((p) => p.code === "guv.2")!;
    expect(guv2.betragCents).toBe(-200000);
  });

  it("verknuepft Konten mit der jeweils uebergeordneten Position (inneres Band)", () => {
    const k = res.konten.find((k) => k.kontoNr === "0300")!;
    expect(k.positionCode).toBe("A.I.1");
    expect(k.betragCents).toBe(30000);
    expect(k.vorjahrCents).toBe(27000);
  });

  it("Label-Umbruch: Konto 820 uebernimmt Fortsetzungs-Label und schliesst per Inner-Amt-Line", () => {
    const k = res.konten.find((k) => k.kontoNr === "0820")!;
    expect(k.label).toBe("Ausstehende eingefordertes Kapital");
    expect(k.positionCode).toBe("B.I.2");
    expect(k.betragCents).toBe(10000);
    expect(k.vorjahrCents).toBe(9000);
  });

  it("Outer-Subtotal-Zeile setzt Betrag der zuletzt offenen Position", () => {
    const bI2 = res.positions.find((p) => p.code === "B.I.2")!;
    expect(bI2.betragCents).toBe(10000);
    expect(bI2.vorjahrCents).toBe(9000);
  });

  it("Rollup: Nicht-Blatt-Positionen ohne Inline-Summe = Σ direkter Kinder (GJ + VJ)", () => {
    const A = res.positions.find((p) => p.code === "A")!;
    expect(A.betragCents).toBe(50000);
    expect(A.vorjahrCents).toBe(45000);
    const bI = res.positions.find((p) => p.code === "B.I")!;
    expect(bI.betragCents).toBe(30000); // 200 + 100
    expect(bI.vorjahrCents).toBe(27000); // 180 + 90
    const B = res.positions.find((p) => p.code === "B")!;
    expect(B.betragCents).toBe(50000); // B.I 300 + B.II 200
    expect(B.vorjahrCents).toBe(45000); // 270 + 180
  });

  it("benannte Zwischensumme wird verworfen — kein Konto/Position dafuer", () => {
    expect(
      res.konten.some((k) => k.label.includes("eingefordertes Kapital") && k.kontoNr !== "0820"),
    ).toBe(false);
    // Keine Position ohne Prefix aufgetaucht (labels sind alle mit Prefix aus fixture).
  });

  it("Jahres-Kopfzeile wird NIE als Konto klassifiziert", () => {
    expect(res.konten.some((k) => k.kontoNr === "2024" || k.kontoNr === "2023")).toBe(false);
  });

  it("alle Konsistenz-Gates ok", () => {
    expect(checkByName(res, "konten_sum:aktiva:A.I.1")?.ok).toBe(true);
    expect(checkByName(res, "konten_sum:aktiva:A.I.2")?.ok).toBe(true);
    expect(checkByName(res, "konten_sum:passiva:B.I.1")?.ok).toBe(true);
    expect(checkByName(res, "konten_sum:passiva:B.I.2")?.ok).toBe(true);
    expect(checkByName(res, "konten_sum:passiva:B.II")?.ok).toBe(true);
    expect(checkByName(res, "konten_sum_vj:passiva:B.I.2")?.ok).toBe(true);
    expect(checkByName(res, "bilanzsumme_aktiva_eq_passiva")?.ok).toBe(true);
    expect(checkByName(res, "guv_staffel_summe")?.ok).toBe(true);
  });
});

// ---- Negativtests ----------------------------------------------------------

describe("parseBilanzPdf – Negativfaelle", () => {
  it("manipulierte Kontosumme → Gate 1 (konten_sum) faellt", () => {
    const res = parseBilanzPdf(buildFixturePages({ konto0300: "400,00" }));
    const c = checkByName(res, "konten_sum:aktiva:A.I.1")!;
    expect(c.ok).toBe(false);
    expect(c.expectedCents).toBe(30000);
    expect(c.actualCents).toBe(40000);
  });

  it("vertauschte Bilanzsumme → Gate 2 (aktiva=passiva) faellt", () => {
    const res = parseBilanzPdf(buildFixturePages({ positionBII: "300,00", konto0800: "200,00" }));
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
  function mkGuv(overrides: Partial<Record<"ens" | "jues" | "bilg", number>> = {}): PositionLike[] {
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
    // Anlage-Summen == Σ Top-Level der buildFixturePages()-Aktiva/Passiva (je 500,00 = 50000 cents).
    const pages = [...buildFixturePages(), ...anlagePages("500,00", "500,00", "0,00")];
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

// ---------------------------------------------------------------------------
// F4b-Fix-2: Abschnitte laufen ueber Seitengrenzen; Anker steht nur auf der
// ersten Seite. Fortsetzungsseiten erkennt der Parser am Spaltenkopf.
// ---------------------------------------------------------------------------

describe("parseBilanzPdf – Seitenumbruch innerhalb eines Abschnitts", () => {
  const doc = txt("YUM", "Gastronomie", "GmbH", "-", "Jahresabschluss", "zum", "31.12.2024");

  // Seite 1: Aktiva-Anker, Position I mit Konto 0300 (Inline) + Konto 0400
  // OHNE Label-Fortsetzung: nur Nummer + Teil-Label; Beträge kommen erst auf
  // Seite 2 (offenes Konto ueberlebt den Seitenumbruch).
  const aktivaP1: Token[][] = [
    doc,
    txt("Kontennachweis", "zur", "Handelsbilanz", "zum", "31.12.2024"),
    txt("Aktiva"),
    ...headerRows(2024),
    posNoAmt("A.", "Anlagevermögen"),
    posNoAmt("I.", "Sachanlagen"),
    pos("1.", "Grundstücke", "300,00", "270,00"),
    konto("0300", "Grundstücke", "300,00", "270,00"),
    posNoAmt("2.", "Anlagen"),
    kontoNoAmt("0400", "Technische"),
    carryLine("300,00", "270,00"),
  ];

  // Seite 2: KEIN Anker, ABER Entity-Kopfzeile + Spaltenkopf + Übertrag +
  // Label-Fortsetzung des offenen Kontos + Innere-Betragszeile + Positions-
  // Summe (aeusseres Band) fuer Position I. Fußzeile am Schluss.
  const aktivaP2: Token[][] = [
    doc,
    txt("Aktiva"),
    ...headerRows(2024),
    carryLine("300,00", "270,00"),
    [T("Anlagen", 126)],
    innerAmtLine("200,00", "180,00"),
    outerAmtLine("200,00", "180,00"),
    txt("Erläuterung", "zu", "den", "wesentlichen", "Posten", "2"),
  ];

  it("offenes Konto ueber Seitengrenze: Label + Betrag werden auf Seite 2 vervollstaendigt", () => {
    const res = parseBilanzPdf([aktivaP1, aktivaP2]);
    const k = res.konten.find((k) => k.kontoNr === "0400")!;
    expect(k.label).toBe("Technische Anlagen");
    expect(k.betragCents).toBe(20000);
    expect(k.vorjahrCents).toBe(18000);
    expect(k.positionCode).toBe("A.I.2");
  });

  it("Übertrag-Zeilen auf beiden Seiten werden ignoriert", () => {
    const res = parseBilanzPdf([aktivaP1, aktivaP2]);
    expect(res.konten.some((k) => k.label.toLowerCase().includes("übertrag"))).toBe(false);
    expect(res.positions.some((p) => p.label.toLowerCase().includes("übertrag"))).toBe(false);
  });

  it("Positions-Summenzeile auf Seite 2 wird der offenen Position I zugeordnet", () => {
    const res = parseBilanzPdf([aktivaP1, aktivaP2]);
    const posI = res.positions.find((p) => p.code === "A.I")!;
    expect(posI.betragCents).toBe(50000);
    expect(posI.vorjahrCents).toBe(45000);
  });

  it("Folgeseite OHNE Spaltenkopf beendet den Abschnitt (Konto wird nicht befuellt)", () => {
    // Seite 2 ohne Jahres-Kopfzeile UND ohne EUR-Fallback → kein cols → Abschnittsende.
    const seite2Bad: Token[][] = [
      doc,
      innerAmtLine("200,00", "180,00"),
      outerAmtLine("500,00", "450,00"),
    ];
    const res = parseBilanzPdf([aktivaP1, seite2Bad]);
    expect(res.konten.some((k) => k.kontoNr === "0400" && k.betragCents === 20000)).toBe(false);
    expect(res.warnings.some((w) => w.includes("0400"))).toBe(true);
  });

  it("Widersprechendes Statement-Label auf Folgeseite → Warnung + Label gewinnt", () => {
    // Seite 2 traegt "Passiva" statt "Aktiva" — Abschnitt muss wechseln.
    const passivaFollowup: Token[][] = [
      doc,
      txt("Passiva"),
      ...headerRows(2024),
      posNoAmt("B.", "Eigenkapital"),
      pos("I.", "Gezeichnet", "100,00", "90,00"),
      konto("0800", "Gezeichnet", "100,00", "90,00"),
    ];
    const res = parseBilanzPdf([aktivaP1, passivaFollowup]);
    expect(res.warnings.some((w) => /widerspricht|wechselt/i.test(w))).toBe(true);
    expect(res.positions.some((p) => p.statement === "passiva" && p.code === "B")).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// F4b-Fix-3: Akkumulation gestapelter Teilsummen + Dezimalkomma-Pflicht
// ---------------------------------------------------------------------------

describe("parseBilanzPdf – F4b-Fix-3: gestapelte Teilsummen und Label-Zahlen", () => {
  const doc = txt("YUM", "Gastronomie", "GmbH", "-", "Jahresabschluss", "zum", "31.12.2024");

  it("B.II-Muster: zwei gestapelte Teilsummen einer Position ohne Gesamtzeile werden addiert", () => {
    // Position B.II hat zwei Kontenbloecke mit je eigener reiner
    // Betragszeile im aeusseren Band — B.II = Σ Teilsummen. Die
    // nachfolgende Position B.III darf NICHT die zweite Teilsumme erben.
    const passivaPage: Token[][] = [
      doc,
      txt("Kontennachweis", "zur", "Handelsbilanz", "zum", "31.12.2024"),
      txt("Passiva"),
      ...headerRows(2024),
      posNoAmt("B.", "Umlaufvermögen"),
      posNoAmt("II.", "Forderungen und sonstige Vermögensgegenstände"),
      konto("1400", "Forderungen A", "100,00", "80,00"),
      konto("1790", "Forderungen B", "31,39", "89,12"),
      outerAmtLine("131,39", "169,12"),
      konto("1570", "USt-Verrechnung A", "2,00", "0,50"),
      konto("1787", "USt-Verrechnung B", "0,88", "0,38"),
      outerAmtLine("2,88", "0,88"),
      pos("III.", "Kassenbestand", "500,00", "400,00"),
      konto("1000", "Kasse", "500,00", "400,00"),
    ];
    const res = parseBilanzPdf([passivaPage]);
    const bII = res.positions.find((p) => p.code === "B.II")!;
    // 131,39 + 2,88 = 134,27
    expect(bII.betragCents).toBe(13427);
    // 169,12 + 0,88 = 170,00
    expect(bII.vorjahrCents).toBe(17000);
    const bIII = res.positions.find((p) => p.code === "B.III")!;
    expect(bIII.betragCents).toBe(50000);
  });

  it("8105-Muster: nackte Ganzzahlen im Label (§ 4 Nr. 12) werden NIE als Betrag genommen", () => {
    // Konto 8105 mit Paragraphen-Zahlen ueber zwei Zeilen; die echten
    // Betraege stehen erst auf der Fortsetzungszeile im inneren Band.
    const guvPage: Token[][] = [
      doc,
      txt("Kontennachweis", "zur", "Gewinn-", "und", "Verlustrechnung"),
      ...headerRows(2024),
      pos("1.", "Umsatzerlöse", "1.000,00", "900,00"),
      // Kontonummer + Label-Teil 1 inkl. nackter "4" und "12".
      [T("8105", 93), T("Steuerfreie", 126), T("Umsätze", 175), T("§", 220), T("4", 235), T("Nr.", 245), T("12", 275), T("UStG", 290)],
      // Fortsetzungs-Label (ohne Betraege), dann Innerband-Betragszeile.
      [T("(Vermietung)", 126)],
      innerAmtLine("1.000,00", "900,00"),
    ];
    const res = parseBilanzPdf([guvPage]);
    const k = res.konten.find((k) => k.kontoNr === "8105")!;
    expect(k.betragCents).toBe(100000);
    expect(k.vorjahrCents).toBe(90000);
    expect(k.label).toContain("Nr.");
    expect(k.label).toContain("12");
    // Sicherstellen: kein Konto mit 12,00 = 1200 cents materialisiert.
    expect(res.konten.some((x) => x.kontoNr === "8105" && x.betragCents === 1200)).toBe(false);
  });

  it("2281-Muster: mehrzeiliges Label mit § und Kleinstbetrag −0,20 wird korrekt zugeordnet", () => {
    const guvPage: Token[][] = [
      doc,
      txt("Kontennachweis", "zur", "Gewinn-", "und", "Verlustrechnung"),
      ...headerRows(2024),
      pos("9.", "Sonstige Steuern", "-0,20", "0,00"),
      // Label ueber drei Zeilen, Betrag erst auf der letzten.
      [T("2281", 93), T("Gewerbesteuernachzahlungen", 126)],
      [T("nach", 126), T("§", 160), T("4", 175), T("Abs.", 185)],
      [T("5b", 126), T("EStG", 160)],
      innerAmtLine("-0,20", "0,00"),
    ];
    const res = parseBilanzPdf([guvPage]);
    const k = res.konten.find((k) => k.kontoNr === "2281")!;
    expect(k.betragCents).toBe(-20);
    expect(k.vorjahrCents).toBe(0);
    expect(k.label).toContain("5b");
    expect(k.label).toContain("EStG");
  });

  it("Nackte Ganzzahl-Zeile ohne Dezimalkomma zaehlt nie als Betrags-/Kontozeile", () => {
    // Eine Zeile mit ausschliesslich nackten Ganzzahlen darf NICHT als
    // subtotal (Konto-Innerband) oder Konto klassifiziert werden.
    const passivaPage: Token[][] = [
      doc,
      txt("Kontennachweis", "zur", "Handelsbilanz", "zum", "31.12.2024"),
      txt("Aktiva"),
      ...headerRows(2024),
      pos("A.", "Anlagevermögen", "500,00", "450,00"),
      konto("0300", "Grundstücke", "500,00", "450,00"),
      // Nackte Zahlen — kein Komma → keine Betraege.
      [T("2024", 373), T("2023", 533)],
      [T("1", 373), T("12", 533)],
    ];
    const res = parseBilanzPdf([passivaPage]);
    // Konto 0300 unveraendert:
    const k = res.konten.find((k) => k.kontoNr === "0300")!;
    expect(k.betragCents).toBe(50000);
    // Kein zusaetzliches Konto entstanden:
    expect(res.konten).toHaveLength(1);
    // Kein Betrag ueberschrieben:
    const posA = res.positions.find((p) => p.code === "A")!;
    expect(posA.betragCents).toBe(50000);
  });
});
