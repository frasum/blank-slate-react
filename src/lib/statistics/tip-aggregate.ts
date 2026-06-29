// M-Statistik S-7 — Reine Aggregation der Per-Session-Trinkgeld-Ergebnisse.
//
// Keine DB-Zugriffe, keine eigene Trinkgeld-Berechnung — die wird ausschließlich
// von computeSessionTipPoolCore (cash.functions.ts) geliefert. Diese Datei
// summiert nur über Sessions/Tage/Personen.

export type SessionTipResult = {
  businessDate: string;
  serviceRemainderCents: number;
  kitchenRemainderCents: number;
  shares: Array<{ staffId: string; department: "kitchen" | "service"; shareCents: number }>;
};

export type TipDaily = {
  businessDate: string;
  serviceCents: number;
  kitchenCents: number;
};

export type TipTotals = {
  serviceCents: number;
  kitchenCents: number;
  totalCents: number;
};

export type TipPerStaff = {
  staffId: string;
  department: "kitchen" | "service";
  tipCents: number;
};

export function aggregateTips(
  results: SessionTipResult[],
  staffNames: Record<string, string>,
): {
  daily: TipDaily[];
  totals: TipTotals;
  perStaff: Array<TipPerStaff & { name: string }>;
} {
  const dailyMap = new Map<string, { serviceCents: number; kitchenCents: number }>();
  const perStaffMap = new Map<
    string,
    { staffId: string; department: "kitchen" | "service"; tipCents: number }
  >();
  let serviceTotal = 0;
  let kitchenTotal = 0;

  for (const r of results) {
    const row = dailyMap.get(r.businessDate) ?? { serviceCents: 0, kitchenCents: 0 };
    row.serviceCents += r.serviceRemainderCents;
    row.kitchenCents += r.kitchenRemainderCents;
    dailyMap.set(r.businessDate, row);
    serviceTotal += r.serviceRemainderCents;
    kitchenTotal += r.kitchenRemainderCents;

    for (const share of r.shares) {
      const existing = perStaffMap.get(share.staffId);
      if (existing) {
        existing.tipCents += share.shareCents;
      } else {
        perStaffMap.set(share.staffId, {
          staffId: share.staffId,
          department: share.department,
          tipCents: share.shareCents,
        });
      }
    }
  }

  const daily: TipDaily[] = Array.from(dailyMap.entries())
    .map(([businessDate, v]) => ({ businessDate, ...v }))
    .sort((a, b) => a.businessDate.localeCompare(b.businessDate));

  const perStaff = Array.from(perStaffMap.values())
    .map((p) => ({ ...p, name: staffNames[p.staffId] ?? p.staffId }))
    .sort((a, b) => b.tipCents - a.tipCents);

  return {
    daily,
    totals: {
      serviceCents: serviceTotal,
      kitchenCents: kitchenTotal,
      totalCents: serviceTotal + kitchenTotal,
    },
    perStaff,
  };
}