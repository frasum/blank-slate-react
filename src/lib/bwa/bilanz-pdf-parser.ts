// Reines Modul: parst ETL-ADHOGA-Jahresabschluss-Seiten (Kontennachweis
// Aktiva/Passiva/GuV) in Positionen + Konten. Kein pdfjs, kein DOM — die
// UI (F4b) reicht bereits nach y gruppierte Zeilen als Token-Arrays mit
// x-Koordinate rein, damit die Spaltenzuordnung deterministisch über
// x-Schwellen läuft (Vorgabe F4a: nicht ueber Token-Anzahl je Zeile).
//
// Anti-Halluzinations-Regel: Positionen werden nur uebernommen, wenn der
// Hierarchie-Prefix erkannt UND ein nicht-leeres Label gefunden wurde;
// Konten nur, wenn eine 3- bis 4-stellige Kontonummer plus Label plus
// Betrag im Geschaeftsjahr-Band vorliegt. Fehlt etwas, gibt es eine
// Warnung — es wird NIE die naechstbeste Zahl uebernommen.

import { parseGermanAmountToCents } from "./bwa-pdf-parser";

export type Token = { text: string; x: number };

export type BilanzStatement = "aktiva" | "passiva" | "guv";

export type ParsedBilanzPosition = {
  statement: BilanzStatement;
  code: string;
  parentCode: string | null;
  label: string;
  level: number;
  sortOrder: number;
  betragCents: number;
  vorjahrCents: number | null;
};

export type ParsedBilanzKonto = {
  statement: BilanzStatement;
  positionCode: string;
  kontoNr: string;
  label: string;
  betragCents: number;
  vorjahrCents: number | null;
  sortOrder: number;
};

export type BilanzCheck = {
  name: string;
  expectedCents: number;
  actualCents: number;
  ok: boolean;
};

export type ParsedBilanzYear = {
  entity: string;
  fiscalYear: number;
  positions: ParsedBilanzPosition[];
  konten: ParsedBilanzKonto[];
  checks: BilanzCheck[];
  warnings: string[];
};

// ---------------------------------------------------------------------------
// Konstanten / kleine Helper
// ---------------------------------------------------------------------------

const COL_TOLERANCE = 8; // pt Toleranz um die Spalten-x
const AMOUNT_RE = /^-?[\d.]+(?:,\d{1,2})?$/;

function isAmount(t: string): boolean {
  return AMOUNT_RE.test(t);
}

function joinText(tokens: Token[]): string {
  return tokens.map((t) => t.text).join(" ");
}

function pageText(page: Token[][]): string {
  return page.map(joinText).join(" \n ");
}

// ---------------------------------------------------------------------------
// Header (entity + fiscal_year) + Section-Erkennung
// ---------------------------------------------------------------------------

const HEADER_RE = /(.+?)\s+-\s+Jahresabschluss\s+zum\s+31\.12\.(\d{4})/i;

function findEntityAndYear(pages: Token[][][]): { entity: string; year: number } | null {
  for (const p of pages) {
    const txt = pageText(p);
    const m = HEADER_RE.exec(txt);
    if (m) {
      return { entity: m[1].trim().replace(/\s+/g, " "), year: Number.parseInt(m[2], 10) };
    }
  }
  return null;
}

type SectionKind =
  | { kind: "kontennachweis"; statement: BilanzStatement }
  | { kind: "anlage-bilanz" | "anlage-guv" }
  | { kind: "other" };

function classifyPage(page: Token[][]): SectionKind {
  const txt = pageText(page);
  const knwBilanz = /Kontennachweis\s+zur\s+Handelsbilanz/i.test(txt);
  const knwGuv = /Kontennachweis\s+zur\s+Gewinn-?\s*und\s*Verlustrechnung/i.test(txt);
  if (knwGuv) return { kind: "kontennachweis", statement: "guv" };
  if (knwBilanz) {
    // Aktiva/Passiva steht als eigener Spalten-/Blocktitel auf der Seite.
    const hasAktiva = /(^|\W)Aktiva(\W|$)/.test(txt);
    const hasPassiva = /(^|\W)Passiva(\W|$)/.test(txt);
    if (hasPassiva && !hasAktiva) return { kind: "kontennachweis", statement: "passiva" };
    if (hasAktiva && !hasPassiva) return { kind: "kontennachweis", statement: "aktiva" };
    // Sicherheitsnetz: nichts eindeutig → als Kontrollblatt behandeln.
    return { kind: "anlage-bilanz" };
  }
  if (/Handelsbilanz\s+zum\s+31\.12/i.test(txt)) return { kind: "anlage-bilanz" };
  if (/Gewinn-?\s*und\s*Verlustrechnung\s+vom/i.test(txt)) return { kind: "anlage-guv" };
  return { kind: "other" };
}

