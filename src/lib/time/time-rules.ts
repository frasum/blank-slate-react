// Reine Geschäftsregeln für Zeiterfassung (B2a).
// Keine I/O, keine DB. Wird VOR jedem Schreibvorgang in clockIn/clockOut
// gegen einen frisch geladenen Snapshot geprüft.

export type OpenEntry = {
  id: string;
  startedAt: Date;
};

export type ClockInInput = {
  staffIsActive: boolean;
  openEntry: OpenEntry | null;
};

export type ClockOutInput = {
  openEntry: OpenEntry | null;
  now: Date;
};

export type RuleResult =
  | { ok: true }
  | { ok: false; reason: ClockInDenial | ClockOutDenial };

export type ClockInDenial = "staff_inactive" | "already_clocked_in";
export type ClockOutDenial = "no_open_entry" | "end_before_start";

export function canClockIn(input: ClockInInput): RuleResult {
  if (!input.staffIsActive) return { ok: false, reason: "staff_inactive" };
  if (input.openEntry !== null) return { ok: false, reason: "already_clocked_in" };
  return { ok: true };
}

export function canClockOut(input: ClockOutInput): RuleResult {
  if (input.openEntry === null) return { ok: false, reason: "no_open_entry" };
  if (input.now.getTime() <= input.openEntry.startedAt.getTime()) {
    return { ok: false, reason: "end_before_start" };
  }
  return { ok: true };
}

export function denialMessage(reason: ClockInDenial | ClockOutDenial): string {
  switch (reason) {
    case "staff_inactive":
      return "Inaktive Mitarbeiter können nicht stempeln.";
    case "already_clocked_in":
      return "Du bist bereits eingestempelt.";
    case "no_open_entry":
      return "Kein offener Stempel-Eintrag vorhanden.";
    case "end_before_start":
      return "Stempel-Ende muss nach dem Stempel-Beginn liegen.";
  }
}