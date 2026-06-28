// Reine Logik für den Sammel-PDF-Splitter: Parsing pro Seite + Gruppierung
// nach Personal-Nr. Keine PDF-Libs, kein I/O. Erzeugte Dateinamen enden auf
// `-NNNNNN-YYYY-MM.pdf`, sodass der bestehende Matcher (`parsePayslipName`)
// sie ohne Änderung verarbeitet.

export type RunMonth = { year: number; month: number; isKorrektur: boolean };

export type PageMeta = {
  page: number;
  perso: string | null;
  runYear: number | null;
  runMonth: number | null;
};

export type SplitGroup = {
  perso: string;
  year: number;
  month: number;
  pages: number[];
  fileName: string;
};

export type GroupResult = {
  groups: SplitGroup[];
  unparsablePages: number[];
};

const MONATE: Record<string, number> = {
  januar: 1,
  februar: 2,
  märz: 3,
  maerz: 3,
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

/**
 * Liest die 6-stellige Personal-Nr aus dem Text einer Seite. Akzeptiert
 * beliebige Whitespaces (auch Zeilenumbrüche) zwischen „Personal-Nr." und
 * dem 6-stelligen Token. Gibt `null` zurück, wenn nichts Passendes da ist —
 * lieber Fehlanzeige als falsch zugeordnete Lohnabrechnung.
 */
export function parsePersoFromPageText(text: string): string | null {
  if (typeof text !== "string" || !text) return null;
  const m = /Personal[-\s]?Nr\.?[\s\S]{0,200}?(\d{6})/i.exec(text);
  return m ? m[1] : null;
}

/**
 * Lauf-Monat einer Seite. Korrektur-Seiten enthalten „<Monat> YYYY Korrektur
 * in MM.YYYY" — dann zählt das Korrektur-Datum (MM.YYYY). Sonst „<Monat>
 * YYYY". Gibt `null` zurück, wenn nichts passt.
 */
export function parseRunMonth(text: string): RunMonth | null {
  if (typeof text !== "string" || !text) return null;
  const korr = /Korrektur\s+in\s+(0[1-9]|1[0-2])\.(\d{4})/i.exec(text);
  if (korr) {
    return { year: parseInt(korr[2], 10), month: parseInt(korr[1], 10), isKorrektur: true };
  }
  const re = /(Januar|Februar|März|Maerz|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember)\s+(\d{4})/i;
  const m = re.exec(text);
  if (!m) return null;
  const month = MONATE[m[1].toLowerCase()];
  if (!month) return null;
  return { year: parseInt(m[2], 10), month, isKorrektur: false };
}

function pad2(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function majorityRunMonth(items: Array<{ y: number; m: number }>): { y: number; m: number } | null {
  if (items.length === 0) return null;
  const counts = new Map<string, { y: number; m: number; n: number }>();
  for (const it of items) {
    const key = `${it.y}-${it.m}`;
    const prev = counts.get(key);
    if (prev) prev.n += 1;
    else counts.set(key, { y: it.y, m: it.m, n: 1 });
  }
  let best: { y: number; m: number; n: number } | null = null;
  for (const v of counts.values()) {
    if (!best || v.n > best.n) best = v;
  }
  return best ? { y: best.y, m: best.m } : null;
}

/**
 * Gruppiert Seiten anhand der Personal-Nr. Seiten ohne perso landen in
 * `unparsablePages` und werden NICHT an Nachbarn angehängt. Lauf-Monat je
 * Gruppe = Mehrheit der erkannten (year,month) innerhalb der Gruppe; bei
 * Widersprüchen wird die Mehrheit gewählt (Korrektur-Seiten zählen mit
 * ihrem Korrektur-Monat, sodass die Mai-Mehrheit in einem Mai-Lauf gewinnt).
 */
export function groupPagesByPerso(metas: PageMeta[]): GroupResult {
  const unparsablePages: number[] = [];
  const order: string[] = [];
  const byPerso = new Map<string, { pages: number[]; rms: Array<{ y: number; m: number }> }>();

  for (const meta of metas) {
    if (!meta.perso) {
      unparsablePages.push(meta.page);
      continue;
    }
    let entry = byPerso.get(meta.perso);
    if (!entry) {
      entry = { pages: [], rms: [] };
      byPerso.set(meta.perso, entry);
      order.push(meta.perso);
    }
    entry.pages.push(meta.page);
    if (meta.runYear !== null && meta.runMonth !== null) {
      entry.rms.push({ y: meta.runYear, m: meta.runMonth });
    }
  }

  const groups: SplitGroup[] = [];
  for (const perso of order) {
    const entry = byPerso.get(perso)!;
    const rm = majorityRunMonth(entry.rms);
    if (!rm) continue; // kein Lauf-Monat ermittelbar → Gruppe verwerfen
    groups.push({
      perso,
      year: rm.y,
      month: rm.m,
      pages: entry.pages,
      fileName: `Lohn-${perso}-${rm.y}-${pad2(rm.m)}.pdf`,
    });
  }

  return { groups, unparsablePages };
}
