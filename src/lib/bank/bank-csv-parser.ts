// Parser für Deutsche-Bank-CSV-Kontoauszüge (BK1).
//
// Charakteristika der Bank-Datei:
// - Encoding: Windows-1252 (die aufrufende UI decodiert die Datei; hier kommt
//   nur der bereits dekodierte Text an).
// - Trennzeichen `;`, Werte in `"..."`, Werte können `""` als Escape enthalten.
// - Beträge deutsch (`1.234,56` / `-687,50`). String-basiert nach BIGINT cents
//   umrechnen — kein `parseFloat`-Rundungspfad.
// - Datum `d.M.yyyy` (z. B. `2.1.2026`).
// - Sammelbuchungen erscheinen mehrfach — Deduplizierung über `Laufende Nummer`.
// - Spaltenreihenfolge nicht hart annehmen: Header werden nach Namen aufgelöst.

export type BankTxRaw = {
  iban: string;
  laufendeNummer: number;
  buchungstag: string; // ISO YYYY-MM-DD
  wertstellungstag: string | null;
  betragCents: number;
  saldoCents: number | null;
  gegenpartei: string;
  verwendungszweck: string;
  bankKategorie: string;
  bankUnterkategorie: string;
};

export type ParseResult = {
  rows: BankTxRaw[];
  rohZeilen: number;
  eindeutig: number;
  zeitraum: { from: string; to: string } | null;
  summeEinCents: number;
  summeAusCents: number;
  saldoStartCents: number | null;
  saldoEndeCents: number | null;
  saldoDeltaCents: number | null;
  saldoAbgleichOk: boolean;
};

/**
 * Windows-1252-Bytes -> String. Nur für die UI-Seite: das Modul selbst
 * arbeitet auf bereits dekodiertem Text; diese Hilfsfunktion ist der
 * einzige Ort, an dem `TextDecoder` benutzt wird und ist damit auch in
 * Tests aus cp1252-Fixtures rekonstruierbar.
 */
export function decodeCp1252(bytes: ArrayBuffer | Uint8Array): string {
  return new TextDecoder("windows-1252").decode(bytes);
}

/** Parst einen deutschen Geldbetrag (`1.234,56` / `-687,50`) nach Cent. */
export function parseGermanAmountToCents(input: string): number | null {
  if (input == null) return null;
  let s = input.trim();
  if (s === "") return null;
  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1).trim();
  } else if (s.startsWith("+")) {
    s = s.slice(1).trim();
  }
  // Nur Ziffern, `.` und `,` sind gültig.
  if (!/^[\d.,]+$/.test(s)) return null;
  // Alle Punkte sind Tausendertrenner (bei DE-Bank-Export gibt es immer ein Komma).
  // Ohne Komma: Punkt ist Dezimaltrenner nur, wenn genau ein `.` mit 1-2 Nachkommastellen.
  let intPart: string;
  let decPart: string;
  if (s.includes(",")) {
    if ((s.match(/,/g) ?? []).length > 1) return null;
    const [i, d] = s.split(",");
    intPart = i.replace(/\./g, "");
    decPart = d;
  } else if ((s.match(/\./g) ?? []).length === 1) {
    const [i, d] = s.split(".");
    if (d.length < 1 || d.length > 2) return null;
    intPart = i;
    decPart = d;
  } else if (!s.includes(".")) {
    intPart = s;
    decPart = "";
  } else {
    return null;
  }
  if (!/^\d+$/.test(intPart)) return null;
  if (decPart !== "" && !/^\d{1,2}$/.test(decPart)) return null;
  const cents =
    Number.parseInt(intPart, 10) * 100 + Number.parseInt((decPart + "00").slice(0, 2), 10);
  if (!Number.isFinite(cents)) return null;
  return negative ? -cents : cents;
}

/** Parst `d.M.yyyy` -> ISO `yyyy-MM-dd`. */
export function parseGermanDateToIso(input: string): string | null {
  if (!input) return null;
  const m = input.trim().match(/^(\d{1,2})\.(\d{1,2})\.(\d{4})$/);
  if (!m) return null;
  const [, d, mo, y] = m;
  const dd = d.padStart(2, "0");
  const mm = mo.padStart(2, "0");
  // Sanity check
  const dn = Number(dd);
  const mn = Number(mm);
  if (mn < 1 || mn > 12 || dn < 1 || dn > 31) return null;
  return `${y}-${mm}-${dd}`;
}