// ---------------------------------------------------------------------------
// Spalten-x aus dem "Geschäftsjahr / Vorjahr" Kopf ableiten
// ---------------------------------------------------------------------------

type ColumnAnchors = { gjX: number; vjX: number };

function findColumnAnchors(page: Token[][]): ColumnAnchors | null {
  for (const line of page) {
    let gjX: number | null = null;
    let vjX: number | null = null;
    for (const t of line) {
      if (gjX === null && /^Gesch(ä|ae)ftsjahr$/i.test(t.text)) gjX = t.x;
      else if (vjX === null && /^Vorjahr$/i.test(t.text)) vjX = t.x;
    }
    if (gjX !== null && vjX !== null && vjX > gjX) return { gjX, vjX };
  }
  return null;
}

function classifyAmountCol(x: number, cols: ColumnAnchors): "gj" | "vj" | null {
  if (Math.abs(x - cols.vjX) <= COL_TOLERANCE + 40) {
    // Vorjahr-Band: rechts vom Vorjahr-Anker (rechtsbuendige Zahlen liegen
    // knapp links vom Header-x; grosszuegige Toleranz nach beiden Seiten).
    if (x >= cols.vjX - COL_TOLERANCE * 4) return "vj";
  }
  if (x >= cols.gjX - COL_TOLERANCE * 4 && x < cols.vjX - COL_TOLERANCE) return "gj";
  return null;
}

// ---------------------------------------------------------------------------
// Zeilen-Klassifizierung
// ---------------------------------------------------------------------------

const KONTO_RE = /^\d{3,4}$/;
const LETTER_RE = /^([A-Z])\.?$/; // A / A.
const ROMAN_RE = /^(I{1,3}|IV|V|VI{0,3}|IX|X)\.?$/;
const ARABIC_RE = /^(\d{1,2})\.?$/; // 1. / 1
const BUCHSTABE_RE = /^([a-z]{1,2})\)$/;
const GUV_RE = /^(\d{1,2})\.$/; // 1. bis 12.

export type RowKind =
  | "position-letter"
  | "position-roman"
  | "position-arabic"
  | "position-buchstabe"
  | "position-guv"
  | "konto"
  | "subtotal"
  | "carry"
  | "davon"
  | "empty"
  | "other";

export function classifyRow(tokens: Token[], section: BilanzStatement | null): RowKind {
  const nonAmount = tokens.filter((t) => !isAmount(t.text));
  if (nonAmount.length === 0 && tokens.length > 0) return "subtotal";
  if (nonAmount.length === 0) return "empty";
  const first = nonAmount[0].text;
  const flat = nonAmount.map((t) => t.text).join(" ").toLowerCase();
  if (flat.startsWith("übertrag") || flat.startsWith("uebertrag")) return "carry";
  if (nonAmount[0].text.toLowerCase() === "davon") return "davon";
  if (KONTO_RE.test(first)) return "konto";
  if (section === "guv" && GUV_RE.test(first)) return "position-guv";
  if (LETTER_RE.test(first)) return "position-letter";
  if (ROMAN_RE.test(first)) return "position-roman";
  if (ARABIC_RE.test(first)) return "position-arabic";
  if (BUCHSTABE_RE.test(first)) return "position-buchstabe";
  return "other";
}

// ---------------------------------------------------------------------------
// Betrags-Extraktion (GJ + VJ) via Spalten-x
// ---------------------------------------------------------------------------

function extractAmounts(
  tokens: Token[],
  cols: ColumnAnchors,
): { gj: number | null; vj: number | null } {
  let gj: number | null = null;
  let vj: number | null = null;
  for (const t of tokens) {
    if (!isAmount(t.text)) continue;
    const col = classifyAmountCol(t.x, cols);
    if (col === "gj" && gj === null) gj = parseGermanAmountToCents(t.text);
    else if (col === "vj" && vj === null) vj = parseGermanAmountToCents(t.text);
  }
  return { gj, vj };
}

