// Minimaler RFC-4180-CSV-Parser für Supabase-Exporte.
// Komma-getrennt, "..." Quoting mit "" als Escape, \r\n oder \n als Zeilentrenner.
// Bewusst keine Abhängigkeit — kleine Oberfläche, vollständig getestet.

export type CsvRow = Record<string, string | null>;

export type ParsedCsv = {
  headers: string[];
  rows: CsvRow[];
};

export function parseCsv(text: string): ParsedCsv {
  // BOM entfernen, Zeilenumbrüche normalisieren (innerhalb Quotes geschützt).
  const src = text.replace(/^\uFEFF/, "");
  const fields: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          cur += '"';
          i++;
        } else {
          inQuotes = false;
        }
      } else {
        cur += c;
      }
      continue;
    }
    if (c === '"') {
      inQuotes = true;
    } else if (c === ",") {
      row.push(cur);
      cur = "";
    } else if (c === "\n" || c === "\r") {
      if (c === "\r" && src[i + 1] === "\n") i++;
      row.push(cur);
      cur = "";
      fields.push(row);
      row = [];
    } else {
      cur += c;
    }
  }
  if (cur.length > 0 || row.length > 0) {
    row.push(cur);
    fields.push(row);
  }
  if (fields.length === 0) {
    return { headers: [], rows: [] };
  }
  const headers = fields[0].map((h) => h.trim());
  const rows: CsvRow[] = [];
  for (let r = 1; r < fields.length; r++) {
    const raw = fields[r];
    // Vollständig leere Zeile am Ende ignorieren.
    if (raw.length === 1 && raw[0] === "") continue;
    const row: CsvRow = {};
    for (let c = 0; c < headers.length; c++) {
      const v = raw[c];
      row[headers[c]] = v === undefined || v === "" ? null : v;
    }
    rows.push(row);
  }
  return { headers, rows };
}

/**
 * Verifiziert, dass die Header der CSV exakt der erwarteten Liste entsprechen.
 * Reihenfolge ist egal, aber Mengen müssen identisch sein. Wirft bei Abweichung
 * mit präziser Aufzählung der fehlenden / überzähligen Spalten.
 */
export function assertHeaders(actual: string[], expected: readonly string[], context: string): void {
  const actualSet = new Set(actual);
  const expectedSet = new Set(expected);
  const missing = expected.filter((h) => !actualSet.has(h));
  const extra = actual.filter((h) => !expectedSet.has(h));
  if (missing.length === 0 && extra.length === 0) return;
  const parts: string[] = [];
  if (missing.length) parts.push(`fehlend: ${missing.join(", ")}`);
  if (extra.length) parts.push(`überzählig: ${extra.join(", ")}`);
  throw new Error(`CSV-Header (${context}) stimmt nicht: ${parts.join(" | ")}`);
}