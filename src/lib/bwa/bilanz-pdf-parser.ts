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

export type Token = { text: string; x: number; xEnd: number };

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

// F4b: rechtsbuendige Spalten in der Druckrealitaet — Toleranz auf xEnd.
const EDGE_TOL = 8;
// F4b-Fix-3: Dezimalkomma-Pflicht. ETL-ADHOGA druckt Betraege ausnahmslos
// mit genau zwei Nachkommastellen. Nackte Ganzzahlen ("4", "12", "2024")
// sind damit nie Betraege — das rettet Konten mit Paragraphen-Zahlen im
// Label (§ 4 Nr. 12 UStG, § 4 Abs. 5b EStG), deren Label-Zahlen sonst als
// GJ-Betrag gefressen wurden. 4-stellige Kontonummern und Konten-Ranges
// ("0830-0838") sind strukturell nie mehr Betrags-Kandidaten. Einzige
// Ausnahme bleibt die Jahres-Kopfzeilen-Erkennung (findColumnAnchors), die
// ihr eigenes Muster nutzt.
const AMOUNT_RE = /^-?\d{1,3}(?:\.\d{3})*,\d{2}$/;

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
const FOOTER_RE = /erl(ä|ae)uterung\s+zu\s+den\s+wesentlichen\s+posten/i;

// F4b-Fix-2: Zeilen, die auf jeder Seite auftauchen und niemals als
// Position/Konto klassifiziert werden duerfen (zusaetzlich zu isHeaderSkip,
// der die Spaltenkopfzeilen abfaengt). Wird auch auf der ersten Seite eines
// Abschnitts angewandt — die Muster sind dort ohnehin irrelevant.
function isContinuationSkip(line: Token[]): boolean {
  if (line.length === 0) return true;
  const flat = line
    .map((t) => t.text)
    .join(" ")
    .trim();
  if (!flat) return true;
  if (HEADER_RE.test(flat)) return true;
  if (FOOTER_RE.test(flat)) return true;
  const nonAmount = line.filter((t) => !isAmount(t.text));
  if (nonAmount.length === 1 && /^(aktiva|passiva)$/i.test(nonAmount[0].text)) return true;
  // Anker-Zeile des Kontennachweises selbst: nie als Zeile mit Inhalt.
  if (/kontennachweis\s+zur\s+(handelsbilanz|gewinn)/i.test(flat)) return true;
  return false;
}

function pageHasStandaloneToken(page: Token[][], re: RegExp): boolean {
  for (const line of page) {
    const nonAmount = line.filter((t) => !isAmount(t.text));
    if (nonAmount.length === 1 && re.test(nonAmount[0].text)) return true;
  }
  return false;
}

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

// F4b: rechte Kanten der aeusseren Spalten (Positions-/Summenzeilen: gjRight,
// Vorjahr: vjRight). Konto-GJ liegt im inneren Band (deutlich links von
// gjRight). Anker werden je Seite aus der Jahres-Kopfzeile abgeleitet;
// Fallback: rechte Kanten der beiden "EUR"-Token.
type ColumnAnchors = { gjRight: number; vjRight: number };

export function findColumnAnchors(page: Token[][], fiscalYear: number): ColumnAnchors | null {
  const wantGj = String(fiscalYear);
  const wantVj = String(fiscalYear - 1);
  for (const line of page) {
    if (line.length < 2) continue;
    const gj = line.find((t) => t.text === wantGj);
    const vj = line.find((t) => t.text === wantVj);
    if (gj && vj && vj.x > gj.x) return { gjRight: gj.xEnd, vjRight: vj.xEnd };
  }
  for (const line of page) {
    const eurs = line.filter((t) => /^EUR$/i.test(t.text)).sort((a, b) => a.x - b.x);
    if (eurs.length >= 2) return { gjRight: eurs[0].xEnd, vjRight: eurs[1].xEnd };
  }
  return null;
}

function bandOf(xEnd: number, cols: ColumnAnchors): "gj" | "vj" | null {
  if (Math.abs(xEnd - cols.vjRight) <= EDGE_TOL) return "vj";
  if (Math.abs(xEnd - cols.gjRight) <= EDGE_TOL) return "gj";
  return null;
}

function outerAmounts(
  amounts: Token[],
  cols: ColumnAnchors,
): { gj: number | null; vj: number | null } {
  let gj: number | null = null;
  let vj: number | null = null;
  for (const t of amounts) {
    const b = bandOf(t.xEnd, cols);
    if (b === "gj" && gj === null) gj = parseGermanAmountToCents(t.text);
    else if (b === "vj" && vj === null) vj = parseGermanAmountToCents(t.text);
  }
  return { gj, vj };
}

