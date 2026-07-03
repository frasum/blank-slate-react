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

// Minimal-Formen, die die shared Gate-Funktionen brauchen — bewusst
// strukturell (kein Import aus bilanz.functions.ts, damit der Server-Layer
// diese Funktionen ohne Zyklus konsumieren kann).
export type PositionLike = {
  statement: string;
  code: string;
  level: number;
  label: string;
  betragCents: number;
  vorjahrCents?: number | null;
};

export type KontoLike = {
  statement: string;
  positionCode: string;
  betragCents: number;
  vorjahrCents?: number | null;
};

export type AnlageAnchors = {
  summeAktivaCents: number | null;
  summePassivaCents: number | null;
  bilanzgewinnCents: number | null;
};

// ---------------------------------------------------------------------------
// Konstanten / kleine Helper
// ---------------------------------------------------------------------------

const COL_TOLERANCE = 8; // pt Toleranz um die Spalten-x
// Strikte Erkennung deutscher Betraege: 1-3 Ziffern, optional weitere
// Dreiergruppen mit Tausenderpunkt, optional Nachkomma mit Komma.
// Verhindert bewusst, dass Hierarchie-Prefixe wie "1." als Zahl gelten
// (Regex-Bug frueher Iteration) und dass 4-stellige Kontonummern wie
// "0300" faelschlich als Betrag klassifiziert werden.
const AMOUNT_RE = /^-?\d{1,3}(?:\.\d{3})*(?:,\d{1,2})?$/;

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

