import { describe, expect, it } from "vitest";
import {
  decodeCp1252,
  parseBankCsv,
  parseCsv,
  parseGermanAmountToCents,
  parseGermanDateToIso,
  resolveColumns,
} from "./bank-csv-parser";

describe("parseGermanAmountToCents", () => {
  it("wandelt einfache Beträge um", () => {
    expect(parseGermanAmountToCents("1,50")).toBe(150);
    expect(parseGermanAmountToCents("12,50")).toBe(1250);
  });
  it("negative Beträge", () => {
    expect(parseGermanAmountToCents("-687,50")).toBe(-68750);
  });
  it("Tausenderpunkt + Dezimalkomma", () => {
    expect(parseGermanAmountToCents("1.234,56")).toBe(123456);
    expect(parseGermanAmountToCents("306.234,05")).toBe(30623405);
  });
  it("Punkt als Dezimaltrenner nur ohne Komma und mit 1-2 NKs", () => {
    expect(parseGermanAmountToCents("12.50")).toBe(1250);
    expect(parseGermanAmountToCents("1.234")).toBeNull();
  });
  it("Ganzzahl ohne Trenner", () => {
    expect(parseGermanAmountToCents("42")).toBe(4200);
  });
  it("Müll → null", () => {
    expect(parseGermanAmountToCents("abc")).toBeNull();
    expect(parseGermanAmountToCents("")).toBeNull();
  });
});

describe("parseGermanDateToIso", () => {
  it("d.M.yyyy → ISO", () => {
    expect(parseGermanDateToIso("2.1.2026")).toBe("2026-01-02");
    expect(parseGermanDateToIso("30.06.2026")).toBe("2026-06-30");
  });
  it("Müll → null", () => {
    expect(parseGermanDateToIso("32.1.2026")).toBeNull();
    expect(parseGermanDateToIso("2026-01-02")).toBeNull();
    expect(parseGermanDateToIso("")).toBeNull();
  });
});

describe("parseCsv", () => {
  it("splittet ;-Felder mit Quotes und escaped Quotes", () => {
    const t = `"a";"b";"c"\n"1";"zwei ""in"" quotes";"3"\n`;
    expect(parseCsv(t)).toEqual([
      ["a", "b", "c"],
      ["1", 'zwei "in" quotes', "3"],
    ]);
  });
  it("respektiert CRLF und leere Zeilen", () => {
    const t = `"a";"b"\r\n"1";"2"\r\n\r\n"3";"4"\r\n`;
    expect(parseCsv(t)).toEqual([
      ["a", "b"],
      ["1", "2"],
      ["3", "4"],
    ]);
  });
});

describe("decodeCp1252", () => {
  it("dekodiert Umlaute korrekt (nicht als U+FFFD)", () => {
    // cp1252: ä=0xE4, ö=0xF6, ü=0xFC, ß=0xDF, €=0x80
    const bytes = new Uint8Array([0xe4, 0xf6, 0xfc, 0xdf, 0x80]);
    expect(decodeCp1252(bytes)).toBe("äöüß€");
  });
});

describe("resolveColumns", () => {
  it("wirft bei fehlender Pflichtspalte", () => {
    expect(() => resolveColumns(["IBAN", "Betrag"])).toThrow(/Buchungstag|Laufende/);
  });
  it("erkennt Aliase (Reihenfolge egal)", () => {
    const map = resolveColumns([
      "Laufende Nummer",
      "Buchungstag",
      "Betrag",
      "IBAN",
      "Begünstigter/Absender - Name",
      "Verwendungszweckzeile 1",
      "Saldo",
    ]);
    expect(map.iban).toBe(3);
    expect(map.betrag).toBe(2);
    expect(map.gegenpartei).toBe(4);
  });
});

describe("parseBankCsv", () => {
  const header = [
    '"IBAN"',
    '"Buchungstag"',
    '"Wertstellungstag"',
    '"Begünstigter/Absender - Name"',
    '"Verwendungszweckzeile 1"',
    '"Kategorie"',
    '"Unterkategorie"',
    '"Betrag"',
    '"Saldo"',
    '"Laufende Nummer"',
  ].join(";");

  function row(
    date: string,
    name: string,
    zweck: string,
    betrag: string,
    saldo: string,
    lfd: string,
    iban = "DE53700700240052787900",
  ) {
    return [
      `"${iban}"`,
      `"${date}"`,
      `"${date}"`,
      `"${name}"`,
      `"${zweck}"`,
      `""`,
      `""`,
      `"${betrag}"`,
      `"${saldo}"`,
      `"${lfd}"`,
    ].join(";");
  }

  it("dedupliziert Sammelbuchungen anhand der laufenden Nummer", () => {
    // Drei Zeilen mit derselben lfd. Nr. — nur eine echte Buchung.
    const csv = [
      header,
      row("02.01.2026", "First Data", "Sammel", "-52.788,30", "305.995,20", "10"),
      row("02.01.2026", "First Data", "Sammel", "-52.788,30", "305.995,20", "10"),
      row("02.01.2026", "First Data", "Sammel", "-52.788,30", "305.995,20", "10"),
      row("03.01.2026", "KAO", "Ware", "-500,00", "305.495,20", "11"),
    ].join("\n");
    const res = parseBankCsv(csv);
    expect(res.rohZeilen).toBe(4);
    expect(res.eindeutig).toBe(2);
    expect(res.rows.map((r) => r.laufendeNummer)).toEqual([10, 11]);
  });

  it("Netto = Saldo-Delta (Saldo-Abgleich grün)", () => {
    const csv = [
      header,
      // Start-Saldo VOR Zeile 1 = 305.995,20 - (-52.788,30) = 358.783,50
      row("02.01.2026", "First Data", "Sammel", "-52.788,30", "305.995,20", "10"),
      row("03.01.2026", "KAO", "Ware", "-500,00", "305.495,20", "11"),
      row("04.01.2026", "TSB-Gast", "Bar", "1.000,00", "306.495,20", "12"),
    ].join("\n");
    const res = parseBankCsv(csv);
    const netto = res.summeEinCents + res.summeAusCents;
    expect(res.saldoDeltaCents).toBe(netto);
    expect(res.saldoAbgleichOk).toBe(true);
  });

  it("lehnt Header ohne Pflichtspalten ab", () => {
    expect(() => parseBankCsv('"foo";"bar"\n"1";"2"')).toThrow();
  });

  it("liefert Zeitraum in ISO-Grenzen", () => {
    const csv = [
      header,
      row("30.06.2026", "X", "", "1,00", "1,00", "22"),
      row("02.01.2026", "Y", "", "1,00", "0,00", "20"),
      row("15.03.2026", "Z", "", "1,00", "0,50", "21"),
    ].join("\n");
    const res = parseBankCsv(csv);
    expect(res.zeitraum).toEqual({ from: "2026-01-02", to: "2026-06-30" });
  });
});
