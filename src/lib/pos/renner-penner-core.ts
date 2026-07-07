// RP1 — Reine Aggregations-/Merge-Logik für die „Renner & Penner"-Sicht.
//
// Getestet, ohne DB/I/O. Regeln (aus der Bauanleitung):
//   – Zeilen MIT ek_source_article_id werden zu EINEM Eintrag gebündelt
//     (Merge-Schlüssel = EK-Quell-Artikel-ID). Name = kürzester
//     Verkaufsartikel-Name des Bündels; bei Gleichstand der zuerst
//     eingegangene.
//   – Komponenten-Aufschlüsselung bleibt am Eintrag als `components[]`
//     erhalten (nummer, name, portionMl, verkaufCount, umsatzCents).
//   – offeneGlaeserCount = Σ verkaufCount der Komponenten mit
//     portionMl < ekSourceVolumeMl. Alle übrigen → flaschenCount.
//   – Wareneinsatz-Cents pro Zeile = verkaufCount × ekPriceCents
//     (nur wenn ekPriceCents vorhanden, sonst null → EK/EKW nicht ableitbar).
//   – Volumen_ml pro Zeile = verkaufCount × ekPortionMl
//     (nur wenn ekPortionMl gesetzt). Flaschenäquivalent = Vol ÷ Gebinde.
//   – Zeilen OHNE Link bleiben als eigener Eintrag (components hat dann
//     genau ein Element).
//   – Ladenhüter = sales_articles (aktiv, Gruppen-Match), zu denen keine
//     Stats-Zeile im Zeitraum existiert.

import { wareneinsatzQuote } from "@/lib/bestellung/ek-linking";

/** Vom Server je Stats-Zeile geliefert (bereits mit VA-Stammdaten angereichert). */
export type RennerRawRow = {
  nummer: number;
  name: string;
  hauptgruppe: string | null;
  warengruppe: string | null;
  verkaufCount: number;
  umsatzCents: number;
  /** VA-Verweis auf den EK-Quellartikel (null → nicht gebündelt). */
  ekSourceArticleId: string | null;
  ekPortionMl: number | null;
  ekSourceVolumeMl: number | null;
  /** EK-Preis in Cents (netto, materialisiert am VA). */
  ekPriceCents: number | null;
  /** VK-Preis (brutto) am VA; für EKW-Fallback bei nicht-gebündelten Zeilen. */
  priceCents: number | null;
};

/** Aktiver VA für die Ladenhüter-Erkennung (kein Stats-Match im Zeitraum). */
export type RennerArticleForLeftovers = {
  nummer: number;
  name: string;
  hauptgruppe: string | null;
  warengruppe: string | null;
};

export type RennerComponent = {
  nummer: number;
  name: string;
  portionMl: number | null;
  verkaufCount: number;
  umsatzCents: number;
};

export type RennerEntry = {
  /** Merge-Key (ek_source_article_id) oder „va:<nummer>" bei ungebündelten Zeilen. */
  key: string;
  name: string;
  hauptgruppe: string | null;
  warengruppe: string | null;
  ekSourceArticleId: string | null;
  ekSourceVolumeMl: number | null;
  /** Σ verkaufCount aller Komponenten. */
  einheitenGesamt: number;
  umsatzCents: number;
  /** Σ (verkaufCount × ekPriceCents) — null, wenn irgendeine Komponente keinen EK hat. */
  wareneinsatzCents: number | null;
  /** Σ (verkaufCount × ekPortionMl) in ml — null, wenn irgendeine Komponente keine Portion hat. */
  volumenMl: number | null;
  /** Vol ÷ Gebinde. Nur wenn volumenMl und ekSourceVolumeMl > 0. */
  flaschenAequivalent: number | null;
  /** Σ verkaufCount aller Komponenten mit portionMl < ekSourceVolumeMl. */
  offeneGlaeserCount: number;
  /** Σ verkaufCount aller übrigen Komponenten (portionMl == null oder ≥ ekSourceVolumeMl). */
  flaschenCount: number;
  /** Wareneinsatzquote in % — via zentraler `wareneinsatzQuote`. */
  ekwPct: number | null;
  /** Deckungsbeitrag = Umsatz − Wareneinsatz. null wenn WE unbekannt. */
  dbCents: number | null;
  components: RennerComponent[];
};

export type RennerAggregateResult = {
  entries: RennerEntry[];
  ladenhueter: RennerArticleForLeftovers[];
};

