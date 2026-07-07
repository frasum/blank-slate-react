// Reine Hilfsfunktion für „Meine Schichten": gruppiert eine flache, nach
// shift_date sortierte Liste in Tages-Buckets unter Beibehaltung der
// Reihenfolge.

export type MyShiftRow = {
  id: string;
  shift_date: string;
  locationId: string;
  locationName: string;
  area: "kitchen" | "service" | "gl";
  skillCode: string | null;
  skillLabel: string | null;
  status: "planned" | "confirmed";
  notes: string | null;
  servicePeriod: "frueh" | "mittag" | "abend";
  /**
   * SP2 — Aktive Planungsfenster des Standorts. UI zeigt ein Fenster-Label
   * genau dann, wenn mehr als ein Fenster aktiv ist.
   */
  enabledServicePeriods: Array<"frueh" | "mittag" | "abend">;
  /**
   * Kompatibilitäts-Alias: mehr als ein aktives Fenster.
   * (Bleibt bis Commit 2 der UI-Umstellung.)
   */
  locationDayServiceEnabled: boolean;
};

export type MyShiftDay = {
  date: string;
  shifts: MyShiftRow[];
};

export function groupMyShiftsByDate(rows: MyShiftRow[]): MyShiftDay[] {
  const buckets = new Map<string, MyShiftRow[]>();
  const order: string[] = [];
  for (const row of rows) {
    const list = buckets.get(row.shift_date);
    if (list) {
      list.push(row);
    } else {
      buckets.set(row.shift_date, [row]);
      order.push(row.shift_date);
    }
  }
  return order.map((date) => ({ date, shifts: buckets.get(date)! }));
}
