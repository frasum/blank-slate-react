// Reines Modul: parst eurodata-BWA-Seitentexte (bereits pro Seite in Zeilen
// gruppiert) in editierbare Blöcke. Kein pdfjs-Import, kein DOM — damit die
// Logik headless testbar bleibt. Der PDF-Text wird in der UI-Schicht via
// pdfjs (Muster split-combined, y-Gruppierung) zu string[][] extrahiert und
// hier reingereicht.
//
// Wichtige Regel (§ Ehrlichkeit / Anti-Halluzination):
// - Mapping erfolgt IMMER über die BWA-Zeilennummer PLUS eine
//   Label-Prüfung (Substring). Passt das Label nicht, wird das Feld als
//   fehlend markiert + Warnung ausgegeben — NIE stillschweigend die
//   nächstbeste Zahl übernehmen.
// - Nur die ERSTE Wertespalte (Abrechnungszeitraum) wird gelesen.

import type { BwaMonthInput } from "./bwa-core";

export type ParsedBwaBlock = {
  entity: string;
  costCenter: string;
  /** Monatserster im ISO-Format YYYY-MM-01 */
  month: string;
  values: Partial<BwaMonthInput>;
  sachkostenDetail: Record<string, number>;
  /** Namen (Keys aus BwaMonthInput) für die kein Wert gefunden wurde. */
  missingFields: string[];
};