/**
 * Fasst rohe Stats-Zeilen zu Einträgen zusammen. Ladenhüter = VAs aus
 * `articlesForLeftovers`, deren Nummer in KEINER Rohzeile vorkommt.
 */
export function aggregateRennerPenner(
  rows: readonly RennerRawRow[],
  articlesForLeftovers: readonly RennerArticleForLeftovers[],
): RennerAggregateResult {
  // 1) Gruppieren
  const groups = new Map<string, RennerRawRow[]>();
  const orderKeys: string[] = [];
  for (const r of rows) {
    const key = r.ekSourceArticleId ?? `va:${r.nummer}`;
    const arr = groups.get(key);
    if (arr) arr.push(r);
    else {
      groups.set(key, [r]);
      orderKeys.push(key);
    }
  }

  const entries: RennerEntry[] = orderKeys.map((key) => buildEntry(key, groups.get(key)!));

  // 2) Ladenhüter — nach Nummer nicht in stats vertreten
  const seenNummern = new Set<number>();
  for (const r of rows) seenNummern.add(r.nummer);
  const ladenhueter = articlesForLeftovers.filter((a) => !seenNummern.has(a.nummer));

  return { entries, ladenhueter };
}

function buildEntry(key: string, rows: RennerRawRow[]): RennerEntry {
  // Kürzester Name wird zum Bündelnamen (bei Gleichstand: erster).
  let displayName = rows[0].name;
  for (const r of rows) {
    if (r.name.length < displayName.length) displayName = r.name;
  }

  let einheiten = 0;
  let umsatz = 0;
  let we: number | null = 0;
  let vol: number | null = 0;
  let offen = 0;
  let flaschen = 0;
  const gebinde = rows[0].ekSourceVolumeMl;

  const components: RennerComponent[] = [];

  for (const r of rows) {
    einheiten += r.verkaufCount;
    umsatz += r.umsatzCents;

    if (we !== null) {
      if (r.ekPriceCents === null) we = null;
      else we += r.verkaufCount * r.ekPriceCents;
    }
    if (vol !== null) {
      if (r.ekPortionMl === null) vol = null;
      else vol += r.verkaufCount * r.ekPortionMl;
    }

    const isOpenGlass =
      r.ekPortionMl !== null &&
      r.ekSourceVolumeMl !== null &&
      r.ekPortionMl < r.ekSourceVolumeMl;
    if (isOpenGlass) offen += r.verkaufCount;
    else flaschen += r.verkaufCount;

    components.push({
      nummer: r.nummer,
      name: r.name,
      portionMl: r.ekPortionMl,
      verkaufCount: r.verkaufCount,
      umsatzCents: r.umsatzCents,
    });
  }

  const flaschenAequivalent =
    vol !== null && gebinde !== null && gebinde > 0 ? vol / gebinde : null;

  // EKW über Zentrale — Fallback für nicht-gebündelte Zeilen: VA-VK-Preis nutzen.
  // Bei gebündelten Zeilen ist priceCents nicht direkt vergleichbar (unterschiedliche
  // VKs je Portion) — hier arbeiten wir mit dem Ø-VK: Umsatz ÷ Einheiten.
  const avgVkBrutto = einheiten > 0 ? Math.round(umsatz / einheiten) : null;
  const ekwPct = wareneinsatzQuote(
    we !== null && einheiten > 0 ? Math.round(we / einheiten) : null,
    avgVkBrutto,
  );

  const dbCents = we === null ? null : umsatz - we;

  return {
    key,
    name: displayName,
    hauptgruppe: rows[0].hauptgruppe,
    warengruppe: rows[0].warengruppe,
    ekSourceArticleId: rows[0].ekSourceArticleId,
    ekSourceVolumeMl: gebinde,
    einheitenGesamt: einheiten,
    umsatzCents: umsatz,
    wareneinsatzCents: we,
    volumenMl: vol,
    flaschenAequivalent,
    offeneGlaeserCount: offen,
    flaschenCount: flaschen,
    ekwPct,
    dbCents,
    components,
  };
}

/** Case-insensitiver Gruppen-Match: prüft hauptgruppe ODER warengruppe. */
export function matchesGroupFilter(
  row: { hauptgruppe: string | null; warengruppe: string | null },
  selected: readonly string[],
): boolean {
  if (selected.length === 0) return true;
  const lo = selected.map((s) => s.toLocaleLowerCase("de"));
  const h = row.hauptgruppe?.toLocaleLowerCase("de") ?? null;
  const w = row.warengruppe?.toLocaleLowerCase("de") ?? null;
  return lo.some((sel) => sel === h || sel === w);
}