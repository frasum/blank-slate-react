// UP1 — Jahresplaner-Kernmodul. Rein, deterministisch, ohne DB/UI.
//
// - mergeAbsenceRanges(dates, year?): sortiert Kalendertage, fasst NUR
//   lückenlos aufeinanderfolgende Tage zu Balken zusammen. Optionaler
//   `year`-Parameter kappt vorab auf das Jahr (nur Anteil im gewählten
//   Jahr; Jahreswechsel-Urlaub liefert damit einen Balken bis 31.12.
//   bzw. ab 01.01. des Folgejahres).
// - dayOfYearPct(dateIso, year): Position und Breite eines einzelnen
//   Tages in Prozent der Jahresbreite. Schaltjahr-fest (365/366).
// - dailyVacationCounts(rangesByStaff, year): Map<dateIso,count> für den
//   Dichte-Streifen. Klemmt Bereiche auf das Jahresfenster.

function addDaysIso(iso: string, days: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

export function yearDayCount(year: number): number {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0 ? 366 : 365;
}

export function dayOfYearIndex(iso: string): number {
  const y = Number(iso.slice(0, 4));
  const m = Number(iso.slice(5, 7));
  const d = Number(iso.slice(8, 10));
  const start = Date.UTC(y, 0, 1);
  const cur = Date.UTC(y, m - 1, d);
  return Math.round((cur - start) / 86_400_000);
}

export function dayOfYearPct(
  dateIso: string,
  year: number,
): { leftPct: number; widthPct: number } {
  const total = yearDayCount(year);
  const idx = dayOfYearIndex(dateIso);
  return { leftPct: (idx / total) * 100, widthPct: (1 / total) * 100 };
}

export type AbsenceRange = { start: string; end: string; days: number };

export function mergeAbsenceRanges(datesIso: string[], year?: number): AbsenceRange[] {
  let list = Array.from(new Set(datesIso));
  if (year !== undefined) {
    const lo = `${year}-01-01`;
    const hi = `${year}-12-31`;
    list = list.filter((d) => d >= lo && d <= hi);
  }
  list.sort();
  const result: AbsenceRange[] = [];
  for (const d of list) {
    const last = result[result.length - 1];
    if (last && addDaysIso(last.end, 1) === d) {
      last.end = d;
      last.days += 1;
    } else {
      result.push({ start: d, end: d, days: 1 });
    }
  }
  return result;
}

export function dailyVacationCounts(
  rangesByStaff: Map<string, { start: string; end: string }[]>,
  year: number,
): Map<string, number> {
  const counts = new Map<string, number>();
  const lo = `${year}-01-01`;
  const hi = `${year}-12-31`;
  for (const ranges of rangesByStaff.values()) {
    for (const r of ranges) {
      const s = r.start < lo ? lo : r.start;
      const e = r.end > hi ? hi : r.end;
      if (s > e) continue;
      let cur = s;
      while (cur <= e) {
        counts.set(cur, (counts.get(cur) ?? 0) + 1);
        cur = addDaysIso(cur, 1);
      }
    }
  }
  return counts;
}

// Monats-Anker für 12-Spalten-Raster: leftPct je Monatsanfang.
export function monthOffsets(year: number): { month: number; leftPct: number }[] {
  const total = yearDayCount(year);
  const result: { month: number; leftPct: number }[] = [];
  for (let m = 0; m < 12; m++) {
    const idx = Math.round((Date.UTC(year, m, 1) - Date.UTC(year, 0, 1)) / 86_400_000);
    result.push({ month: m, leftPct: (idx / total) * 100 });
  }
  return result;
}