export type ParseResult = {
  blocks: ParsedBwaBlock[];
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Zahlen
// ---------------------------------------------------------------------------

/**
 * "1.234" → 123400, "-324" → -32400, ""/"–"/"—"/"-" → null.
 * BWA-Blätter sind auf ganze Euro gerundet, deshalb kein Nachkomma erwartet;
 * aber "1.234,56" wird auch akzeptiert (defensiv).
 */
export function parseGermanAmountToCents(s: string | undefined | null): number | null {
  if (s == null) return null;
  const t = s.trim();
  if (t === "" || t === "–" || t === "—" || t === "-") return null;
  let neg = false;
  let body = t;
  if (body.startsWith("-")) {
    neg = true;
    body = body.slice(1);
  }
  // Punkte sind Tausendertrenner (deutsches Format ohne oder mit Komma-Dez).
  if (body.includes(",")) {
    if ((body.match(/,/g) ?? []).length > 1) return null;
    body = body.replace(/\./g, "");
    const [intPart, decPartRaw] = body.split(",");
    const decPart = (decPartRaw ?? "").slice(0, 2).padEnd(2, "0");
    if (!/^\d+$/.test(intPart) || !/^\d{2}$/.test(decPart)) return null;
    const cents = Number.parseInt(intPart, 10) * 100 + Number.parseInt(decPart, 10);
    return neg ? -cents : cents;
  }
  const clean = body.replace(/\./g, "");
  if (!/^\d+$/.test(clean)) return null;
  const cents = Number.parseInt(clean, 10) * 100;
  return neg ? -cents : cents;
}

function isAmountToken(t: string): boolean {
  return t === "–" || t === "—" || t === "-" || /^-?[\d.,]+$/.test(t);
}

// ---------------------------------------------------------------------------
// Mappings
// ---------------------------------------------------------------------------

type FieldMap = {
  row: number;
  label: string; // erwarteter Label-Substring (case-insensitive Vergleich nach Normalisierung)
  key: keyof BwaMonthInput;
};

const FIELD_MAP: FieldMap[] = [
  { row: 6, label: "getränke", key: "getraenkeCents" },
  { row: 7, label: "speisen im haus", key: "speisenHausCents" },
  { row: 8, label: "speisen außer haus", key: "speisenAusserHausCents" },
  { row: 10, label: "sonstige erlöse", key: "sonstigeErloeseCents" },
  { row: 11, label: "gesamtumsatz", key: "umsatzCents" },
  { row: 12, label: "sonstige betriebliche erträge", key: "sonstErtraegeCents" },
  { row: 22, label: "wareneinsatz gesamt", key: "wareneinsatzCents" },
  { row: 27, label: "personalkosten", key: "personalCents" },
  { row: 47, label: "summe sachkosten", key: "sachkostenCents" },
  { row: 49, label: "anlagebedingte kosten", key: "anlageCents" },
  { row: 50, label: "abschreibungen", key: "abschreibungCents" },
  { row: 52, label: "betriebsergebnis", key: "betriebsergebnisCents" },
];

/** Hauptzeilen des Sachkosten-Details (Unterpositionen "- davon …" der Zeilen
 *  31-33 werden NICHT übernommen). Zeile 45 (Leasing) nur wenn Wert vorhanden.
 */
const SACHKOSTEN_DETAIL_ROWS: { row: number; label: string; canonicalLabel: string }[] = [
  { row: 30, label: "betriebsbedingte raumkosten", canonicalLabel: "Betriebsbedingte Raumkosten" },
  { row: 34, label: "restaurant- und hotelbedarf", canonicalLabel: "Restaurant- und Hotelbedarf" },
  { row: 35, label: "marketing", canonicalLabel: "Marketing/Werbung" },
  { row: 36, label: "vertriebskosten", canonicalLabel: "Vertriebskosten" },
  { row: 37, label: "gästeunterhaltung", canonicalLabel: "Gästeunterhaltung" },
  { row: 38, label: "reisekosten", canonicalLabel: "Reisekosten und Fortbildung" },
  { row: 39, label: "kfz-kosten", canonicalLabel: "KFZ-Kosten" },
  { row: 40, label: "gebühren", canonicalLabel: "Gebühren/Beiträge/Versicherungen" },
  { row: 41, label: "bürobedarf", canonicalLabel: "Bürobedarf/Porto/Telefon/Internet" },
  { row: 42, label: "beratung", canonicalLabel: "Steuer-/Rechts-/sonstige Beratung" },
  { row: 43, label: "bewirtung", canonicalLabel: "Bewirtung/Geschenke" },
  { row: 44, label: "instandhaltung", canonicalLabel: "Instandhaltung und Wartung" },
  { row: 45, label: "leasing", canonicalLabel: "Leasing" },
  { row: 46, label: "sonstige kosten", canonicalLabel: "Sonstige Kosten" },
];

// ---------------------------------------------------------------------------
// Zeilen-Extraktion
// ---------------------------------------------------------------------------

type DataRow = { rowNo: number; label: string; monatCents: number | null; hadAmount: boolean };

function extractDataRow(line: string): DataRow | null {
  const trimmed = line.trim();
  const rn = trimmed.match(/^(\d{1,3})\s+(.+)$/);
  if (!rn) return null;
  const rowNo = Number.parseInt(rn[1], 10);
  if (rowNo < 1 || rowNo > 99) return null;
  const rest = rn[2];
  const tokens = rest.split(/\s+/);
  // Letzte bis zu 4 Tokens sind Zahlen-Zellen.
  const numTokens: string[] = [];
  while (tokens.length > 0 && numTokens.length < 4 && isAmountToken(tokens[tokens.length - 1])) {
    numTokens.unshift(tokens.pop()!);
  }
  const label = tokens.join(" ").trim();
  if (!label) return null;
  // Nur wenn wir 4 Zahlen (Monat, %, kum, %) sicher haben, lesen wir den
  // Monatswert. Weniger Tokens → Wert fehlt.
  let monatCents: number | null = null;
  let hadAmount = false;
  if (numTokens.length === 4) {
    monatCents = parseGermanAmountToCents(numTokens[0]);
    hadAmount = monatCents !== null;
  }
  return { rowNo, label, monatCents, hadAmount };
}

function normLabel(s: string): string {
  return s.toLowerCase().replace(/\s+/g, " ").trim();
}

// ---------------------------------------------------------------------------
// Block-Erkennung
// ---------------------------------------------------------------------------

const MONTHS: Record<string, number> = {
  januar: 1,
  februar: 2,
  märz: 3,
  april: 4,
  mai: 5,
  juni: 6,
  juli: 7,
  august: 8,
  september: 9,
  oktober: 10,
  november: 11,
  dezember: 12,
};

function findMonth(lines: string[]): string | null {
  for (const l of lines) {
    const m = l.match(
      /\b(Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})\b/i,
    );
    if (m) {
      const mm = MONTHS[m[1].toLowerCase()];
      if (!mm) continue;
      return `${m[2]}-${String(mm).padStart(2, "0")}-01`;
    }
  }
  return null;
}

function findEntity(lines: string[]): string | null {
  for (const l of lines) {
    const m = l.match(/([A-ZÄÖÜ][\w\s.&-]*\b(?:GmbH(?:\s*&\s*Co\.?\s*KG)?|AG|KG|UG|e\.K\.))/);
    if (m) return m[1].replace(/\s+/g, " ").trim();
  }
  return null;
}

function findCostCenter(lines: string[]): string | null {
  for (const l of lines) {
    const m = l.match(/Kostenstelle\s*[:-]?\s*(.+?)\s*$/i);
    if (m) {
      // Häufig folgt hinter dem Namen noch eine Nummer — nur den Namen davor
      // behalten. Wir nehmen defensiv den bereinigten Rest.
      return m[1].replace(/\s{2,}.*$/, "").trim();
    }
  }
  return null;
}