function innerRightmostGj(amounts: Token[], cols: ColumnAnchors): number | null {
  const inner = amounts.filter(
    (t) => bandOf(t.xEnd, cols) === null && t.xEnd < cols.gjRight - EDGE_TOL,
  );
  if (inner.length === 0) return null;
  const rightmost = inner.reduce((a, b) => (b.xEnd > a.xEnd ? b : a));
  return parseGermanAmountToCents(rightmost.text);
}

function isHeaderSkip(line: Token[], fiscalYear: number): boolean {
  if (line.length === 0) return true;
  const texts = line.map((t) => t.text);
  const hasGj = texts.some((t) => /^Gesch(ä|ae)ftsjahr$/i.test(t));
  const hasVj = texts.some((t) => /^Vorjahr$/i.test(t));
  if (hasGj && hasVj) return true;
  const eurs = texts.filter((t) => /^EUR$/i.test(t));
  if (eurs.length >= 2 && eurs.length === texts.length) return true;
  const wantGj = String(fiscalYear);
  const wantVj = String(fiscalYear - 1);
  if (
    texts.length === 2 &&
    ((texts[0] === wantGj && texts[1] === wantVj) || (texts[0] === wantVj && texts[1] === wantGj))
  ) {
    return true;
  }
  return false;
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

  type OpenKonto = {
    statement: BilanzStatement;
    positionCode: string;
    kontoNr: string;
    labelParts: string[];
    sortOrder: number;
  };
  // F4b-Fix-3: Positions-Stack fuer gestapelte Teilsummen. Eine
  // Position schliesst NICHT bei der ersten Betragszeile, sondern erst,
  // wenn eine neue Positionszeile mit gleichem oder hoeherem Level
  // (kleinere Level-Zahl) auftritt bzw. der Abschnitt endet. Reine
  // Betragszeilen im aeusseren Band akkumulieren auf die innerste offene
  // Position (GJ addiert immer; VJ addiert nur wenn alle bisherigen
  // Teilzeilen einen VJ trugen — sonst wird VJ als unvollstaendig auf
  // null gesetzt).
  type OpenPos = {
    pos: ParsedBilanzPosition;
    vjIncomplete: boolean;
    touched: boolean;
  };
  type SectionState = {
    statement: BilanzStatement;
    path: Path;
    currentPositionCode: string | null;
    openKonto: OpenKonto | null;
    awaitingPositions: OpenPos[];
  };

  const newState = (statement: BilanzStatement): SectionState => ({
    statement,
    path: { letter: null, roman: null, arabic: null, buchstabe: null },
    currentPositionCode: null,
    openKonto: null,
    awaitingPositions: [],
  });

  let state: SectionState | null = null;

  // Alle offenen Positionen mit level >= newLevel schliessen (Sibling oder
  // tiefer). Die Position bleibt in positions[] mit dem bis dahin
  // akkumulierten Betrag; der Roll-up traegt Nicht-Blaetter nach.
  const closeAtLevel = (s: SectionState, newLevel: number): void => {
    while (
      s.awaitingPositions.length > 0 &&
      s.awaitingPositions[s.awaitingPositions.length - 1].pos.level >= newLevel
    ) {
      s.awaitingPositions.pop();
    }
  };

  const finalizeKonto = (s: SectionState, gj: number, vj: number | null): void => {
    if (!s.openKonto) return;
    const label = s.openKonto.labelParts.join(" ").replace(/\s+/g, " ").trim();
    if (!label) {
      warnings.push(`Konto ${s.openKonto.kontoNr}: leeres Label — übersprungen.`);
    } else {
      konten.push({
        statement: s.openKonto.statement,
        positionCode: s.openKonto.positionCode,
        kontoNr: s.openKonto.kontoNr,
        label,
        betragCents: gj,
        vorjahrCents: vj,
        sortOrder: s.openKonto.sortOrder,
      });
    }
    s.openKonto = null;
  };
  const closeUnresolvedKonto = (s: SectionState): void => {
    if (s.openKonto) {
      warnings.push(`Konto ${s.openKonto.kontoNr}: kein GJ-Betrag gefunden — übersprungen.`);
      s.openKonto = null;
    }
  };
  const finalizeSection = (): void => {
    if (!state) return;
    closeUnresolvedKonto(state);
    state.awaitingPositions.length = 0;
    state = null;
  };

  const parsePage = (page: Token[][], cols: ColumnAnchors, s: SectionState): void => {
    const statement = s.statement;
    for (const line of page) {
      if (isHeaderSkip(line, header.year)) continue;
      if (isContinuationSkip(line)) continue;
      const kind = classifyRow(line, statement);
      if (kind === "carry" || kind === "davon" || kind === "empty") continue;

      const nonAmount = line.filter((t) => !isAmount(t.text));
      const amounts = line.filter((t) => isAmount(t.text));

      if (kind === "subtotal") {
        const { gj: ogj, vj: ovj } = outerAmounts(amounts, cols);
        if (ogj !== null) {
          const top = s.awaitingPositions[s.awaitingPositions.length - 1];
          if (top) {
            if (!top.touched) {
              top.pos.betragCents = ogj;
              top.touched = true;
            } else {
              top.pos.betragCents += ogj;
            }
            if (ovj === null) {
              top.vjIncomplete = true;
              top.pos.vorjahrCents = null;
            } else if (!top.vjIncomplete) {
              top.pos.vorjahrCents =
                top.pos.vorjahrCents === null ? ovj : top.pos.vorjahrCents + ovj;
            }
          }
          continue;
        }
        if (s.openKonto) {
          const kgj = innerRightmostGj(amounts, cols);
          const kvj = ovj;
          if (kgj !== null) finalizeKonto(s, kgj, kvj);
        }
        continue;
      }

      if (kind === "other") {
        if (s.openKonto) {
          // F4b-Fix-4: gemischte Label-/Betragszeile (2281-Muster:
          // "5b EStG -0,20 0,00"). Label-Rest immer anhaengen; wenn im
          // inneren Band ein GJ-Wert liegt, Konto schliessen (VJ optional
          // aus dem aeusseren VJ-Band). Ohne inneren GJ bleibt das Konto
          // offen — schuetzt gegen Fehlgriff auf Positions-Summen.
          s.openKonto.labelParts.push(...nonAmount.map((t) => t.text));
          if (amounts.length > 0) {
            const kgj = innerRightmostGj(amounts, cols);
            if (kgj !== null) {
              const { vj: kvj } = outerAmounts(amounts, cols);
              finalizeKonto(s, kgj, kvj);
            }
          }
        }
        continue;
      }

      const { gj, vj } = outerAmounts(amounts, cols);
      const firstText = nonAmount[0]?.text ?? "";

      const pushPosition = (level: number): void => {
        // Siblings/tiefere Positionen schliessen, BEVOR die neue eroeffnet.
        closeAtLevel(s, level);
        const code = makeCode(s.path);
        const label = labelFrom(line, 1);
        s.currentPositionCode = code;
        if (!label) {
          warnings.push(`Position ${code}: leeres Label — nur als Kontext übernommen.`);
          return;
        }
        const p: ParsedBilanzPosition = {
          statement,
          code,
          parentCode: parentOf(s.path),
          label,
          level,
          sortOrder: sortSeq++,
          betragCents: gj ?? 0,
          vorjahrCents: vj,
        };
        positions.push(p);
        if (gj === null) {
          s.awaitingPositions.push({ pos: p, vjIncomplete: false, touched: false });
        }
      };

      if (kind === "position-letter") {
        closeUnresolvedKonto(s);
        const m = LETTER_RE.exec(firstText)!;
        s.path.letter = m[1];
        s.path.roman = s.path.arabic = s.path.buchstabe = null;
        pushPosition(0);
      } else if (kind === "position-roman") {
        closeUnresolvedKonto(s);
        const m = ROMAN_RE.exec(firstText)!;
        s.path.roman = m[1];
        s.path.arabic = s.path.buchstabe = null;
        pushPosition(1);
      } else if (kind === "position-arabic") {
        closeUnresolvedKonto(s);
        const m = ARABIC_RE.exec(firstText)!;
        s.path.arabic = m[1];
        s.path.buchstabe = null;
        pushPosition(2);
      } else if (kind === "position-buchstabe") {
        closeUnresolvedKonto(s);
        const m = BUCHSTABE_RE.exec(firstText)!;
        s.path.buchstabe = m[1];
        pushPosition(3);
      } else if (kind === "position-guv") {
        closeUnresolvedKonto(s);
        const m = GUV_RE.exec(firstText)!;
        s.path.letter = `guv.${m[1]}`;
        s.path.roman = s.path.arabic = s.path.buchstabe = null;
        pushPosition(0);
      } else if (kind === "konto") {
        closeUnresolvedKonto(s);
        const kontoNr = nonAmount[0].text;
        if (!s.currentPositionCode) {
          warnings.push(`Konto ${kontoNr}: keine übergeordnete Position bekannt — übersprungen.`);
          continue;
        }
        const labelTokens = nonAmount.slice(1).map((t) => t.text);
        s.openKonto = {
          statement,
          positionCode: s.currentPositionCode,
          kontoNr,
          labelParts: labelTokens,
          sortOrder: kontoSeq++,
        };
        const kgj = innerRightmostGj(amounts, cols);
        if (kgj !== null) finalizeKonto(s, kgj, vj);
      }
    }
  };

  // F4b-Fix-2: Seitenschleife mit persistentem Abschnitts-Zustand.
  // Kontennachweis-Anker startet/wechselt Abschnitt; Fortsetzungsseite
  // (kein Anker, aber Spaltenkopf vorhanden) fuehrt denselben Abschnitt
  // weiter; Anlage-/andere Anker oder Seite ohne Spaltenkopf beenden ihn.
  for (const page of pages) {
    const section = classifyPage(page);
    const cols = findColumnAnchors(page, header.year);

    if (section.kind === "kontennachweis") {
      if (state && state.statement !== section.statement) finalizeSection();
      if (!state) state = newState(section.statement);
      if (!cols) {
        warnings.push(
          `Seite (${section.statement}): Spalten-Anker (Jahreszahlen/EUR) nicht gefunden — übersprungen.`,
        );
        continue;
      }
      parsePage(page, cols, state);
      continue;
    }

    // Fortsetzungsseite: aktiver Abschnitt + Spaltenkopf, kein Anker.
    if (section.kind === "other" && state && cols) {
      // Widersprechendes Statement-Label auf der Folgeseite → Label gewinnt.
      const hasAktiva = pageHasStandaloneToken(page, /^aktiva$/i);
      const hasPassiva = pageHasStandaloneToken(page, /^passiva$/i);
      if (state.statement === "aktiva" && hasPassiva && !hasAktiva) {
        warnings.push("Fortsetzungsseite: erwartet Aktiva, gefunden Passiva — Abschnitt wechselt.");
        finalizeSection();
        state = newState("passiva");
      } else if (state.statement === "passiva" && hasAktiva && !hasPassiva) {
        warnings.push("Fortsetzungsseite: erwartet Passiva, gefunden Aktiva — Abschnitt wechselt.");
        finalizeSection();
        state = newState("aktiva");
      }
      parsePage(page, cols, state);
      continue;
    }

    // Anlage-Anker, andere Anker oder Seite ohne Spaltenkopf → Abschnitt beenden.
    finalizeSection();
  }
  finalizeSection();

  rollupPositions(positions);

  const anlageAnchors = findAnlageAnchors(pages);
  const checks = computeChecks(positions, konten, warnings, anlageAnchors);

  return {
    entity: header.entity,
    fiscalYear: header.year,
    positions,
    konten,
    checks,
    warnings,
  };
}

