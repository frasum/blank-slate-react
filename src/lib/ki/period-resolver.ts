// KI1 — Deterministische Zeitraum-Presets. Reines Modul, damit das Sprach-
// modell dieselben Fenster nennt wie die Tools verwenden ("letzter Monat"
// == 01.–30.06. wenn heute im Juli). Wird sowohl vom Tool
// `stammdaten_lookup('zeitraum_presets')` geliefert als auch im System-
// prompt referenziert.

export type PresetKey =
  | "heute"
  | "gestern"
  | "diese_woche"
  | "letzte_woche"
  | "letzte_7_tage"
  | "letzte_30_tage"
  | "diesen_monat"
  | "letzter_monat"
  | "dieses_jahr";

export type Preset = {
  key: PresetKey;
  label: string;
  from: string; // ISO YYYY-MM-DD
  to: string; // ISO YYYY-MM-DD (inklusive)
};

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function toIsoDate(d: Date): string {
  return `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
}

function addDays(d: Date, days: number): Date {
  const c = new Date(d.getTime());
  c.setUTCDate(c.getUTCDate() + days);
  return c;
}

/** Montag (ISO-Woche) einer Referenz. Referenz-Zeit wird auf UTC-Mitternacht getrimmt. */
function mondayOf(d: Date): Date {
  const day = d.getUTCDay(); // 0 = So, 1 = Mo, ..., 6 = Sa
  const diff = day === 0 ? -6 : 1 - day;
  const m = addDays(d, diff);
  return new Date(Date.UTC(m.getUTCFullYear(), m.getUTCMonth(), m.getUTCDate()));
}

/** Liefert alle Standard-Presets relativ zu `today` (UTC). */
export function computePresets(today: Date = new Date()): Preset[] {
  const today0 = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const yesterday = addDays(today0, -1);
  const weekStart = mondayOf(today0);
  const lastWeekStart = addDays(weekStart, -7);
  const lastWeekEnd = addDays(weekStart, -1);

  const y = today0.getUTCFullYear();
  const m = today0.getUTCMonth();
  const thisMonthStart = new Date(Date.UTC(y, m, 1));
  const lastMonthStart = new Date(Date.UTC(y, m - 1, 1));
  const lastMonthEnd = new Date(Date.UTC(y, m, 0)); // Tag 0 = letzter Tag des Vormonats
  const yearStart = new Date(Date.UTC(y, 0, 1));

  return [
    { key: "heute", label: "Heute", from: toIsoDate(today0), to: toIsoDate(today0) },
    { key: "gestern", label: "Gestern", from: toIsoDate(yesterday), to: toIsoDate(yesterday) },
    {
      key: "diese_woche",
      label: "Diese Woche (Mo–heute)",
      from: toIsoDate(weekStart),
      to: toIsoDate(today0),
    },
    {
      key: "letzte_woche",
      label: "Letzte Woche (Mo–So)",
      from: toIsoDate(lastWeekStart),
      to: toIsoDate(lastWeekEnd),
    },
    {
      key: "letzte_7_tage",
      label: "Letzte 7 Tage",
      from: toIsoDate(addDays(today0, -6)),
      to: toIsoDate(today0),
    },
    {
      key: "letzte_30_tage",
      label: "Letzte 30 Tage",
      from: toIsoDate(addDays(today0, -29)),
      to: toIsoDate(today0),
    },
    {
      key: "diesen_monat",
      label: "Diesen Monat",
      from: toIsoDate(thisMonthStart),
      to: toIsoDate(today0),
    },
    {
      key: "letzter_monat",
      label: "Letzter Monat (voll)",
      from: toIsoDate(lastMonthStart),
      to: toIsoDate(lastMonthEnd),
    },
    {
      key: "dieses_jahr",
      label: "Dieses Jahr (bis heute)",
      from: toIsoDate(yearStart),
      to: toIsoDate(today0),
    },
  ];
}