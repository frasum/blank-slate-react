// M-Statistik S-8 — Personalquote: reine Funktionen.
//
// EHRLICHKEITSREGEL: Diese Stufe rechnet *Basis-Brutto-Lohnkosten*:
//   Netto-Stunden × Basis-Stundenlohn (staff_compensation.hourly_rate,
//   gültigkeitsdatiert, in EUR — numeric(10,2)).
//
// Bewusst NICHT enthalten (spätere Lohn-Modul-Stufe):
//   - Arbeitgeber-SV-Anteil
//   - SFN-Zuschläge
//   - zweiter Satz `hourly_rate_2`
//
// Der Wert ist eine NÄHERUNG der Brutto-Lohnkosten, NICHT die volle
// Arbeitgeberkostenquote. Werte hier dürfen nicht als „echte" Personalkosten
// im Lohn-Sinn dargestellt werden.
//
// Rein, deterministisch. Ganzzahlige Cents intern (außer Stunden/Prozent
// als Anzeige-Dezimal).

export type CompRow = { validFrom: string; hourlyRateEur: number };

export type WorkEntry = {
  staffId: string;
  businessDate: string; // "YYYY-MM-DD"
  netMinutes: number; // bereits netto (gross - break, >= 0)
};

export type PersonnelPerStaff = {
  staffId: string;
  netHours: number; // 2 Nachkommastellen
  laborCostCents: number;
};

export type PersonnelAgg = {
  totalNetHours: number; // 2 Nachkommastellen
  totalLaborCostCents: number;
  perStaff: PersonnelPerStaff[]; // absteigend nach laborCostCents
  staffWithoutRate: string[]; // staffIds mit Stunden aber ohne gültigen Satz
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

/**
 * Gültigkeitsdatierte Satz-Wahl: größtes `validFrom <= workDate`.
 * Grenzfall `validFrom == workDate` ist gültig. Keiner gültig → null.
 */
export function selectHourlyRateEur(rows: CompRow[], workDate: string): number | null {
  let best: CompRow | null = null;
  for (const r of rows) {
    if (r.validFrom > workDate) continue;
    if (!best || r.validFrom > best.validFrom) best = r;
  }
  return best ? best.hourlyRateEur : null;
}

/**
 * EUR-Satz × Netto-Stunden → Cent (ganzzahlig gerundet).
 */
export function laborCostCents(netHours: number, hourlyRateEur: number): number {
  return Math.round(netHours * hourlyRateEur * 100);
}

export function aggregatePersonnel(
  entries: WorkEntry[],
  compByStaff: Record<string, CompRow[]>,
): PersonnelAgg {
  const perStaffMap = new Map<string, { netHours: number; laborCostCents: number }>();
  const withoutRate = new Set<string>();

  for (const e of entries) {
    const netHours = e.netMinutes / 60;
    const rate = selectHourlyRateEur(compByStaff[e.staffId] ?? [], e.businessDate);
    const cost = rate === null ? 0 : laborCostCents(netHours, rate);
    if (rate === null) withoutRate.add(e.staffId);
    const cur = perStaffMap.get(e.staffId);
    if (cur) {
      cur.netHours += netHours;
      cur.laborCostCents += cost;
    } else {
      perStaffMap.set(e.staffId, { netHours, laborCostCents: cost });
    }
  }

  let totalNetHours = 0;
  let totalLaborCostCents = 0;
  const perStaff: PersonnelPerStaff[] = [];
  for (const [staffId, agg] of perStaffMap.entries()) {
    totalNetHours += agg.netHours;
    totalLaborCostCents += agg.laborCostCents;
    perStaff.push({
      staffId,
      netHours: round2(agg.netHours),
      laborCostCents: agg.laborCostCents,
    });
  }
  perStaff.sort((a, b) => b.laborCostCents - a.laborCostCents);

  return {
    totalNetHours: round2(totalNetHours),
    totalLaborCostCents,
    perStaff,
    staffWithoutRate: Array.from(withoutRate).sort(),
  };
}

/**
 * Personalquote in Prozent. revenue 0 → null (kein definierter Wert).
 * Einzige Quote-Definition — UI ruft diese Funktion mit den Totals aus
 * getPersonnelStats + getRevenueStats.
 */
export function personnelRatioPct(
  laborCostCents: number,
  revenueCents: number,
): number | null {
  if (revenueCents === 0) return null;
  return (laborCostCents / revenueCents) * 100;
}