// F4b: Roll-up fuer Nicht-Blatt-Positionen ohne gedruckte Summe.
// Blatt = keine andere Position hat den eigenen Code als Prefix.
// VJ nur, wenn ALLE direkten Kinder einen VJ-Wert haben.
function rollupPositions(positions: ParsedBilanzPosition[]): void {
  const codes = new Set(positions.map((p) => p.code + "::" + p.statement));
  const isLeaf = (p: ParsedBilanzPosition): boolean => {
    for (const key of codes) {
      const [c, s] = key.split("::");
      if (s !== p.statement) continue;
      if (c !== p.code && c.startsWith(p.code + ".")) return false;
    }
    return true;
  };
  const sorted = [...positions].sort((a, b) => b.level - a.level);
  for (const p of sorted) {
    if (isLeaf(p)) continue;
    if (p.betragCents !== 0) continue;
    const kids = positions.filter((c) => c.statement === p.statement && c.parentCode === p.code);
    if (kids.length === 0) continue;
    p.betragCents = kids.reduce((a, c) => a + c.betragCents, 0);
    if (p.vorjahrCents === null && kids.every((c) => c.vorjahrCents !== null)) {
      p.vorjahrCents = kids.reduce((a, c) => a + (c.vorjahrCents ?? 0), 0);
    }
  }
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
const LBL_JAHRESUEBERSCHUSS =
  /jahres(ü|ue)bersch(uss|üsse)|jahres(ü|ue)berschuss.*fehlbetrag|jahresfehlbetrag/i;
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
export function checkGuvStaffel(guvTopLevel: PositionLike[], warnings?: string[]): BilanzCheck[] {
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
    positions
      .filter((p) => p.statement === stmt && p.level === 0)
      .reduce((a, p) => a + p.betragCents, 0);

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
    const actual = bilg ? bilg.betragCents : (guv[guv.length - 1]?.betragCents ?? 0);
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
