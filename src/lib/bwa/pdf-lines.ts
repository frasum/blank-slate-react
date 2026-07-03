// Pures Modul: gruppiert PDF-Text-Items zu Zeilen. Aus dem UI-Modul
// `bwa.tsx` herausgezogen und headless testbar. Grund für die Auslagerung:
// die vorherige Assemblierung via `Math.round(transform[5])` zerriss auf
// eurodata-BWA-Seiten die Zeilennummer („47") vom Rest der Zeile („Summe
// Sachkosten …"), weil eurodata die Nummer mit ~0,5 pt Baseline-Versatz
// setzt und die Rundungsgrenze dazwischen fällt. Fix: Toleranz-Clustering.

export type TextItem = { x: number; y: number; s: string };

/**
 * Toleranz für die y-Cluster-Bildung in PDF-Punkt. 2,5 pt deckt den
 * beobachteten Baseline-Versatz der Zeilennummer sicher ab (≈ 0,5 pt) und
 * liegt weit unter dem normalen Zeilenabstand einer BWA-Seite.
 */
export const LINE_Y_TOLERANCE = 2.5;

/**
 * Gruppiert PDF-Text-Items zu Zeilen. PDF.js-y (transform[5]) wächst nach
 * OBEN → wir sortieren absteigend, damit die oberste Seitenzeile zuerst
 * kommt. Statt exaktem Match wird geclustert: neues Zeilen-Cluster erst,
 * wenn der y-Abstand zum aktuellen Zeilen-Anker größer als
 * `LINE_Y_TOLERANCE` ist. Innerhalb einer Zeile nach x sortiert und mit
 * Leerzeichen zusammengefügt.
 */
export function clusterItemsToLines(items: TextItem[]): string[] {
  const sorted = [...items].sort((a, b) => b.y - a.y || a.x - b.x);
  const clusters: TextItem[][] = [];
  let anchor: number | null = null;
  for (const it of sorted) {
    if (anchor === null || anchor - it.y > LINE_Y_TOLERANCE) {
      clusters.push([it]);
      anchor = it.y;
    } else {
      clusters[clusters.length - 1].push(it);
    }
  }
  return clusters
    .map((c) =>
      c
        .sort((a, b) => a.x - b.x)
        .map((i) => i.s)
        .join(" ")
        .replace(/\s+/g, " ")
        .trim(),
    )
    .filter((l) => l.length > 0);
}