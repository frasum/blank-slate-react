// Schreibgate für Kasse — reines Modul, keine I/O.
//
// Verschränkt zwei Sperren:
//   * sessions.locked_at / status='locked' (Tag-Sperre, Einzeltag)
//   * organization_settings.cash_locked_through_date (Wasserlinie,
//     alle Tage <= Datum)
//
// status='finalized' ist KEINE Schreibsperre für Korrekturen
// (M2-Steckbrief §5): finalized ist Zwischenstatus für die Manager-
// Übersicht; Manager dürfen weiter korrigieren bis zur harten Sperre.

export class CashLockedError extends Error {
  constructor(
    public readonly businessDate: string,
    public readonly reason: "session_locked" | "below_waterline",
    public readonly waterline: string | null,
  ) {
    const detail =
      reason === "session_locked"
        ? `Session vom ${businessDate} ist gesperrt.`
        : `Geschäftstag ${businessDate} liegt unter der Wasserlinie (${waterline}).`;
    super(`${detail} Nur ein Admin kann die Sperre verschieben.`);
    this.name = "CashLockedError";
  }
}

export type SessionStatus = "open" | "finalized" | "locked";

export type AssertCashWritableInput = {
  businessDate: string; // ISO YYYY-MM-DD
  sessionStatus: SessionStatus;
  sessionLockedAt: string | null;
  cashLockedThroughDate: string | null;
};

export function isBelowWaterline(
  businessDate: string,
  waterline: string | null,
): boolean {
  if (!waterline) return false;
  return businessDate <= waterline; // ISO-Strings lexikographisch vergleichbar
}

export function assertCashWritable(input: AssertCashWritableInput): void {
  if (input.sessionStatus === "locked" || input.sessionLockedAt !== null) {
    throw new CashLockedError(input.businessDate, "session_locked", input.cashLockedThroughDate);
  }
  if (isBelowWaterline(input.businessDate, input.cashLockedThroughDate)) {
    throw new CashLockedError(
      input.businessDate,
      "below_waterline",
      input.cashLockedThroughDate,
    );
  }
}