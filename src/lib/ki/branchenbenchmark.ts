// KI3 — Kuratierte Branchen-Referenzwerte (Vollgastronomie DE).
//
// Quelle: DEHOGA-Zahlenspiegel / Branchenbericht. Werte sind Richtgrößen,
// keine Punktschätzung — Segment "Vollgastronomie DE" ohne feinere Splits.
// Pflege: 1× jährlich (nach Erscheinen des neuen DEHOGA-Berichts) hier
// anpassen; das Tool `branchenbenchmark_lookup` liefert automatisch die
// aktuelle Version inkl. Stand-Datum und Quelle.
//
// Wichtig: Diese Datei ist client-safe (kein Server-Import) — Werte sind
// öffentlich zitierbar.

export type BenchmarkKennzahl =
  | "umsatz_pro_arbeitsstunde"
  | "personalkostenquote"
  | "wareneinsatzquote"
  | "bon_pro_gast";

export type BenchmarkEntry = {
  kennzahl: BenchmarkKennzahl;
  label: string;
  einheit: string;
  segment: "vollgastronomie_de";
  segment_label: string;
  von: number;
  bis: number;
  hinweis: string;
};

export const BENCHMARK_STAND = "2024";
export const BENCHMARK_QUELLE =
  "DEHOGA Bundesverband — Branchenbericht / Zahlenspiegel Gastgewerbe";

export const BENCHMARKS: readonly BenchmarkEntry[] = [
  {
    kennzahl: "umsatz_pro_arbeitsstunde",
    label: "Umsatz pro Arbeitsstunde",
    einheit: "EUR (netto) / Netto-Arbeitsstunde",
    segment: "vollgastronomie_de",
    segment_label: "Vollgastronomie Deutschland",
    von: 55,
    bis: 70,
    hinweis:
      "Richtwert für à-la-carte-Restaurants. Werte < 50 EUR/h deuten auf Überbesetzung oder schwache Auslastung, > 75 EUR/h auf sehr straffe Besetzung.",
  },
  {
    kennzahl: "personalkostenquote",
    label: "Personalkostenquote",
    einheit: "% vom Netto-Umsatz",
    segment: "vollgastronomie_de",
    segment_label: "Vollgastronomie Deutschland",
    von: 32,
    bis: 38,
    hinweis:
      "Brutto-Personalkosten inkl. AG-Anteil zur Sozialversicherung. Vergleichbar nur mit Personalkosten in derselben Definition — COCOs Tool personalkosten_quote enthält AG-Anteil und SFN NICHT und liegt daher tendenziell niedriger.",
  },
  {
    kennzahl: "wareneinsatzquote",
    label: "Wareneinsatzquote (gesamt)",
    einheit: "% vom Netto-Umsatz",
    segment: "vollgastronomie_de",
    segment_label: "Vollgastronomie Deutschland",
    von: 28,
    bis: 33,
    hinweis:
      "Küche typ. 28–32 %, Getränke typ. 18–22 %; Mischwert je nach Umsatzstruktur. Wareneinsatz = Einkauf ± Inventurdifferenz.",
  },
  {
    kennzahl: "bon_pro_gast",
    label: "Ø Bon pro Gast",
    einheit: "EUR (brutto) / Gast",
    segment: "vollgastronomie_de",
    segment_label: "Vollgastronomie Deutschland",
    von: 25,
    bis: 40,
    hinweis:
      "Große Spannweite je nach Preisniveau und Getränkeanteil. Für die eigene Einordnung ist die Entwicklung im Zeitverlauf oft aussagekräftiger als der Absolutwert.",
  },
];

export function lookupBenchmark(kennzahl: BenchmarkKennzahl): BenchmarkEntry | undefined {
  return BENCHMARKS.find((b) => b.kennzahl === kennzahl);
}

export function listBenchmarks(): readonly BenchmarkEntry[] {
  return BENCHMARKS;
}