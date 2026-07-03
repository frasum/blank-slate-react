// Tests für bwa-pdf-parser.
// Fixtures spiegeln das ECHTE eurodata-BWAKORE-Kopflayout: BeraterNr /
// Report-Typ / Entity / KSt (Label-los) / Monat / WES. Beträge sind frei
// erfunden (§6: keine Geschäftsdaten im Repo), Zahlformat aber real.

import { describe, expect, it } from "vitest";
import { parseBwaPdfText, parseGermanAmountToCents } from "./bwa-pdf-parser";
import { validateBwaMonth, type BwaMonthInput } from "./bwa-core";

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

const REAL_HEADER = (
  kst: string,
  report = "Betriebswirtschaftliche Auswertung",
  monat = "April 2025",
): string[] => ["1290 205", report, "YUM Gastronomie GmbH", kst, monat, "WES: KG3"];

function makePage1(kst = "YUM", monat = "April 2025"): string[] {
  // Seite mit Kopf + Zeilen 1-28. Wertespalten je Zeile:
  //   Monatswert  %  Kumuliert  %
  return [
    ...REAL_HEADER(kst, "Betriebswirtschaftliche Auswertung", monat),
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
    ...REAL_HEADER(kst, "Betriebswirtschaftliche Auswertung", monat),
    "Übertrag Vorseite",
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
    // außer Haus: Zeile ist da, Monatsspalte leer („–") → transparent 0.
    expect(b.values.speisenAusserHausCents).toBe(0);
    expect(b.missingFields).not.toContain("speisenAusserHausCents");
    expect(res.warnings.some((w) => /Zeile 8.*als 0,00/i.test(w))).toBe(true);
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

    // Fixture ist so gebaut, dass die Quersummen von bwa-core aufgehen.
    const check = validateBwaMonth(b.values as BwaMonthInput);
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

describe("parseBwaPdfText – eurodata-Realitätsfälle", () => {
  it("erkennt Kostenstelle im eurodata-Kopf ohne Label", () => {
    const res = parseBwaPdfText([makePage1("YUM"), makePage2("YUM")]);
    expect(res.blocks).toHaveLength(1);
    expect(res.blocks[0].costCenter).toBe("YUM");
    expect(res.blocks[0].entity).toBe("YUM Gastronomie GmbH");
  });

  it("Regression Variante A: altes Layout mit expliziter Kostenstellen-Zeile", () => {
    const p1 = [
      "Betriebswirtschaftliche Auswertung",
      "Alte GmbH",
      "Kostenstelle: XYZ",
      "April 2025",
      "6 Getränke 28.684 23,8 100.000 24,0",
      "11 Gesamtumsatz 120.713 100,0 424.500 100,0",
    ];
    const res = parseBwaPdfText([p1]);
    expect(res.blocks).toHaveLength(1);
    expect(res.blocks[0].costCenter).toBe("XYZ");
  });

  it("ignoriert Vorjahresvergleich-Seiten (6-Spalten-Layout)", () => {
    const vjv: string[] = [
      "1290 205",
      "Vorjahresvergleich",
      "YUM Gastronomie GmbH",
      "YUM",
      "April 2025",
      "WES: KG3",
      "Übertrag Vorseite",
      // 6 Spalten — würde fälschlich Personalkosten überschreiben, wenn die
      // Seite verarbeitet würde:
      "27 Personalkosten 89.580 1.000 12,3 341.615 4.000 8,5",
    ];
    const res = parseBwaPdfText([makePage1("YUM"), makePage2("YUM"), vjv]);
    expect(res.blocks).toHaveLength(1);
    expect(res.blocks[0].values.personalCents).toBe(8212300);
    expect(res.warnings.some((w) => /Vorjahresvergleich/i.test(w))).toBe(false);
  });

  it("ignoriert Jahresübersicht-Seiten", () => {
    const jue: string[] = [
      "1290 205",
      "Jahresübersicht",
      "YUM Gastronomie GmbH",
      "YUM",
      "April 2025",
      "WES: KG3",
      "6 Getränke 10.000 5,0 10.000 5,0",
    ];
    const res = parseBwaPdfText([jue]);
    expect(res.blocks).toHaveLength(0);
  });

  it("BWA-Fortsetzungsseite mit vollem Kopf fließt in denselben Block", () => {
    const res = parseBwaPdfText([makePage1("YUM"), makePage2("YUM")]);
    expect(res.blocks).toHaveLength(1);
    // Werte von Seite 1 (Umsatz) und Seite 2 (Betriebsergebnis) beide da:
    expect(res.blocks[0].values.umsatzCents).toBe(12071300);
    expect(res.blocks[0].values.betriebsergebnisCents).toBe(-845100);
  });

  it("parst Negativwert Betriebsergebnis", () => {
    const p: string[] = [
      "1290 205",
      "Betriebswirtschaftliche Auswertung",
      "YUM Gastronomie GmbH",
      "YUM",
      "April 2025",
      "WES: KG3",
      "52 Betriebsergebnis -1.737 -1,2 14.026 2,5",
    ];
    const res = parseBwaPdfText([p]);
    expect(res.blocks[0].values.betriebsergebnisCents).toBe(-173700);
  });
});

describe("parseBwaPdfText – Teil 2: leere Monatsspalte + Label-Symmetrie", () => {
  it("2-Token-Zeile (nur kumuliert) → Feld = 0 mit genau EINER Warnung", () => {
    const p: string[] = [...REAL_HEADER("YUM"), "50 Abschreibungen 9.219 1,6"];
    const res = parseBwaPdfText([p]);
    expect(res.blocks[0].values.abschreibungCents).toBe(0);
    const zeroWarn = res.warnings.filter((w) => /Zeile 50.*als 0,00/i.test(w));
    expect(zeroWarn).toHaveLength(1);
  });

  it("mehrere Fortsetzungsseiten mit derselben leeren Zeile → nur EINE Warnung", () => {
    const p1: string[] = [...REAL_HEADER("YUM"), "50 Abschreibungen 9.219 1,6"];
    const p2: string[] = [
      ...REAL_HEADER("YUM"),
      "Übertrag Vorseite",
      "50 Abschreibungen 9.219 1,6",
    ];
    const res = parseBwaPdfText([p1, p2]);
    expect(res.blocks[0].values.abschreibungCents).toBe(0);
    const zeroWarn = res.warnings.filter((w) => /Zeile 50.*als 0,00/i.test(w));
    expect(zeroWarn).toHaveLength(1);
  });

  it("echter Monatswert überschreibt eine zuvor angenommene 0", () => {
    const p1: string[] = [...REAL_HEADER("YUM"), "50 Abschreibungen 9.219 1,6"];
    const p2: string[] = [
      ...REAL_HEADER("YUM"),
      "Übertrag Vorseite",
      "50 Abschreibungen -407 -0,3 -1.600 -0,4",
    ];
    const res = parseBwaPdfText([p1, p2]);
    expect(res.blocks[0].values.abschreibungCents).toBe(-40700);
  });

  it("KFZ - Kosten mit Spaces um Bindestrich landet im Sachkosten-Detail", () => {
    const p: string[] = [...REAL_HEADER("YUM"), "39 KFZ - Kosten 899 0,6 2.663 0,5"];
    const res = parseBwaPdfText([p]);
    expect(res.blocks[0].sachkostenDetail["KFZ-Kosten"]).toBe(89900);
  });

  it("Restaurant- und Hotelbedarf (Bindestrich ohne Space) landet im Detail", () => {
    const p: string[] = [
      ...REAL_HEADER("YUM"),
      "34 Restaurant- und Hotelbedarf 7.593 5,4 20.056 3,5",
    ];
    const res = parseBwaPdfText([p]);
    expect(res.blocks[0].sachkostenDetail["Restaurant- und Hotelbedarf"]).toBe(759300);
  });

  it("Entity: Report-Titel und Firmenname in einer Zeile → Titel wird gestrippt", () => {
    // Reales Layout einer eurodata-Variante: „Betriebswirtschaftliche
    // Auswertung" klebt direkt am Firmennamen auf derselben Zeile.
    const p: string[] = [
      "1290 205",
      "Betriebswirtschaftliche Auswertung YUM Gastronomie GmbH",
      "YUM",
      "April 2025",
      "WES: KG3",
      "11 Gesamtumsatz 120.713 100,0 424.500 100,0",
    ];
    const res = parseBwaPdfText([p]);
    expect(res.blocks).toHaveLength(1);
    expect(res.blocks[0].entity).toBe("YUM Gastronomie GmbH");
  });

  it("Entity: reine Titelzeile ohne Firmenname wird übersprungen", () => {
    // Wenn die erste 'passende' Zeile nur der Report-Titel ist, muss der
    // Parser weitersuchen und die eigentliche Entity-Zeile finden — nicht
    // versehentlich mit leerem Entity abbrechen.
    const p: string[] = [
      "1290 205",
      "Betriebswirtschaftliche Auswertung GmbH", // Fake-Suffix nur zum Testen
      "YUM Gastronomie GmbH",
      "YUM",
      "April 2025",
      "11 Gesamtumsatz 120.713 100,0 424.500 100,0",
    ];
    const res = parseBwaPdfText([p]);
    expect(res.blocks[0].entity).toBe("YUM Gastronomie GmbH");
  });
});
});
