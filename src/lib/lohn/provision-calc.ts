// P1 — Provisions-Berechnung (umsatzbasierte Kellner-Provision).
//
// Portierung der Legacy-`useCommissionData`-Semantik aus tagesabrechnung,
// aber:
//   * durchgängig in BIGINT cents (Legacy verlor Rundungscents an Floats),
//   * centgenaue Verteilung per Largest-Remainder,
//   * zeitraum-agnostisch (Perioden UND einzelne Wochen möglich).
//
// Reines Modul: keine I/O, keine Supabase-Zugriffe, keine Zeitzonen-Magie.
// Alle Eingaben sind bereits vorbereitete Werte (Cents, Minuten, Ids).

export type ProvisionSettlementInput = {
  staffId: string;
  posSalesCents: number;
  partnerStaffIds: string[];
};

export type ProvisionDayInput = {
  businessDate: string;
  settlements: ProvisionSettlementInput[];
};

export type ProvisionSettings = {
  minRevenueCents: number;
  pct: number; // 0..100, max. 2 Nachkommastellen (siehe Server-Fn-Zod-Schema)
};

export type ProvisionDayBreakdown = {
  businessDate: string;
  waiterCount: number;
  revenueCents: number;
  thresholdCents: number; // minRevenueCents × waiterCount
  dayPoolCents: number;
};

export type ProvisionPoolResult = {
  poolCents: number;
  dayBreakdown: ProvisionDayBreakdown[];
};

export type ProvisionStaffHours = { staffId: string; minutes: number };

// Robuste Kaufmanns-Rundung (bevorzugt gegenüber Math.round: JS rundet dort
// −0,5 → 0, wir wollen die Tie-Break-Richtung nicht diskutieren müssen).
function roundHalfAwayFromZero(x: number): number {
  return x >= 0 ? Math.floor(x + 0.5) : -Math.floor(-x + 0.5);
}

/**
 * Tagesumsatz × Satz oberhalb einer Kellner-Kopf-Schwelle.
 *
 * - Kellner-Set pro Tag = Haupt-Kellner der Abrechnung + Partner (Zweit-/
 *   Zusatzkellner). GL-Ids werden IMMER entfernt (auch wenn sie fälschlich
 *   als Partner geführt wurden). Deduplizierung per Set.
 * - Tagesumsatz = Σ posSalesCents ALLER Nicht-GL-Abrechnungen.
 *   (Abrechnungen von GL-Mitarbeitern gehen weder in Umsatz noch in
 *   Kellnerzahl ein.)
 * - Schwelle: nur wenn `revenue / waiterCount ≥ minRevenueCents`, dann
 *   `dayPool = round((revenue − minRev × waiterCount) × pct / 100)`.
 *   Sonst 0. Nie negativ.
 */
export function computeProvisionPool(
  days: ProvisionDayInput[],
  settings: ProvisionSettings,
  glStaffIds: ReadonlySet<string>,
): ProvisionPoolResult {
  const breakdown: ProvisionDayBreakdown[] = [];
  let pool = 0;

  for (const day of days) {
    let revenue = 0;
    const waiters = new Set<string>();
    for (const s of day.settlements) {
      if (glStaffIds.has(s.staffId)) continue; // GL-Abrechnung komplett raus
      revenue += Math.max(0, s.posSalesCents);
      waiters.add(s.staffId);
      for (const p of s.partnerStaffIds) {
        if (!glStaffIds.has(p)) waiters.add(p);
      }
    }
    const waiterCount = waiters.size;
    const thresholdCents = settings.minRevenueCents * waiterCount;
    let dayPool = 0;
    if (waiterCount > 0 && revenue / waiterCount >= settings.minRevenueCents) {
      const gross = (revenue - thresholdCents) * (settings.pct / 100);
      dayPool = Math.max(0, roundHalfAwayFromZero(gross));
    }
    pool += dayPool;
    breakdown.push({
      businessDate: day.businessDate,
      waiterCount,
      revenueCents: revenue,
      thresholdCents,
      dayPoolCents: dayPool,
    });
  }

  return { poolCents: pool, dayBreakdown: breakdown };
}

/**
 * Verteilt den Pool proportional zu Minuten mit Largest-Remainder-Rundung.
 *
 * Invarianten:
 *   * Σ Auszahlungen === poolCents (kein Cent geht verloren).
 *   * Bei Ties (gleiche Nachkommastelle) wird deterministisch nach staffId
 *     (aufsteigend) vergeben — reproduzierbar über Testläufe/DB-Reihenfolge.
 *   * poolCents ≤ 0 oder totalMinutes ≤ 0 ⇒ leere Map.
 */
export function distributeProvision(
  poolCents: number,
  hours: ProvisionStaffHours[],
): Map<string, number> {
  const out = new Map<string, number>();
  if (poolCents <= 0) return out;
  const totalMinutes = hours.reduce((acc, h) => acc + Math.max(0, h.minutes), 0);
  if (totalMinutes <= 0) return out;

  type Row = { staffId: string; base: number; frac: number };
  const rows: Row[] = [];
  let assigned = 0;
  for (const h of hours) {
    const minutes = Math.max(0, h.minutes);
    if (minutes === 0) {
      out.set(h.staffId, 0);
      continue;
    }
    const exact = (poolCents * minutes) / totalMinutes;
    const base = Math.floor(exact);
    const frac = exact - base;
    rows.push({ staffId: h.staffId, base, frac });
    out.set(h.staffId, base);
    assigned += base;
  }

  let remainder = poolCents - assigned;
  if (remainder > 0 && rows.length > 0) {
    // Größte Nachkomma-Reste zuerst, bei Tie deterministisch nach staffId.
    rows.sort((a, b) => {
      if (b.frac !== a.frac) return b.frac - a.frac;
      return a.staffId < b.staffId ? -1 : a.staffId > b.staffId ? 1 : 0;
    });
    for (let i = 0; i < rows.length && remainder > 0; i++) {
      out.set(rows[i].staffId, (out.get(rows[i].staffId) ?? 0) + 1);
      remainder--;
    }
  }

  return out;
}
