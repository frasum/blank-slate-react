import { describe, it, expect } from "vitest";
import { buildUebersichtCsv, type UebersichtCsvRow } from "./lohn-csv-export";

const FULL: UebersichtCsvRow = {
  persoNr: 42,
  displayName: "Müller, Anna",
  totalHours: 12.5,
  hourlyRateCents: 1500,
  night25Hours: 2.25,
  night40Hours: 0,
  sundayHours: 4,
  zuschlagCents: 1234,
  bruttoCents: 200000,
  lstCent: 1000,
  soliCent: 0,
  kistCent: 80,
  kvCent: 1500,
  rvCent: 1800,
  avCent: 200,
  pvCent: 300,
  nettoCents: 195120,
  auszahlungCents: 195120,
  workdayCount: 19,
  mahlzeitenCent: 8683,
  sachbezugCent: 5000,
  urlaubTage: 2,
  krankTage: 1,
  urlaubTageEst: 3,
  krankTageEst: 2,
  avgStdTag: 7.85,
  avgSfnTagCent: 1234,
  error: null,
};

const ERR: UebersichtCsvRow = {
  persoNr: 7,
  displayName: "Schmid; Max",
  totalHours: null,
  hourlyRateCents: null,
  night25Hours: null,
  night40Hours: null,
  sundayHours: null,
  zuschlagCents: null,
  bruttoCents: null,
  lstCent: null,
  soliCent: null,
  kistCent: null,
  kvCent: null,
  rvCent: null,
  avCent: null,
  pvCent: null,
  nettoCents: null,
  auszahlungCents: null,
  workdayCount: null,
  mahlzeitenCent: null,
  sachbezugCent: null,
  urlaubTage: null,
  krankTage: null,
  urlaubTageEst: null,
  krankTageEst: null,
  avgStdTag: null,
  avgSfnTagCent: null,
  error: "Keine Personaldaten für diesen Mitarbeiter.",
};

const HEADER_LINE =
  "perso_nr;name;stunden;stundensatz_cent;nacht25_std;nacht40_std;sonntag_std;zuschlag_cent;brutto_cent;lst_cent;soli_cent;kist_cent;kv_cent;rv_cent;av_cent;pv_cent;netto_cent;auszahlung_cent;arbeitstage;mahlzeiten_cent;sachbezug_cent;urlaub_tage;krank_tage;urlaub_tage_est;krank_tage_est;avg_std_tag;avg_sfn_tag_cent;fehler";

describe("buildUebersichtCsv", () => {
  it("startet mit BOM, Kommentarzeile und exakter Header-Zeile", () => {
    const csv = buildUebersichtCsv([], { periodLabel: "Juni 2026", mode: "simple" });
    const lines = csv.split("\r\n");
    expect(csv.startsWith("\uFEFF")).toBe(true);
    expect(lines[0]).toBe("\uFEFF# COCO Lohn-Übersicht; Periode=Juni 2026; Modus=simple");
    expect(lines[1]).toBe(HEADER_LINE);
  });

  it("serialisiert eine Voll-Zeile mit Ganzzahl-Cent und Dezimal-Stunden", () => {
    const csv = buildUebersichtCsv([FULL], { periodLabel: "P", mode: "simple" });
    const lines = csv.split("\r\n");
    const row = lines[2].split(";");
    expect(row).toHaveLength(29);
    expect(row[0]).toBe("42");
    expect(row[1]).toBe("Müller, Anna");
  });

  it('quotet name nur bei ;, " oder Zeilenumbruch', () => {
    const csv = buildUebersichtCsv([FULL], { periodLabel: "P", mode: "simple" });
    const row = csv.split("\r\n")[2].split(";");
    expect(row[1]).toBe("Müller, Anna");
    expect(row[2]).toBe("12.5");
    expect(row[3]).toBe("1500");
    expect(row[28]).toBe("");
  });

  it("Fehler-Zeile: Zahlenspalten leer, name escaped wegen ;, fehler gesetzt", () => {
    const csv = buildUebersichtCsv([ERR], { periodLabel: "P", mode: "simple" });
    const line = csv.split("\r\n")[2];
    // Name enthält ";", muss in Anführungszeichen
    expect(line.startsWith('7;"Schmid; Max";')).toBe(true);
    // Alle Zahlenspalten leer ⇒ viele aufeinanderfolgende ;
    expect(line).toContain(";;;;;;;;;;;;;;;;");
    expect(line.endsWith(";Keine Personaldaten für diesen Mitarbeiter.")).toBe(true);
  });

  it('verdoppelt " innerhalb gequoteter Felder', () => {
    const row: UebersichtCsvRow = { ...FULL, displayName: 'Say "Hi"; ok' };
    const csv = buildUebersichtCsv([row], { periodLabel: "P", mode: "simple" });
    const line = csv.split("\r\n")[2];
    expect(line).toContain('"Say ""Hi""; ok"');
  });
});
