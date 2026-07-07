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