/** Minimaler `;`-CSV-Parser mit `"`-Quoting und `""`-Escape. */
export function parseCsv(text: string, delim = ";"): string[][] {
  const rows: string[][] = [];
  let cur: string[] = [];
  let field = "";
  let inQuotes = false;
  let i = 0;
  const n = text.length;
  // BOM entfernen (falls vorhanden).
  if (n > 0 && text.charCodeAt(0) === 0xfeff) i = 1;
  while (i < n) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"') {
        if (i + 1 < n && text[i + 1] === '"') {
          field += '"';
          i += 2;
          continue;
        }
        inQuotes = false;
        i++;
        continue;
      }
      field += c;
      i++;
      continue;
    }
    if (c === '"') {
      inQuotes = true;
      i++;
      continue;
    }
    if (c === delim) {
      cur.push(field);
      field = "";
      i++;
      continue;
    }
    if (c === "\r") {
      // \r\n oder einzeln — beides als Zeilenende behandeln.
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
      i++;
      if (i < n && text[i] === "\n") i++;
      continue;
    }
    if (c === "\n") {
      cur.push(field);
      rows.push(cur);
      cur = [];
      field = "";
      i++;
      continue;
    }
    field += c;
    i++;
  }
  // Letztes Feld (auch bei fehlendem trailing newline).
  if (field !== "" || cur.length > 0) {
    cur.push(field);
    rows.push(cur);
  }
  // Vollständig leere Zeilen entfernen.
  return rows.filter((r) => !(r.length === 1 && r[0] === ""));
}

// Spalten-Aliase — Deutsche Bank ändert Bezeichnungen gelegentlich; wir
// erkennen sowohl kurze als auch längere Varianten. Vergleich ist
// case-insensitiv und ignoriert Whitespace.
const COLUMN_ALIASES: Record<string, string[]> = {
  iban: ["IBAN"],
  betrag: ["Betrag"],
  buchungstag: ["Buchungstag"],
  wertstellungstag: ["Wertstellungstag"],
  gegenpartei: [
    "Begünstigter/Absender - Name",
    "Begünstigter/Absender",
    "Begünstigter / Absender - Name",
    "Begünstigter / Absender",
    "Name",
  ],
  verwendungszweck: [
    "Verwendungszweckzeile 1",
    "Verwendungszweck 1",
    "Verwendungszweckzeile1",
    "Verwendungszweck",
  ],
  kategorie: ["Kategorie"],
  unterkategorie: ["Unterkategorie"],
  laufendeNummer: ["Laufende Nummer", "Lfd. Nummer", "Lfd. Nr.", "Laufende Nr."],
  saldo: ["Saldo", "Saldo nach Buchung"],
};

function normalizeHeader(h: string): string {
  return h.replace(/\s+/g, " ").trim().toLowerCase();
}

function findColumnIndex(header: string[], aliases: string[]): number {
  const norm = header.map(normalizeHeader);
  for (const a of aliases) {
    const idx = norm.indexOf(normalizeHeader(a));
    if (idx >= 0) return idx;
  }
  return -1;
}

export type ColumnMap = {
  iban: number;
  betrag: number;
  buchungstag: number;
  wertstellungstag: number;
  gegenpartei: number;
  verwendungszweck: number;
  kategorie: number;
  unterkategorie: number;
  laufendeNummer: number;
  saldo: number;
};

export function resolveColumns(header: string[]): ColumnMap {
  const map: ColumnMap = {
    iban: findColumnIndex(header, COLUMN_ALIASES.iban),
    betrag: findColumnIndex(header, COLUMN_ALIASES.betrag),
    buchungstag: findColumnIndex(header, COLUMN_ALIASES.buchungstag),
    wertstellungstag: findColumnIndex(header, COLUMN_ALIASES.wertstellungstag),
    gegenpartei: findColumnIndex(header, COLUMN_ALIASES.gegenpartei),
    verwendungszweck: findColumnIndex(header, COLUMN_ALIASES.verwendungszweck),
    kategorie: findColumnIndex(header, COLUMN_ALIASES.kategorie),
    unterkategorie: findColumnIndex(header, COLUMN_ALIASES.unterkategorie),
    laufendeNummer: findColumnIndex(header, COLUMN_ALIASES.laufendeNummer),
    saldo: findColumnIndex(header, COLUMN_ALIASES.saldo),
  };
  const required: (keyof ColumnMap)[] = ["iban", "betrag", "buchungstag", "laufendeNummer"];
  // Fehlermeldung nennt die Spalten so, wie sie in der Datei heißen müssten
  // (erster Alias), nicht die internen Feld-Keys.
  const missing = required.filter((k) => map[k] < 0).map((k) => COLUMN_ALIASES[k][0]);
  if (missing.length > 0) {
    throw new Error(
      `CSV-Header unvollständig: fehlende Spalte(n) ${missing.join(", ")}. ` +
        `Ist das ein Kontoauszug-Export der Deutschen Bank?`,
    );
  }
  return map;
}

