// B4 — Trinkgeld-Pool: reine Rechenfunktion.
//
// Keine I/O. Inputs:
//   * kitchenPoolCents / servicePoolCents — bereits berechnete Pool-Summen
//   * settlements — aktive (nicht-superseded) Kellnerabrechnungen
//     (werden hier nicht erneut summiert; sie liefern nur staff-Liste/
//     Trinkgeld-Cent-Werte für etwaige Erweiterungen)
//   * timeEntries — geschlossene Zeiteinträge der Session
//     (nur ended_at != null wird gezählt)
//   * staffDepartments — staff_locations.department je Mitarbeiter
//     für den Session-Standort
//   * staffParticipates — staff.participates_in_pool je Mitarbeiter
//
// Verteilung pro Pool:
//   anteil = FLOOR(pool * eigene_stunden / gesamt_stunden)
//   Rundungsrest verbleibt im Pool (kein Trickle-Down, kein Ausgleich).
//
// GL ist aus beiden Pools ausgeschlossen. Nicht-teilnehmende
// Mitarbeiter ebenfalls. Leere Stunden → alle Anteile 0, Rest = Pool.

export type StaffDepartment = "kitchen" | "service" | "gl";

export function computeTipTotalCents(
  settlements: Array<{
    cardTotalCents: number;
    cashHandedInCents: number;
    posSalesCents: number;
    openInvoicesCents: number;
  }>,
): number {
  return settlements.reduce(
    (s, x) =>
      s + x.cardTotalCents + x.cashHandedInCents - x.posSalesCents - x.openInvoicesCents,
    0,
  );
}

export type TipPoolInput = {
  kitchenPoolCents: number;
  servicePoolCents: number;
  settlements: Array<{
    staffId: string;
    posSalesCents: number;
    cardTotalCents: number;
    openInvoicesCents: number;
    kitchenTipCents: number;
  }>;
  timeEntries: Array<{
    staffId: string;
    startedAt: string; // ISO
    endedAt: string; // ISO
  }>;
  staffDepartments: Map<string, StaffDepartment>;
  staffParticipates: Map<string, boolean>;
};

export type TipPoolShare = {
  staffId: string;
  department: "kitchen" | "service";
  hoursWorked: number; // Dezimal, 2 Stellen
  shareCents: number;
};

export type TipPoolResult = {
  kitchenPoolCents: number;
  servicePoolCents: number;
  kitchenRemainder: number;
  serviceRemainder: number;
  shares: TipPoolShare[];
};

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function distribute(
  poolCents: number,
  participants: Array<{ staffId: string; hours: number; department: "kitchen" | "service" }>,
): { shares: TipPoolShare[]; remainder: number } {
  if (!Number.isInteger(poolCents)) throw new Error("poolCents must be integer cents");
  const totalHours = participants.reduce((s, p) => s + p.hours, 0);
  if (poolCents <= 0 || totalHours <= 0) {
    return {
      shares: participants.map((p) => ({
        staffId: p.staffId,
        department: p.department,
        hoursWorked: round2(p.hours),
        shareCents: 0,
      })),
      remainder: poolCents,
    };
  }
  let distributed = 0;
  const shares: TipPoolShare[] = participants.map((p) => {
    const share = Math.floor((poolCents * p.hours) / totalHours);
    distributed += share;
    return {
      staffId: p.staffId,
      department: p.department,
      hoursWorked: round2(p.hours),
      shareCents: share,
    };
  });
  return { shares, remainder: poolCents - distributed };
}

export function computeTipPool(input: TipPoolInput): TipPoolResult {
  const hoursByStaff = new Map<string, number>();
  for (const te of input.timeEntries) {
    if (!te.endedAt) continue;
    const ms = new Date(te.endedAt).getTime() - new Date(te.startedAt).getTime();
    if (!(ms > 0)) continue;
    hoursByStaff.set(te.staffId, (hoursByStaff.get(te.staffId) ?? 0) + ms / 3_600_000);
  }

  const staffIds = new Set<string>([
    ...hoursByStaff.keys(),
    ...input.settlements.map((s) => s.staffId),
  ]);

  const kitchen: Array<{ staffId: string; hours: number; department: "kitchen" }> = [];
  const service: Array<{ staffId: string; hours: number; department: "service" }> = [];

  for (const staffId of staffIds) {
    if (input.staffParticipates.get(staffId) === false) continue;
    const dept = input.staffDepartments.get(staffId);
    if (dept !== "kitchen" && dept !== "service") continue;
    const hours = hoursByStaff.get(staffId) ?? 0;
    if (dept === "kitchen") kitchen.push({ staffId, hours, department: "kitchen" });
    else service.push({ staffId, hours, department: "service" });
  }

  const k = distribute(input.kitchenPoolCents, kitchen);
  const s = distribute(input.servicePoolCents, service);

  return {
    kitchenPoolCents: input.kitchenPoolCents,
    servicePoolCents: input.servicePoolCents,
    kitchenRemainder: k.remainder,
    serviceRemainder: s.remainder,
    shares: [...k.shares, ...s.shares],
  };
}
