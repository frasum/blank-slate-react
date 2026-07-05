// PV2 — Parser für Vectron „Artikel-Berichte" (XLSX).
//
// Bewusst headless: Eingabe sind bereits extrahierte Zeilen
// `Array<Array<string | number | null>>`. Die eigentliche exceljs-Extraktion
// lebt in der UI-Schicht (bestellung.pos-verkauf.tsx). So bleibt der Parser
// unabhängig von exceljs, in Node/Vitest testbar und ohne Browser-Bindings.
//
// Zwei Sheet-Varianten (an vier realen Frank-Dateien verifiziert):
//   4-Spalten: Nummer | Name | Verkauf | €
//   6-Spalten: Nummer | Name | Verbrauch | € | Verkauf | €
// Verkauf-Spalten werden per Kopfzeile erkannt — NICHT über Positions-Raten.
//
// Regeln (siehe Bauplan PV2):
//   • Deaktivierte Artikel stehen in [eckigen Klammern] → strippen.
//   • Fußzeile mit Nummer='*' & Name='Alle (Artikel)' liefert Kontrollsumme.
//   • Namenlose PLU-Zeilen → skipped + Warnung (Beträge fließen in die
//     Fußzeilen-Kontrollsumme, damit Σ rows + Σ skipped == footer trifft).
//   • Negative Werte (Storno/Rabatt) werden durchgereicht.
//   • € → BIGINT cents via Math.round(eur * 100).
//   • Fehlt die Fußzeile, werden footer_*-Checks als ok=false geführt
//     (kein stiller Skip — Vectron-Exporte haben immer eine).

export type ParsedPosReport = {
  rows: { nummer: number; name: string; verkaufCount: number; umsatzCents: number }[];
  footer: { verkaufCount: number; umsatzCents: number } | null;
  skipped: { nummer: number | null; verkaufCount: number; umsatzCents: number }[];
  checks: { name: string; expected: number; actual: number; ok: boolean }[];
  warnings: string[];
};

type Cell = string | number | null;
type Row = readonly Cell[];

function toText(v: Cell | undefined): string {
  if (v === null || v === undefined) return "";
  return String(v);
}

function toNumber(v: Cell | undefined): number {
  if (v === null || v === undefined || v === "") return NaN;
  if (typeof v === "number") return v;
  // Deutsche Zahlenformate (1.234,56) und US-Formate (1234.56) tolerieren.
  const raw = String(v).trim().replace(/\s/g, "");
  if (/^-?\d+(\.\d{3})*,\d+$/.test(raw)) {
    return Number(raw.replace(/\./g, "").replace(",", "."));
  }
  if (/^-?\d+,\d+$/.test(raw)) return Number(raw.replace(",", "."));
  return Number(raw);
}

type Header = {
  headerIdx: number;
  nummerCol: number;
  nameCol: number;
  countCol: number;
  eurCol: number;
};

function findHeader(raw: readonly Row[]): Header | null {
  const maxScan = Math.min(raw.length, 30);
  for (let i = 0; i < maxScan; i++) {
    const cells = (raw[i] ?? []).map((c) => toText(c).trim().toLowerCase());
    const nummerCol = cells.findIndex((c) => c === "nummer" || c.startsWith("nummer"));
    const nameCol = cells.findIndex((c) => c === "name" || c.startsWith("name"));
    if (nummerCol < 0 || nameCol < 0) continue;
    // "Verkauf": in der 6-Spalten-Variante gibt es sowohl "Verbrauch" als auch
    // "Verkauf" — wir nehmen die LETZTE "Verkauf"-Spalte, damit die Zählspalte
    // in beiden Layouts korrekt trifft.
    let countCol = -1;
    for (let j = 0; j < cells.length; j++) {
      const c = cells[j];
      if (c === "verkauf" || c.startsWith("verkauf")) countCol = j;
    }
    if (countCol < 0) continue;
    // €-/Umsatz-Spalte: erste passende Spalte rechts von "Verkauf".
    let eurCol = -1;
    for (let j = countCol + 1; j < cells.length; j++) {
      const c = cells[j];
      if (c === "€" || c.includes("€") || c === "eur" || c === "umsatz" || c === "umsatz €") {
        eurCol = j;
        break;
      }
    }
    if (eurCol < 0) continue;
    return { headerIdx: i, nummerCol, nameCol, countCol, eurCol };
  }
  return null;
}

function isRowEmpty(r: Row, cols: readonly number[]): boolean {
  return cols.every((idx) => {
    const v = r[idx];
    return v === null || v === undefined || (typeof v === "string" && v.trim() === "");
  });
}

function stripBrackets(name: string): string {
  return /^\[.*\]$/.test(name) ? name.slice(1, -1).trim() : name;
}