export function classifyPage(page: Token[][]): SectionKind {
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
  // Nearest-anchor mit grosszuegiger Toleranz. Deckt rechtsbuendige Zahlen
  // (leicht links vom Header-Anker) und Ausrichtungs-Jitter zwischen den
  // beiden Beleg-Blaettern (2022/2023/2024) ab.
  const dGj = Math.abs(x - cols.gjX);
  const dVj = Math.abs(x - cols.vjX);
  const min = Math.min(dGj, dVj);
  if (min > COL_TOLERANCE * 8) return null;
  return dGj <= dVj ? "gj" : "vj";
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
  const flat = nonAmount
    .map((t) => t.text)
    .join(" ")
    .toLowerCase();
  if (flat.startsWith("übertrag") || flat.startsWith("uebertrag")) return "carry";
  if (nonAmount[0].text.toLowerCase() === "davon") return "davon";
  if (KONTO_RE.test(first)) return "konto";
  if (section === "guv" && GUV_RE.test(first)) return "position-guv";
  if (ROMAN_RE.test(first)) return "position-roman";
  if (LETTER_RE.test(first)) return "position-letter";
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
      warnings.push(
        `Seite (${statement}): Spaltenkopf 'Geschäftsjahr / Vorjahr' nicht gefunden — übersprungen.`,
      );
      continue;
    }

    const path: Path = { letter: null, roman: null, arabic: null, buchstabe: null };
    let currentPositionCode: string | null = null;

    for (const line of page) {
      const kind = classifyRow(line, statement);
      if (kind === "carry" || kind === "davon" || kind === "empty" || kind === "other") continue;
      if (kind === "subtotal") continue; // Positionen tragen bereits ihre Beträge.

      const { gj, vj } = extractAmounts(line, cols);
      const nonAmount = line.filter((t) => !isAmount(t.text));
      const firstText = nonAmount[0]?.text ?? "";

      const pushPosition = (level: number): void => {
        const code = makeCode(path);
        const label = labelFrom(line, 1);
        currentPositionCode = code;
        if (!label) {
          warnings.push(`Position ${code}: leeres Label — nur als Kontext übernommen.`);
          return;
        }
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
      };

      if (kind === "position-letter") {
        const m = LETTER_RE.exec(firstText)!;
        path.letter = m[1];
        path.roman = path.arabic = path.buchstabe = null;
        pushPosition(0);
      } else if (kind === "position-roman") {
        const m = ROMAN_RE.exec(firstText)!;
        path.roman = m[1];
        path.arabic = path.buchstabe = null;
        pushPosition(1);
      } else if (kind === "position-arabic") {
        const m = ARABIC_RE.exec(firstText)!;
        path.arabic = m[1];
        path.buchstabe = null;
        pushPosition(2);
      } else if (kind === "position-buchstabe") {
        const m = BUCHSTABE_RE.exec(firstText)!;
        path.buchstabe = m[1];
        pushPosition(3);
      } else if (kind === "position-guv") {
        const m = GUV_RE.exec(firstText)!;
        path.letter = `guv.${m[1]}`;
        path.roman = path.arabic = path.buchstabe = null;
        pushPosition(0);
      } else if (kind === "konto") {
        const kontoNr = nonAmount[0].text;
        const label = labelFrom(line, 1);
        if (!label) {
          warnings.push(`Konto ${kontoNr}: leeres Label — übersprungen.`);
          continue;
        }
        if (gj === null) {
          warnings.push(
            `Konto ${kontoNr} (${label}): kein GJ-Betrag in der Geschäftsjahr-Spalte — übersprungen.`,
          );
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
  // Blatt = keine andere Position hat den eigenen Code als Prefix.
  for (const c of allCodes) {
    if (c !== pos.code && c.startsWith(pos.code + ".")) return false;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Shared Gate-Funktionen (Parser UND Server nutzen dieselbe Quelle)
// ---------------------------------------------------------------------------

// Label-Anker fuer die staffelbewusste GuV-Konsistenzpruefung.
// Regex bewusst tolerant (Umlaut/Bindestrich/Klammerzusatz), aber wortgenau.
const LBL_ERGEBNIS_NACH_STEUERN = /ergebnis\s+nach\s+steuern/i;
const LBL_JAHRESUEBERSCHUSS = /jahres(ü|ue)bersch(uss|üsse)|jahres(ü|ue)berschuss.*fehlbetrag|jahresfehlbetrag/i;
const LBL_VORTRAG = /(gewinn|verlust)vortrag/i;
const LBL_BILANZGEWINN = /bilanzgewinn|bilanzverlust/i;

function isLeafBy(codes: Set<string>, code: string): boolean {
  for (const c of codes) if (c !== code && c.startsWith(code + ".")) return false;
  return true;
}

// Gate 1 (GJ oder VJ): Σ Konten je Blatt-Position = Positionsbetrag.
// Skipt VJ-Pruefung, wenn Position oder ein zugehoeriges Konto keinen VJ hat
// (mehrere PDF-Vintages ohne Vorjahresspalte kommen in der Praxis vor).
export function checkKontenSumForYear(
  positions: PositionLike[],
  konten: KontoLike[],
  which: "gj" | "vj",
): BilanzCheck[] {
  const codesByStmt = new Map<string, Set<string>>();
  for (const p of positions) {
    const set = codesByStmt.get(p.statement) ?? new Set<string>();
    set.add(p.code);
    codesByStmt.set(p.statement, set);
  }
  const namePrefix = which === "gj" ? "konten_sum" : "konten_sum_vj";
  const posVal = (p: PositionLike): number | null =>
    which === "gj" ? p.betragCents : (p.vorjahrCents ?? null);
  const kVal = (k: KontoLike): number | null =>
    which === "gj" ? k.betragCents : (k.vorjahrCents ?? null);

  const checks: BilanzCheck[] = [];
  for (const p of positions) {
    const codes = codesByStmt.get(p.statement) ?? new Set<string>();
    if (!isLeafBy(codes, p.code)) continue;
    const rel = konten.filter((k) => k.statement === p.statement && k.positionCode === p.code);
    if (rel.length === 0) continue;
    const pv = posVal(p);
    if (pv === null) continue;
    const vals = rel.map(kVal);
    if (vals.some((v) => v === null)) continue;
    const sum = vals.reduce<number>((a, v) => a + (v ?? 0), 0);
    if (sum === 0 && pv === 0) continue;
    checks.push({
      name: `${namePrefix}:${p.statement}:${p.code}`,
      expectedCents: pv,
      actualCents: sum,
      ok: sum === pv,
    });
  }
  return checks;
}

// Gate 3: staffelbewusste GuV-Konsistenz.
// Bei erkannten Ankern (Ergebnis nach Steuern / Jahresueberschuss /
// Bilanzgewinn) werden segmentweise Summen geprueft. Fehlen ALLE Anker
// → Fallback auf die alte "letzter Posten = Σ Rest"-Regel. Fehlt ein Teil
// der Anker → Warnung, aber wir liefern trotzdem die Segmentchecks fuer
// die vorhandenen Anker.
export function checkGuvStaffel(
  guvTopLevel: PositionLike[],
  warnings?: string[],
): BilanzCheck[] {
  if (guvTopLevel.length === 0) return [];

  const iEns = guvTopLevel.findIndex((p) => LBL_ERGEBNIS_NACH_STEUERN.test(p.label));
  const iJues = guvTopLevel.findIndex((p) => LBL_JAHRESUEBERSCHUSS.test(p.label));
  const iVortrag = guvTopLevel.findIndex((p) => LBL_VORTRAG.test(p.label));
  const iBilg = guvTopLevel.findIndex((p) => LBL_BILANZGEWINN.test(p.label));
  const anchors = { iEns, iJues, iVortrag, iBilg };
  const foundCore = [iEns, iJues, iBilg].filter((i) => i >= 0).length;

  // Kein einziger Kern-Anker → Fallback (rueckwaertskompatibel).
  if (foundCore === 0) {
    if (guvTopLevel.length < 2) return [];
    const last = guvTopLevel[guvTopLevel.length - 1];
    const sum = guvTopLevel.slice(0, -1).reduce((a, p) => a + p.betragCents, 0);
    return [
      {
        name: "guv_staffel_summe",
        expectedCents: last.betragCents,
        actualCents: sum,
        ok: sum === last.betragCents,
      },
    ];
  }

  if (foundCore < 3 && warnings) {
    warnings.push(
      `GuV-Staffel: nicht alle Anker erkannt ` +
        `(Ergebnis n. Steuern=${anchors.iEns >= 0}, ` +
        `Jahresüberschuss=${anchors.iJues >= 0}, ` +
        `Bilanzgewinn=${anchors.iBilg >= 0}) — nur Teil-Segmente geprueft.`,
    );
  }

  const checks: BilanzCheck[] = [];

  // Ergebnis nach Steuern = Σ operative Posten davor.
  if (iEns > 0) {
    const sum = guvTopLevel.slice(0, iEns).reduce((a, p) => a + p.betragCents, 0);
    checks.push({
      name: "guv_ergebnis_nach_steuern",
      expectedCents: guvTopLevel[iEns].betragCents,
      actualCents: sum,
      ok: sum === guvTopLevel[iEns].betragCents,
    });
  }

  // Jahresueberschuss = Σ (Ergebnis n. Steuern ... vor Jahresueberschuss)
  // typisch: Ergebnis-n.-Steuern + (negative) Sonstige Steuern.
  if (iEns >= 0 && iJues > iEns) {
    const sum = guvTopLevel.slice(iEns, iJues).reduce((a, p) => a + p.betragCents, 0);
    checks.push({
      name: "guv_jahresueberschuss",
      expectedCents: guvTopLevel[iJues].betragCents,
      actualCents: sum,
      ok: sum === guvTopLevel[iJues].betragCents,
    });
  }

  // Bilanzgewinn = Σ (Jahresueberschuss ... vor Bilanzgewinn)
  // typisch: Jahresueberschuss + Gewinn/Verlustvortrag.
  if (iJues >= 0 && iBilg > iJues) {
    const sum = guvTopLevel.slice(iJues, iBilg).reduce((a, p) => a + p.betragCents, 0);
    checks.push({
      name: "guv_bilanzgewinn",
      expectedCents: guvTopLevel[iBilg].betragCents,
      actualCents: sum,
      ok: sum === guvTopLevel[iBilg].betragCents,
    });
  }

  return checks;
}

// ---------------------------------------------------------------------------
// Anlage-Anker (Gate 4, rein parser-seitig — geht nicht durchs Replace-Payload)
// ---------------------------------------------------------------------------

const ANLAGE_SUMME_AKTIVA = /^summe\s+aktiva\b/;
const ANLAGE_SUMME_PASSIVA = /^summe\s+passiva\b/;
const ANLAGE_BILANZGEWINN = /^(bilanzgewinn|bilanzverlust)\b/;

export function findAnlageAnchors(pages: Token[][][]): AnlageAnchors {
  let summeAktivaCents: number | null = null;
  let summePassivaCents: number | null = null;
  let bilanzgewinnCents: number | null = null;

  for (const page of pages) {
    const kind = classifyPage(page);
    if (kind.kind !== "anlage-bilanz" && kind.kind !== "anlage-guv") continue;

    for (const line of page) {
      const labelText = line
        .filter((t) => !isAmount(t.text))
        .map((t) => t.text)
        .join(" ")
        .toLowerCase()
        .trim();
      if (!labelText) continue;
      const amounts = line.filter((t) => isAmount(t.text));
      if (amounts.length === 0) continue;
      // Erster (linkester) Betrag = Geschaeftsjahr-Spalte.
      const sorted = [...amounts].sort((a, b) => a.x - b.x);
      const gj = parseGermanAmountToCents(sorted[0].text);

      if (summeAktivaCents === null && ANLAGE_SUMME_AKTIVA.test(labelText)) {
        summeAktivaCents = gj;
      } else if (summePassivaCents === null && ANLAGE_SUMME_PASSIVA.test(labelText)) {
        summePassivaCents = gj;
      } else if (bilanzgewinnCents === null && ANLAGE_BILANZGEWINN.test(labelText)) {
        bilanzgewinnCents = gj;
      }
    }
  }
  return { summeAktivaCents, summePassivaCents, bilanzgewinnCents };
}

export function checkAnlageAnchors(
  anchors: AnlageAnchors,
  positions: PositionLike[],
): BilanzCheck[] {
  const checks: BilanzCheck[] = [];
  const topSum = (stmt: string) =>
    positions.filter((p) => p.statement === stmt && p.level === 0).reduce((a, p) => a + p.betragCents, 0);

  if (anchors.summeAktivaCents !== null) {
    const actual = topSum("aktiva");
    checks.push({
      name: "anlage_summe_aktiva",
      expectedCents: anchors.summeAktivaCents,
      actualCents: actual,
      ok: actual === anchors.summeAktivaCents,
    });
  }
  if (anchors.summePassivaCents !== null) {
    const actual = topSum("passiva");
    checks.push({
      name: "anlage_summe_passiva",
      expectedCents: anchors.summePassivaCents,
      actualCents: actual,
      ok: actual === anchors.summePassivaCents,
    });
  }
  if (anchors.bilanzgewinnCents !== null) {
    // Bilanzgewinn aus dem parsed GuV-Staffel-Endposten (Anker LBL_BILANZGEWINN).
    const guv = positions.filter((p) => p.statement === "guv" && p.level === 0);
    const bilg = guv.find((p) => LBL_BILANZGEWINN.test(p.label));
    const actual = bilg ? bilg.betragCents : guv[guv.length - 1]?.betragCents ?? 0;
    checks.push({
      name: "anlage_bilanzgewinn",
      expectedCents: anchors.bilanzgewinnCents,
      actualCents: actual,
      ok: actual === anchors.bilanzgewinnCents,
    });
  }
  return checks;
}

// ---------------------------------------------------------------------------
// Aggregierte Gate-Berechnung (Parser-Innerei; ruft die shared Fns)
// ---------------------------------------------------------------------------

export function computeChecks(
  positions: ParsedBilanzPosition[],
  konten: ParsedBilanzKonto[],
  warnings: string[],
  anlageAnchors?: AnlageAnchors,
): BilanzCheck[] {
  const checks: BilanzCheck[] = [];
  void isLeafPosition; // helper bleibt exportfrei erhalten fuer moegliche Debug-Nutzung

  // Gate 1 GJ und VJ (shared).
  checks.push(...checkKontenSumForYear(positions, konten, "gj"));
  checks.push(...checkKontenSumForYear(positions, konten, "vj"));

  const posByStmt = new Map<BilanzStatement, ParsedBilanzPosition[]>();
  for (const p of positions) {
    const arr = posByStmt.get(p.statement) ?? [];
    arr.push(p);
    posByStmt.set(p.statement, arr);
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

  // Gate 3: staffelbewusste GuV-Konsistenz (shared).
  const guvTop = (posByStmt.get("guv") ?? []).filter((p) => p.level === 0);
  checks.push(...checkGuvStaffel(guvTop, warnings));

  // Gate 4: Anlage-Anker vs. parsed Bilanz (parser-only).
  if (anlageAnchors) {
    checks.push(...checkAnlageAnchors(anlageAnchors, positions));
  }

  if (posByStmt.size === 0)
    warnings.push("Keine Positionen erkannt — Kontennachweis vermutlich nicht enthalten.");
  return checks;
}
