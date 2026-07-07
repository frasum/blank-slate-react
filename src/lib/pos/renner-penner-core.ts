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

/** RP2 — Standort-Anteil an einem gemergten Eintrag. */
export type LocationSlice = {
  locationId: string;
  locationName: string;
  einheiten: number;
  umsatzCents: number;
  wareneinsatzCents: number | null;
  dbCents: number | null;
};

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
  /** RP2 — Standort-Aufschlüsselung (immer ≥ 1 Element). */
  perLocation: LocationSlice[];
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
  location?: { id: string; name: string },
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

  const entries: RennerEntry[] = orderKeys.map((key) => buildEntry(key, groups.get(key)!, location));

  // 2) Ladenhüter — nach Nummer nicht in stats vertreten
  const seenNummern = new Set<number>();
  for (const r of rows) seenNummern.add(r.nummer);
  const ladenhueter = articlesForLeftovers.filter((a) => !seenNummern.has(a.nummer));

  return { entries, ladenhueter };
}

function buildEntry(
  key: string,
  rows: RennerRawRow[],
  location?: { id: string; name: string },
): RennerEntry {
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
      r.ekPortionMl !== null && r.ekSourceVolumeMl !== null && r.ekPortionMl < r.ekSourceVolumeMl;
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
    perLocation: location
      ? [
          {
            locationId: location.id,
            locationName: location.name,
            einheiten,
            umsatzCents: umsatz,
            wareneinsatzCents: we,
            dbCents,
          },
        ]
      : [],
  };
}

/**
 * RP2 — Fasst pro-Standort-Ergebnisse zu einer standort-übergreifenden
 * Rangliste zusammen. Merge-Schlüssel = normalisierter Anzeigename
 * (Gerichte/Getränke haben pro Standort andere Vectron-Nummern, aber
 * denselben Namen).
 */
export function mergeAcrossLocations(
  perLoc: ReadonlyArray<{ locationId: string; locationName: string; entries: readonly RennerEntry[] }>,
  normalize: (name: string) => string,
): RennerEntry[] {
  if (perLoc.length <= 1) {
    return perLoc[0]?.entries.slice() ?? [];
  }
  const byKey = new Map<string, RennerEntry>();
  const orderKeys: string[] = [];
  for (const loc of perLoc) {
    for (const e of loc.entries) {
      const mkey = e.ekSourceArticleId ? `ek:${normalize(e.name)}` : `n:${normalize(e.name)}`;
      const existing = byKey.get(mkey);
      if (!existing) {
        // erste Sichtung → kopieren; perLocation ggf. auf 1-Slice normalisieren.
        const slice: LocationSlice = e.perLocation[0] ?? {
          locationId: loc.locationId,
          locationName: loc.locationName,
          einheiten: e.einheitenGesamt,
          umsatzCents: e.umsatzCents,
          wareneinsatzCents: e.wareneinsatzCents,
          dbCents: e.dbCents,
        };
        byKey.set(mkey, {
          ...e,
          key: mkey,
          perLocation: [slice],
          components: e.components.slice(),
        });
        orderKeys.push(mkey);
        continue;
      }
      // Aggregieren.
      existing.einheitenGesamt += e.einheitenGesamt;
      existing.umsatzCents += e.umsatzCents;
      existing.offeneGlaeserCount += e.offeneGlaeserCount;
      existing.flaschenCount += e.flaschenCount;
      if (existing.wareneinsatzCents === null || e.wareneinsatzCents === null) {
        existing.wareneinsatzCents = null;
      } else {
        existing.wareneinsatzCents += e.wareneinsatzCents;
      }
      if (existing.volumenMl === null || e.volumenMl === null) {
        existing.volumenMl = null;
      } else {
        existing.volumenMl += e.volumenMl;
      }
      if (existing.hauptgruppe === null) existing.hauptgruppe = e.hauptgruppe;
      if (existing.warengruppe === null) existing.warengruppe = e.warengruppe;
      if (existing.ekSourceVolumeMl === null) existing.ekSourceVolumeMl = e.ekSourceVolumeMl;
      // Kürzester Name gewinnt weiter.
      if (e.name.length < existing.name.length) existing.name = e.name;
      // Komponenten anhängen (Duplikate zwischen Standorten ok — Nummer +
      // Name reichen zur visuellen Trennung; unterschiedliche Nummern pro
      // Standort sind der Regelfall).
      for (const c of e.components) existing.components.push(c);
      const slice: LocationSlice = e.perLocation[0] ?? {
        locationId: loc.locationId,
        locationName: loc.locationName,
        einheiten: e.einheitenGesamt,
        umsatzCents: e.umsatzCents,
        wareneinsatzCents: e.wareneinsatzCents,
        dbCents: e.dbCents,
      };
      existing.perLocation.push(slice);
      // Abgeleitete Kennzahlen neu berechnen.
      existing.flaschenAequivalent =
        existing.volumenMl !== null &&
        existing.ekSourceVolumeMl !== null &&
        existing.ekSourceVolumeMl > 0
          ? existing.volumenMl / existing.ekSourceVolumeMl
          : null;
      const avgEkNetto =
        existing.wareneinsatzCents !== null && existing.einheitenGesamt > 0
          ? Math.round(existing.wareneinsatzCents / existing.einheitenGesamt)
          : null;
      const avgVkBrutto =
        existing.einheitenGesamt > 0
          ? Math.round(existing.umsatzCents / existing.einheitenGesamt)
          : null;
      existing.ekwPct = wareneinsatzQuote(avgEkNetto, avgVkBrutto);
      existing.dbCents =
        existing.wareneinsatzCents === null ? null : existing.umsatzCents - existing.wareneinsatzCents;
    }
  }
  return orderKeys.map((k) => byKey.get(k)!);
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