export function parsePosReport(raw: readonly Row[]): ParsedPosReport {
  const warnings: string[] = [];
  const rows: ParsedPosReport["rows"] = [];
  const skipped: ParsedPosReport["skipped"] = [];
  let footer: ParsedPosReport["footer"] = null;
  const seen = new Set<number>();
  const duplicates = new Set<number>();

  const hdr = findHeader(raw);
  if (!hdr) {
    return {
      rows: [],
      footer: null,
      skipped: [],
      warnings: ['Kopfzeile mit den Spalten "Nummer", "Name" und "Verkauf" wurde nicht gefunden.'],
      checks: [
        { name: "footer_stueck", expected: 0, actual: 0, ok: false },
        { name: "footer_umsatz", expected: 0, actual: 0, ok: false },
        { name: "nummer_unique", expected: 0, actual: 0, ok: false },
      ],
    };
  }

  const relevantCols = [hdr.nummerCol, hdr.nameCol, hdr.countCol, hdr.eurCol];

  for (let i = hdr.headerIdx + 1; i < raw.length; i++) {
    const r = raw[i] ?? [];
    if (isRowEmpty(r, relevantCols)) continue;

    const nummerText = toText(r[hdr.nummerCol]).trim();
    const nameText = toText(r[hdr.nameCol]).trim();
    const countVal = toNumber(r[hdr.countCol]);
    const centsVal = Math.round(toNumber(r[hdr.eurCol]) * 100);

    // Fußzeile: Nummer='*' oder Name beginnt mit „Alle".
    if (nummerText === "*" || /^alle\b/i.test(nameText)) {
      footer = {
        verkaufCount: Number.isFinite(countVal) ? Math.trunc(countVal) : 0,
        umsatzCents: Number.isFinite(centsVal) ? centsVal : 0,
      };
      continue;
    }

    const nummer = Number.parseInt(nummerText, 10);

    // Namenlose PLU-Zeile → skipped + Warnung; Beträge zählen für Kontrollsumme.
    if (!nameText) {
      const count = Number.isFinite(countVal) ? Math.trunc(countVal) : 0;
      const cents = Number.isFinite(centsVal) ? centsVal : 0;
      skipped.push({
        nummer: Number.isFinite(nummer) ? nummer : null,
        verkaufCount: count,
        umsatzCents: cents,
      });
      warnings.push(
        `Zeile ohne Namen übersprungen (Nr. ${
          Number.isFinite(nummer) ? nummer : "?"
        }, ${count} Stk / ${(cents / 100).toFixed(2)} €).`,
      );
      continue;
    }

    if (!Number.isFinite(nummer)) {
      warnings.push(`Zeile mit ungültiger Nummer „${nummerText}" übersprungen.`);
      continue;
    }
    if (!Number.isFinite(countVal) || !Number.isFinite(centsVal)) {
      warnings.push(`Zeile Nr. ${nummer} „${nameText}" hat unlesbare Zahlen — übersprungen.`);
      continue;
    }

    if (seen.has(nummer)) duplicates.add(nummer);
    seen.add(nummer);

    rows.push({
      nummer,
      name: stripBrackets(nameText),
      verkaufCount: Math.trunc(countVal),
      umsatzCents: centsVal,
    });
  }

  const sumRowsCount = rows.reduce((s, r) => s + r.verkaufCount, 0);
  const sumRowsCents = rows.reduce((s, r) => s + r.umsatzCents, 0);
  const sumSkippedCount = skipped.reduce((s, r) => s + r.verkaufCount, 0);
  const sumSkippedCents = skipped.reduce((s, r) => s + r.umsatzCents, 0);

  const checks: ParsedPosReport["checks"] = [];
  if (footer) {
    checks.push({
      name: "footer_stueck",
      expected: footer.verkaufCount,
      actual: sumRowsCount + sumSkippedCount,
      ok: footer.verkaufCount === sumRowsCount + sumSkippedCount,
    });
    checks.push({
      name: "footer_umsatz",
      expected: footer.umsatzCents,
      actual: sumRowsCents + sumSkippedCents,
      ok: footer.umsatzCents === sumRowsCents + sumSkippedCents,
    });
  } else {
    warnings.push('Fußzeile ("Alle (Artikel)") fehlt — Kontrollsumme kann nicht geprüft werden.');
    checks.push({
      name: "footer_stueck",
      expected: 0,
      actual: sumRowsCount + sumSkippedCount,
      ok: false,
    });
    checks.push({
      name: "footer_umsatz",
      expected: 0,
      actual: sumRowsCents + sumSkippedCents,
      ok: false,
    });
  }

  checks.push({
    name: "nummer_unique",
    expected: rows.length,
    actual: seen.size,
    ok: duplicates.size === 0,
  });
  if (duplicates.size > 0) {
    warnings.push(
      `Doppelte Artikelnummer(n): ${Array.from(duplicates)
        .sort((a, b) => a - b)
        .join(", ")}.`,
    );
  }

  return { rows, footer, skipped, checks, warnings };
}

/** Der Client sendet die Fußzeilen-Summen als `footer - Σ skipped` — dann muss
 *  Σ rows === footer gelten. Diese kleine Ableitung hier, damit der UI-Code
 *  nicht selbst summiert (auch für Server-Gate-Wiederholung nützlich). */
export function footerForServer(parsed: ParsedPosReport): {
  verkaufCount: number;
  umsatzCents: number;
} | null {
  if (!parsed.footer) return null;
  const skipCount = parsed.skipped.reduce((s, r) => s + r.verkaufCount, 0);
  const skipCents = parsed.skipped.reduce((s, r) => s + r.umsatzCents, 0);
  return {
    verkaufCount: parsed.footer.verkaufCount - skipCount,
    umsatzCents: parsed.footer.umsatzCents - skipCents,
  };
}

export function allChecksOk(parsed: ParsedPosReport): boolean {
  return parsed.checks.length > 0 && parsed.checks.every((c) => c.ok);
}