/** Volle Parser-Pipeline: Text -> geprüfte, deduplizierte Zeilen + Kennzahlen. */
export function parseBankCsv(text: string): ParseResult {
  const grid = parseCsv(text);
  if (grid.length === 0) {
    return {
      rows: [],
      rohZeilen: 0,
      eindeutig: 0,
      zeitraum: null,
      summeEinCents: 0,
      summeAusCents: 0,
      saldoStartCents: null,
      saldoEndeCents: null,
      saldoDeltaCents: null,
      saldoAbgleichOk: true,
    };
  }
  const header = grid[0];
  const cols = resolveColumns(header);
  const seen = new Set<string>();
  const rows: BankTxRaw[] = [];
  let rohZeilen = 0;
  for (let r = 1; r < grid.length; r++) {
    const row = grid[r];
    // Rohzeilen = Datenzeilen mit Laufender Nummer (Info-/Zwischenzeilen ignorieren).
    const lfdRaw = (row[cols.laufendeNummer] ?? "").trim();
    if (lfdRaw === "") continue;
    rohZeilen++;
    const iban = (row[cols.iban] ?? "").trim();
    const betrag = parseGermanAmountToCents(row[cols.betrag] ?? "");
    const buchungstag = parseGermanDateToIso(row[cols.buchungstag] ?? "");
    if (betrag == null || buchungstag == null || iban === "") continue;
    const lfd = Number.parseInt(lfdRaw.replace(/[^\d-]/g, ""), 10);
    if (!Number.isFinite(lfd)) continue;
    const key = `${iban}|${lfd}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const wertstellungstag =
      cols.wertstellungstag >= 0 ? parseGermanDateToIso(row[cols.wertstellungstag] ?? "") : null;
    const saldoCents = cols.saldo >= 0 ? parseGermanAmountToCents(row[cols.saldo] ?? "") : null;
    rows.push({
      iban,
      laufendeNummer: lfd,
      buchungstag,
      wertstellungstag,
      betragCents: betrag,
      saldoCents,
      gegenpartei: cols.gegenpartei >= 0 ? (row[cols.gegenpartei] ?? "").trim() : "",
      verwendungszweck: cols.verwendungszweck >= 0 ? (row[cols.verwendungszweck] ?? "").trim() : "",
      bankKategorie: cols.kategorie >= 0 ? (row[cols.kategorie] ?? "").trim() : "",
      bankUnterkategorie: cols.unterkategorie >= 0 ? (row[cols.unterkategorie] ?? "").trim() : "",
    });
  }
  // Chronologisch (aufsteigend) sortieren — Saldo-Abgleich braucht Start/Ende.
  rows.sort((a, b) => {
    if (a.buchungstag !== b.buchungstag) return a.buchungstag.localeCompare(b.buchungstag);
    return a.laufendeNummer - b.laufendeNummer;
  });
  let summeEin = 0;
  let summeAus = 0;
  for (const r of rows) {
    if (r.betragCents >= 0) summeEin += r.betragCents;
    else summeAus += r.betragCents;
  }
  const zeitraum = rows.length
    ? { from: rows[0].buchungstag, to: rows[rows.length - 1].buchungstag }
    : null;
  // Saldo-Anker: erster/letzter Eintrag mit gesetztem Saldo.
  const withSaldo = rows.filter((r) => r.saldoCents != null);
  const saldoEndeCents = withSaldo.length
    ? (withSaldo[withSaldo.length - 1].saldoCents as number)
    : null;
  // Start-Saldo = Endsaldo VOR der ersten Buchung des Exports = saldoNachErsterBuchung - betragErsterBuchung.
  const saldoStartCents =
    withSaldo.length && withSaldo[0].saldoCents != null
      ? (withSaldo[0].saldoCents as number) - withSaldo[0].betragCents
      : null;
  const saldoDeltaCents =
    saldoEndeCents != null && saldoStartCents != null ? saldoEndeCents - saldoStartCents : null;
  const netto = summeEin + summeAus;
  const saldoAbgleichOk = saldoDeltaCents == null ? true : saldoDeltaCents === netto;
  return {
    rows,
    rohZeilen,
    eindeutig: rows.length,
    zeitraum,
    summeEinCents: summeEin,
    summeAusCents: summeAus,
    saldoStartCents,
    saldoEndeCents,
    saldoDeltaCents,
    saldoAbgleichOk,
  };
}
