// SD1b — Regressionsschutz: getStaffForRoster darf kein volles Geburtsdatum
// mehr ausliefern. Der Roster-Marker vergleicht nur MM-DD.
import { describe, it, expectTypeOf } from "vitest";
import type { RosterStaffRow } from "./roster.functions";

describe("RosterStaffRow-Shape (SD1b)", () => {
  it("enthält birthdayMonthDay statt dateOfBirth", () => {
    expectTypeOf<RosterStaffRow>().toHaveProperty("birthdayMonthDay");
    expectTypeOf<RosterStaffRow>().not.toHaveProperty("dateOfBirth");
  });
});