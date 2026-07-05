// PV3 — Parser für Vectron „Stunden-Bericht (lang)" (XLSX).
//
// Headless wie pos-report-parser.ts (PV2): Eingabe sind bereits extrahierte
// Zeilen-Arrays; die exceljs-Extraktion lebt in der UI-Schicht. Ergebnis
// analog `ParsedPosReport`.
//
// Sheet-Layout (an zwei realen Frank-Dateien verifiziert):
//   Kopfzeile: Nummer | Anzahl | Wert | %Wert | Arbeitsstunden | Umsatz pro Arbeitsstunde
//   Die letzten beiden Spalten sind leer → ignoriert.
//   Eine Füllzeile "-" direkt nach dem Kopf → überspringen.
//   Stundenzeilen: Nummer = "0:00" … "23:00" (führendes Leerzeichen bei
//   einstelligen Stunden möglich → trimmen). Leere Anzahl/Wert-Zellen = 0.
//   Negative Werte (Storno) werden durchgereicht.
//   Fußzeile beginnt mit "Alle (Zeit" → Kontrollsumme (Anzahl + Wert).
//
// %Wert wird NICHT importiert (derived values never stored); dient nur als
// Plausibilitäts-Gegenprobe (Warnung, nicht blockierend).

export type ParsedPosHourly = {
  rows: { hour: number; anzahl: number; wertCents: number }[];
  footer: { anzahl: number; wertCents: number } | null;
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
  anzahlCol: number;
  wertCol: number;
  pctCol: number | null;
};

function findHeader(raw: readonly Row[]): Header | null {
  const maxScan = Math.min(raw.length, 30);
  for (let i = 0; i < maxScan; i++) {
    const cells = (raw[i] ?? []).map((c) => toText(c).trim().toLowerCase());
    const nummerCol = cells.findIndex((c) => c === "nummer" || c.startsWith("nummer"));
    const anzahlCol = cells.findIndex((c) => c === "anzahl" || c.startsWith("anzahl"));
    const wertCol = cells.findIndex((c) => c === "wert" || c === "wert €" || c === "wert eur");
    if (nummerCol < 0 || anzahlCol < 0 || wertCol < 0) continue;
    const pctIdx = cells.findIndex(
      (c, j) => j > wertCol && (c === "%wert" || c.startsWith("%wert") || c.includes("%wert")),
    );
    return {
      headerIdx: i,
      nummerCol,
      anzahlCol,
      wertCol,
      pctCol: pctIdx >= 0 ? pctIdx : null,
    };
  }
  return null;
}

function parseHour(text: string): number | null {
  const s = text.trim();
  const m = /^(\d{1,2}):(\d{2})$/.exec(s);
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  if (min !== 0) return null;
  if (h < 0 || h > 23) return null;
  return h;
}

export function parsePosHourly(raw: readonly Row[]): ParsedPosHourly {
  const warnings: string[] = [];
  const rows: ParsedPosHourly["rows"] = [];
  const seenHours = new Set<number>();
  const duplicateHours = new Set<number>();
  let footer: ParsedPosHourly["footer"] = null;

  const hdr = findHeader(raw);
  if (!hdr) {
    return {
      rows: [],
      footer: null,
      warnings: ['Kopfzeile mit den Spalten "Nummer", "Anzahl" und "Wert" wurde nicht gefunden.'],
      checks: [
        { name: "footer_anzahl", expected: 0, actual: 0, ok: false },
        { name: "footer_wert", expected: 0, actual: 0, ok: false },
        { name: "hour_valid", expected: 0, actual: 0, ok: false },
      ],
    };
  }

  for (let i = hdr.headerIdx + 1; i < raw.length; i++) {
    const r = raw[i] ?? [];
    const nummerText = toText(r[hdr.nummerCol]).trim();
    if (nummerText === "" || nummerText === "-") continue;

    // Fußzeile: Nummer beginnt mit "Alle (Zeit" (auch "Alle (Zeitraum)" etc.).
    if (/^alle\s*\(zeit/i.test(nummerText)) {
      const anz = toNumber(r[hdr.anzahlCol]);
      const cents = Math.round(toNumber(r[hdr.wertCol]) * 100);
      footer = {
        anzahl: Number.isFinite(anz) ? Math.trunc(anz) : 0,
        wertCents: Number.isFinite(cents) ? cents : 0,
      };
      continue;
    }

    const hour = parseHour(nummerText);
    if (hour === null) {
      warnings.push(`Zeile mit ungültiger Stunde „${nummerText}" übersprungen.`);
      continue;
    }

    const anzahlVal = toNumber(r[hdr.anzahlCol]);
    const centsVal = Math.round(toNumber(r[hdr.wertCol]) * 100);
    const anzahl = Number.isFinite(anzahlVal) ? Math.trunc(anzahlVal) : 0;
    const wertCents = Number.isFinite(centsVal) ? centsVal : 0;

    if (seenHours.has(hour)) duplicateHours.add(hour);
    seenHours.add(hour);

    rows.push({ hour, anzahl, wertCents });
  }

  const sumAnzahl = rows.reduce((s, r) => s + r.anzahl, 0);
  const sumCents = rows.reduce((s, r) => s + r.wertCents, 0);

  const checks: ParsedPosHourly["checks"] = [];
  if (footer) {
    checks.push({
      name: "footer_anzahl",
      expected: footer.anzahl,
      actual: sumAnzahl,
      ok: footer.anzahl === sumAnzahl,
    });
    checks.push({
      name: "footer_wert",
      expected: footer.wertCents,
      actual: sumCents,
      ok: footer.wertCents === sumCents,
    });
  } else {
    warnings.push('Fußzeile ("Alle (Zeit…)") fehlt — Kontrollsumme kann nicht geprüft werden.');
    checks.push({ name: "footer_anzahl", expected: 0, actual: sumAnzahl, ok: false });
    checks.push({ name: "footer_wert", expected: 0, actual: sumCents, ok: false });
  }
  checks.push({
    name: "hour_valid",
    expected: rows.length,
    actual: seenHours.size,
    ok: duplicateHours.size === 0 && rows.every((r) => r.hour >= 0 && r.hour <= 23),
  });
  if (duplicateHours.size > 0) {
    warnings.push(
      `Doppelte Stunde(n): ${Array.from(duplicateHours)
        .sort((a, b) => a - b)
        .map((h) => `${h}:00`)
        .join(", ")}.`,
    );
  }

  // %-Warnung (nicht blockierend): |exportiertes % − berechnetes %| > 0,15 pp.
  if (hdr.pctCol !== null && sumCents !== 0) {
    for (let i = hdr.headerIdx + 1; i < raw.length; i++) {
      const r = raw[i] ?? [];
      const nummerText = toText(r[hdr.nummerCol]).trim();
      const hour = parseHour(nummerText);
      if (hour === null) continue;
      const exportedPct = toNumber(r[hdr.pctCol]);
      if (!Number.isFinite(exportedPct)) continue;
      const row = rows.find((x) => x.hour === hour);
      if (!row) continue;
      const calcPct = (row.wertCents / sumCents) * 100;
      if (Math.abs(exportedPct - calcPct) > 0.15) {
        warnings.push(
          `Stunde ${hour}:00: %-Wert in Datei (${exportedPct.toFixed(2)}) weicht > 0,15 pp vom berechneten Anteil (${calcPct.toFixed(2)}) ab.`,
        );
      }
    }
  }

  return { rows, footer, checks, warnings };
}

export function allHourlyChecksOk(parsed: ParsedPosHourly): boolean {
  return parsed.checks.length > 0 && parsed.checks.every((c) => c.ok);
}
