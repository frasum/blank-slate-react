// Tests für bwa-pdf-parser.
// Fixtures sind synthetische Zeilen (string[] pro Seite) im dokumentierten
// eurodata-Format: „<Nr> <Label> <Monat> <%> <kumuliert> <%>". So bleibt der
// Parser ohne pdfjs testbar.

import { describe, expect, it } from "vitest";
import { parseBwaPdfText, parseGermanAmountToCents } from "./bwa-pdf-parser";
import { validateBwaMonth } from "./bwa-core";

describe("parseGermanAmountToCents", () => {
  it("parst Ganzzahlen ohne Tausenderpunkt", () => {
    expect(parseGermanAmountToCents("324")).toBe(32400);
  });
  it("parst Tausenderpunkte", () => {
    expect(parseGermanAmountToCents("1.234")).toBe(123400);
    expect(parseGermanAmountToCents("120.713")).toBe(12071300);
  });
  it("parst Negativzahlen", () => {
    expect(parseGermanAmountToCents("-324")).toBe(-32400);
    expect(parseGermanAmountToCents("-8.451")).toBe(-845100);
  });
  it("parst leer / Dash als null", () => {
    expect(parseGermanAmountToCents("")).toBeNull();
    expect(parseGermanAmountToCents("–")).toBeNull();
    expect(parseGermanAmountToCents("-")).toBeNull();
    expect(parseGermanAmountToCents(null)).toBeNull();
  });
  it("akzeptiert defensiv auch Nachkomma", () => {
    expect(parseGermanAmountToCents("1.234,56")).toBe(123456);
  });
  it("weist Müll ab", () => {
    expect(parseGermanAmountToCents("abc")).toBeNull();
    expect(parseGermanAmountToCents("1,2,3")).toBeNull();
  });
});

// --- Fixture -------------------------------------------------------------

function makePage1(kst = "YUM", monat = "April 2025"): string[] {
  // Seite mit Kopf + Zeilen 1-28. Wertespalten je Zeile:
  //   Monatswert  %  Kumuliert  %
  return [
    "Betriebswirtschaftliche Auswertung",
    "YUM Gastronomie GmbH",
    `Kostenstelle: ${kst}`,
    monat,
    // Bewusst irrelevante Zeilen für Robustheit:
    "Bezeichnung Monat % Kumuliert %",
    "6 Getränke 28.684 23,8 100.000 24,0",
    "7 Speisen im Haus 90.899 75,3 320.000 76,0",
    "8 Speisen außer Haus – – – –",
    "10 Sonstige Erlöse 1.130 0,9 4.500 1,1",
    "11 Gesamtumsatz 120.713 100,0 424.500 100,0",
    "12 Sonstige betriebliche Erträge, Erlösschmälerung 1.094 0,9 3.500 0,8",
    "22 Wareneinsatz gesamt 25.803 21,4 96.000 22,6",
    "27 Personalkosten 82.123 68,0 300.000 70,6",
  ];
}

function makePage2(kst = "YUM", monat = "April 2025"): string[] {
  return [
    "Übertrag Vorseite",
    "YUM Gastronomie GmbH",
    `Kostenstelle: ${kst}`,
    monat,
    "30 Betriebsbedingte Raumkosten 3.500 2,9 14.000 3,3",
    "31 - davon Miete 3.000 2,5 12.000 2,8",
    "34 Restaurant- und Hotelbedarf 2.100 1,7 8.000 1,9",
    "35 Marketing/Werbung 500 0,4 2.100 0,5",
    "36 Vertriebskosten 200 0,2 800 0,2",
    "37 Gästeunterhaltung 100 0,1 400 0,1",
    "38 Reisekosten und Fortbildung 300 0,2 1.200 0,3",
    "39 KFZ-Kosten 400 0,3 1.600 0,4",
    "40 Gebühren/Beiträge/Versicherungen 600 0,5 2.400 0,6",
    "41 Bürobedarf/Porto/Telefon/Internet 800 0,7 3.200 0,8",
    "42 Steuer-/Rechts-/sonstige Beratung 700 0,6 2.800 0,7",
    "43 Bewirtung/Geschenke 200 0,2 800 0,2",
    "44 Instandhaltung und Wartung 5.000 4,1 20.000 4,7",
    "45 Leasing 1.200 1,0 4.800 1,1",
    "46 Sonstige Kosten 1.447 1,2 5.900 1,4",
    "47 Summe Sachkosten 17.047 14,1 67.000 15,8",
    "49 Anlagebedingte Kosten 5.692 4,7 22.500 5,3",
    "50 Abschreibungen -407 -0,3 -1.600 -0,4",
    "52 Betriebsergebnis -8.451 -7,0 -30.000 -7,1",
  ];
}