function labelFrom(tokens: Token[], dropFirst: number): string {
  return tokens
    .slice(dropFirst)
    .filter((t) => !isAmount(t.text))
    .map((t) => t.text)
    .join(" ")
    .replace(/\s+/g, " ")
    .trim();
}

// ---------------------------------------------------------------------------
// Hierarchie-Pfad
// ---------------------------------------------------------------------------

type Path = {
  letter: string | null;
  roman: string | null;
  arabic: string | null;
  buchstabe: string | null;
};

function makeCode(path: Path): string {
  return [path.letter, path.roman, path.arabic, path.buchstabe]
    .filter((s): s is string => !!s)
    .join(".");
}

function parentOf(path: Path): string | null {
  const parts = [path.letter, path.roman, path.arabic, path.buchstabe].filter(
    (s): s is string => !!s,
  );
  if (parts.length <= 1) return null;
  return parts.slice(0, -1).join(".");
}

// ---------------------------------------------------------------------------
// Haupt-Parser
// ---------------------------------------------------------------------------

export function parseBilanzPdf(pages: Token[][][]): ParsedBilanzYear {
  const warnings: string[] = [];
  const positions: ParsedBilanzPosition[] = [];
  const konten: ParsedBilanzKonto[] = [];

  const header = findEntityAndYear(pages);
  if (!header) {
    return {
      entity: "",
      fiscalYear: 0,
      positions: [],
      konten: [],
      checks: [],
      warnings: ["Konnte weder Entity noch Geschäftsjahr aus dem Kopf ablesen."],
    };
  }

  let sortSeq = 0;
  let kontoSeq = 0;

  for (const page of pages) {
    const section = classifyPage(page);
    if (section.kind !== "kontennachweis") continue;
    const statement = section.statement;
    const cols = findColumnAnchors(page);
    if (!cols) {
      warnings.push(`Seite (${statement}): Spaltenkopf 'Geschäftsjahr / Vorjahr' nicht gefunden — übersprungen.`);
      continue;
    }

    const path: Path = { letter: null, roman: null, arabic: null, buchstabe: null };
    let currentPositionCode: string | null = null;

    for (const line of page) {
      const kind = classifyRow(line, statement);
      if (kind === "carry" || kind === "davon" || kind === "empty" || kind === "other") continue;
      if (kind === "subtotal") continue; // Positionen tragen bereits ihre Beträge.

      const { gj, vj } = extractAmounts(line, cols);

      if (kind === "position-letter") {
        const m = LETTER_RE.exec(line.filter((t) => !isAmount(t.text))[0].text)!;
        path.letter = m[1];
        path.roman = path.arabic = path.buchstabe = null;
        pushPosition("letter", 0);
      } else if (kind === "position-roman") {
        const m = ROMAN_RE.exec(line.filter((t) => !isAmount(t.text))[0].text)!;
        path.roman = m[1];
        path.arabic = path.buchstabe = null;
        pushPosition("roman", 1);
      } else if (kind === "position-arabic") {
        const m = ARABIC_RE.exec(line.filter((t) => !isAmount(t.text))[0].text)!;
        path.arabic = m[1];
        path.buchstabe = null;
        pushPosition("arabic", 2);
      } else if (kind === "position-buchstabe") {
        const m = BUCHSTABE_RE.exec(line.filter((t) => !isAmount(t.text))[0].text)!;
        path.buchstabe = m[1];
        pushPosition("buchstabe", 3);
      } else if (kind === "position-guv") {
        const m = GUV_RE.exec(line.filter((t) => !isAmount(t.text))[0].text)!;
        path.letter = `guv.${m[1]}`;
        path.roman = path.arabic = path.buchstabe = null;
        pushPosition("guv", 0);
      } else if (kind === "konto") {
        const nonAmount = line.filter((t) => !isAmount(t.text));
        const kontoNr = nonAmount[0].text;
        const label = labelFrom(line, 1);
        if (!label) {
          warnings.push(`Konto ${kontoNr}: leeres Label — übersprungen.`);
          continue;
        }
        if (gj === null) {
          warnings.push(`Konto ${kontoNr} (${label}): kein GJ-Betrag in der Geschäftsjahr-Spalte — übersprungen.`);
          continue;
        }
        if (!currentPositionCode) {
          warnings.push(`Konto ${kontoNr}: keine übergeordnete Position bekannt — übersprungen.`);
          continue;
        }
        konten.push({
          statement,
          positionCode: currentPositionCode,
          kontoNr,
          label,
          betragCents: gj,
          vorjahrCents: vj,
          sortOrder: kontoSeq++,
        });
      }

      function pushPosition(_which: string, level: number): void {
        const code = makeCode(path);
        const label = labelFrom(line, 1);
        if (!label) {
          warnings.push(`Position ${code}: leeres Label — als Kontext übernommen, kein Positions-Eintrag.`);
          currentPositionCode = code;
          return;
        }
        currentPositionCode = code;
        positions.push({
          statement,
          code,
          parentCode: parentOf(path),
          label,
          level,
          sortOrder: sortSeq++,
          betragCents: gj ?? 0,
          vorjahrCents: vj,
        });
      }
    }
  }

  const checks = computeChecks(positions, konten, warnings);

  return {
    entity: header.entity,
    fiscalYear: header.year,
    positions,
    konten,
    checks,
    warnings,
  };
}