function isBwaPage(lines: string[]): boolean {
  return lines.some((l) => /Betriebswirtschaftliche Auswertung/i.test(l));
}

function isContinuationPage(lines: string[]): boolean {
  return lines.some((l) => /Übertrag/i.test(l));
}

// ---------------------------------------------------------------------------
// Haupt-Parser
// ---------------------------------------------------------------------------

type WipBlock = {
  entity: string;
  costCenter: string;
  month: string;
  found: Map<keyof BwaMonthInput, number>;
  sachkostenDetail: Record<string, number>;
  sawRows: Set<number>;
};

function keyFor(b: WipBlock): string {
  return `${b.entity}::${b.costCenter}::${b.month}`;
}

function processPageRows(lines: string[], wip: WipBlock, warnings: string[]): void {
  for (const line of lines) {
    const row = extractDataRow(line);
    if (!row) continue;
    wip.sawRows.add(row.rowNo);
    const normalized = normLabel(row.label);

    // Hauptfelder
    const field = FIELD_MAP.find((f) => f.row === row.rowNo);
    if (field) {
      if (!normalized.includes(field.label)) {
        warnings.push(
          `Zeile ${row.rowNo}: erwartetes Label „${field.label}" nicht in „${row.label}" gefunden — Feld ${field.key} nicht übernommen.`,
        );
      } else if (row.monatCents !== null) {
        wip.found.set(field.key, row.monatCents);
      }
    }

    // Sachkosten-Detail
    const detail = SACHKOSTEN_DETAIL_ROWS.find((d) => d.row === row.rowNo);
    if (detail) {
      if (!normalized.includes(detail.label)) {
        warnings.push(
          `Sachkosten-Zeile ${row.rowNo}: erwartetes Label „${detail.label}" nicht in „${row.label}" — nicht ins Detail übernommen.`,
        );
      } else if (row.monatCents !== null && row.monatCents !== 0) {
        // Leasing (45) nur wenn Wert; für alle: 0-Werte ausblenden, da Detail
        // eine Aufteilung von Sachkosten darstellt.
        wip.sachkostenDetail[detail.canonicalLabel] = row.monatCents;
      }
    }
  }
}

function finalizeBlock(wip: WipBlock): ParsedBwaBlock {
  const values: Partial<BwaMonthInput> = {};
  for (const [k, v] of wip.found) {
    (values as Record<string, number>)[k] = v;
  }
  const missingFields = FIELD_MAP.filter((f) => !wip.found.has(f.key)).map((f) => f.key);
  return {
    entity: wip.entity,
    costCenter: wip.costCenter,
    month: wip.month,
    values,
    sachkostenDetail: wip.sachkostenDetail,
    missingFields,
  };
}

export function parseBwaPdfText(pages: string[][]): ParseResult {
  const warnings: string[] = [];
  const wipMap = new Map<string, WipBlock>();
  // Kontext für Übertrag-Seiten: die letzte gesehene Kombination aus
  // entity+costCenter+month, damit eine „Übertrag"-Seite ohne eigene
  // Kopfdaten korrekt zugeordnet wird.
  let lastKey: string | null = null;

  for (let i = 0; i < pages.length; i++) {
    const lines = pages[i];
    if (!isBwaPage(lines) && !isContinuationPage(lines)) continue;

    const isCont = isContinuationPage(lines) && !isBwaPage(lines);

    let entity = findEntity(lines);
    let costCenter = findCostCenter(lines);
    let month = findMonth(lines);

    if (isCont && lastKey) {
      // Übertrag-Seite: Kopf aus dem letzten Block übernehmen falls dort
      // Felder fehlen.
      const [e, c, m] = lastKey.split("::");
      entity = entity ?? e;
      costCenter = costCenter ?? c;
      month = month ?? m;
    }

    if (!entity || !costCenter || !month) {
      warnings.push(
        `Seite ${i + 1}: BWA-Kopfzeile unvollständig (entity=${entity ?? "?"}, kst=${costCenter ?? "?"}, monat=${month ?? "?"}) — übersprungen.`,
      );
      continue;
    }

    const key = `${entity}::${costCenter}::${month}`;
    let wip = wipMap.get(key);
    if (!wip) {
      wip = {
        entity,
        costCenter,
        month,
        found: new Map(),
        sachkostenDetail: {},
        sawRows: new Set(),
      };
      wipMap.set(key, wip);
    }
    processPageRows(lines, wip, warnings);
    lastKey = keyFor(wip);
  }

  const blocks = Array.from(wipMap.values()).map(finalizeBlock);
  return { blocks, warnings };
}