describe("parseBwaPdfText – Kanonik YUM April 2025", () => {
  it("liefert einen Block mit passenden Werten und validiert", () => {
    const res = parseBwaPdfText([makePage1(), makePage2()]);
    expect(res.blocks).toHaveLength(1);
    const b = res.blocks[0];
    expect(b.entity).toBe("YUM Gastronomie GmbH");
    expect(b.costCenter).toBe("YUM");
    expect(b.month).toBe("2025-04-01");

    expect(b.values.umsatzCents).toBe(12071300);
    expect(b.values.getraenkeCents).toBe(2868400);
    expect(b.values.speisenHausCents).toBe(9089900);
    // außer Haus fehlt (–)
    expect(b.values.speisenAusserHausCents).toBeUndefined();
    expect(b.missingFields).toContain("speisenAusserHausCents");
    expect(b.values.sonstigeErloeseCents).toBe(113000);
    expect(b.values.sonstErtraegeCents).toBe(109400);
    expect(b.values.wareneinsatzCents).toBe(2580300);
    expect(b.values.personalCents).toBe(8212300);
    expect(b.values.sachkostenCents).toBe(1704700);
    expect(b.values.anlageCents).toBe(569200);
    expect(b.values.abschreibungCents).toBe(-40700);
    expect(b.values.betriebsergebnisCents).toBe(-845100);

    // Sachkosten-Detail: Hauptzeilen ja, "- davon Miete" NICHT
    expect(b.sachkostenDetail["Betriebsbedingte Raumkosten"]).toBe(350000);
    expect(b.sachkostenDetail["Leasing"]).toBe(120000);
    expect(Object.keys(b.sachkostenDetail)).not.toContain("- davon Miete");

    // Fixture ist so gebaut, dass die Quersummen von bwa-core aufgehen —
    // wir prüfen mit dem fehlenden Feld (außer Haus) durch 0 ersetzt.
    const complete = {
      speisenAusserHausCents: 0,
      ...b.values,
    };
    const check = validateBwaMonth(complete as never);
    expect(check.ok).toBe(true);
  });

  it("führt zwei Kostenstellen als getrennte Blöcke", () => {
    const res = parseBwaPdfText([
      makePage1("YUM"),
      makePage2("YUM"),
      makePage1("Spicery"),
      makePage2("Spicery"),
    ]);
    expect(res.blocks.map((b) => b.costCenter).sort()).toEqual(["Spicery", "YUM"]);
  });
});

describe("parseBwaPdfText – Negativ-Fixture", () => {
  it("warnt bei verschobenem Label und übernimmt das Feld NICHT", () => {
    const p1 = makePage1();
    // Zeile 11 bewusst mit falschem Label:
    const idx = p1.findIndex((l) => l.startsWith("11 "));
    p1[idx] = "11 Falsches Label 120.713 100,0 424.500 100,0";
    const res = parseBwaPdfText([p1, makePage2()]);
    const b = res.blocks[0];
    expect(b.values.umsatzCents).toBeUndefined();
    expect(b.missingFields).toContain("umsatzCents");
    expect(res.warnings.some((w) => /Zeile 11/.test(w))).toBe(true);
  });

  it("ignoriert Seiten ohne BWA-Kopf", () => {
    const res = parseBwaPdfText([["Kostenstellenauswertung Deckblatt", "Irgendwas"]]);
    expect(res.blocks).toHaveLength(0);
  });
});