// ---------------------------------------------------------------------------
// Konsistenz-Gates (Server-Fn refused Speichern bei Gate-Verletzung)
// ---------------------------------------------------------------------------

function isLeafPosition(pos: ParsedBilanzPosition, allCodes: Set<string>): boolean {
  // Blatt = keine andere Position hat mich als parent_code.
  return !allCodes.has(`${pos.code}.child`) && ![...allCodes].some((c) => c.startsWith(pos.code + ".") && c !== pos.code);
}

export function computeChecks(
  positions: ParsedBilanzPosition[],
  konten: ParsedBilanzKonto[],
  warnings: string[],
): BilanzCheck[] {
  const checks: BilanzCheck[] = [];
  const posByStmt = new Map<BilanzStatement, ParsedBilanzPosition[]>();
  for (const p of positions) {
    const arr = posByStmt.get(p.statement) ?? [];
    arr.push(p);
    posByStmt.set(p.statement, arr);
  }

  // Gate 1: Σ Konten je Blatt-Position = Positionsbetrag (GJ).
  for (const [stmt, list] of posByStmt) {
    const codes = new Set(list.map((p) => p.code));
    for (const p of list) {
      if (!isLeafPosition(p, codes)) continue;
      const kSum = konten
        .filter((k) => k.statement === stmt && k.positionCode === p.code)
        .reduce((a, k) => a + k.betragCents, 0);
      if (kSum === 0 && p.betragCents === 0) continue; // leere Position
      if (konten.some((k) => k.statement === stmt && k.positionCode === p.code)) {
        checks.push({
          name: `konten_sum:${stmt}:${p.code}`,
          expectedCents: p.betragCents,
          actualCents: kSum,
          ok: kSum === p.betragCents,
        });
      }
    }
  }

  // Gate 2: Σ Top-Level Aktiva = Σ Top-Level Passiva.
  const sumTopLevel = (stmt: BilanzStatement) =>
    (posByStmt.get(stmt) ?? []).filter((p) => p.level === 0).reduce((a, p) => a + p.betragCents, 0);
  const aktivaSum = sumTopLevel("aktiva");
  const passivaSum = sumTopLevel("passiva");
  if (aktivaSum || passivaSum) {
    checks.push({
      name: "bilanzsumme_aktiva_eq_passiva",
      expectedCents: aktivaSum,
      actualCents: passivaSum,
      ok: aktivaSum === passivaSum,
    });
  }

  // Gate 3: GuV-Staffel-Arithmetik — Summe aller Top-Level GuV-Posten stimmt
  // mit dem letzten Posten (Bilanzgewinn/-verlust) oder mit der Passiva-
  // Bilanzgewinn-Position ueberein, wenn beide erkannt wurden.
  const guv = (posByStmt.get("guv") ?? []).filter((p) => p.level === 0);
  if (guv.length >= 2) {
    const last = guv[guv.length - 1];
    const sumWithoutLast = guv.slice(0, -1).reduce((a, p) => a + p.betragCents, 0);
    checks.push({
      name: "guv_staffel_summe",
      expectedCents: last.betragCents,
      actualCents: sumWithoutLast,
      ok: sumWithoutLast === last.betragCents,
    });
  }

  if (posByStmt.size === 0) warnings.push("Keine Positionen erkannt — Kontennachweis vermutlich nicht enthalten.");
  return checks;
}
