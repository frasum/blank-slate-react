// RT1 — Feiertags-Set aus dem bavarianHolidayMap für einen Zeitraum
// (inklusiv, gregorianisch). Rein, keine IO.

import { bavarianHolidayMap } from "@/lib/time/shift-hours";

export function bavarianHolidaysBetween(startIso: string, endIso: string): Set<string> {
  const out = new Set<string>();
  const startYear = Number(startIso.slice(0, 4));
  const endYear = Number(endIso.slice(0, 4));
  for (let y = startYear; y <= endYear; y++) {
    const m = bavarianHolidayMap(y);
    for (const key of m.keys()) {
      const iso = `${y}-${key}`; // key = MM-DD
      if (iso >= startIso && iso <= endIso) out.add(iso);
    }
  }
  return out;
}

// Gesetzliche bayerische Feiertage — identisch zu `bavarianHolidayMap`,
// aber OHNE Heiligabend (24.12.). Heiligabend ist zwar in der Zuschlags-
// Liste enthalten (praktische Ladenschluss-Regel), aber KEIN gesetzlicher
// Feiertag. Für den Urlaubsabzug (`countLeaveDays`) muss der Tag deshalb
// als normaler Werktag zählen, sonst wird Weihnachtsurlaub systematisch
// einen Tag zu kurz gerechnet.
export function bavarianLegalHolidaysBetween(
  startIso: string,
  endIso: string,
): Set<string> {
  const all = bavarianHolidaysBetween(startIso, endIso);
  const out = new Set<string>();
  for (const iso of all) {
    if (iso.slice(5) === "12-24") continue;
    out.add(iso);
  }
  return out;
}
