// CSV-Export der Lohnrechner-Perioden-Übersicht.
// Reine Serialisierung — keine Rechnung, keine Seiteneffekte.
// Format: UTF-8 BOM, Trenner `;`, Zeilenende `\r\n`. Geld in Cent (Ganzzahl),
// Stunden als Dezimal mit Punkt. Excel-kompatibel und maschinenlesbar.

export type UebersichtCsvRow = {
  persoNr: number | null;
  displayName: string;
  totalHours: number | null;
  hourlyRateCents: number | null;
  night25Hours: number | null;
  night40Hours: number | null;
  sundayHours: number | null;
  zuschlagCents: number | null;
  bruttoCents: number | null;
  lstCent: number | null;
  soliCent: number | null;
  kistCent: number | null;
  kvCent: number | null;
  rvCent: number | null;
  avCent: number | null;
  pvCent: number | null;
  nettoCents: number | null;
  auszahlungCents: number | null;
  workdayCount: number | null;
  mahlzeitenCent: number | null;
  sachbezugCent: number | null;
  urlaubTage: number | null;
  krankTage: number | null;
  avgStdTag: number | null;
  avgSfnTagCent: number | null;
  error: string | null;
};

const SEP = ";";
const EOL = "\r\n";
const BOM = "\uFEFF";

const HEADERS = [
  "perso_nr",
  "name",
  "stunden",
  "stundensatz_cent",
  "nacht25_std",
  "nacht40_std",
  "sonntag_std",
  "zuschlag_cent",
  "brutto_cent",
  "lst_cent",
  "soli_cent",
  "kist_cent",
  "kv_cent",
  "rv_cent",
  "av_cent",
  "pv_cent",
  "netto_cent",
  "auszahlung_cent",
  "arbeitstage",
  "mahlzeiten_cent",
  "sachbezug_cent",
  "urlaub_tage",
  "krank_tage",
  "avg_std_tag",
  "avg_sfn_tag_cent",
  "fehler",
] as const;

function escapeField(v: string): string {
  if (/[;"\r\n]/.test(v)) {
    return `"${v.replace(/"/g, '""')}"`;
  }
  return v;
}

function fmtInt(n: number | null): string {
  return n == null ? "" : String(Math.trunc(n));
}

function fmtHours(n: number | null): string {
  if (n == null) return "";
  // Dezimalpunkt, ohne Tausender-Trennung, ohne unnötige Stellen.
  return String(n);
}

export function buildUebersichtCsv(
  rows: UebersichtCsvRow[],
  meta: { periodLabel: string; mode: string },
): string {
  const comment = `# COCO Lohn-Übersicht${SEP} Periode=${meta.periodLabel}${SEP} Modus=${meta.mode}`;
  const headerLine = HEADERS.join(SEP);

  const dataLines = rows.map((r) => {
    const cells = [
      fmtInt(r.persoNr),
      escapeField(r.displayName),
      fmtHours(r.totalHours),
      fmtInt(r.hourlyRateCents),
      fmtHours(r.night25Hours),
      fmtHours(r.night40Hours),
      fmtHours(r.sundayHours),
      fmtInt(r.zuschlagCents),
      fmtInt(r.bruttoCents),
      fmtInt(r.lstCent),
      fmtInt(r.soliCent),
      fmtInt(r.kistCent),
      fmtInt(r.kvCent),
      fmtInt(r.rvCent),
      fmtInt(r.avCent),
      fmtInt(r.pvCent),
      fmtInt(r.nettoCents),
      fmtInt(r.auszahlungCents),
      fmtInt(r.workdayCount),
      fmtInt(r.mahlzeitenCent),
      fmtInt(r.sachbezugCent),
      fmtInt(r.urlaubTage),
      fmtInt(r.krankTage),
      fmtHours(r.avgStdTag),
      fmtInt(r.avgSfnTagCent),
      escapeField(r.error ?? ""),
    ];
    return cells.join(SEP);
  });

  return BOM + [comment, headerLine, ...dataLines].join(EOL) + EOL;
}

export const __test__ = { HEADERS, SEP, EOL, BOM };
