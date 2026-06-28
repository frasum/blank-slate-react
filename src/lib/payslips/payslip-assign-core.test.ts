import { describe, it, expect } from "vitest";
import { classifyAssignment, type StaffLite } from "./payslip-assign-core";

const parsed = { persoNr: 6, year: 2026, month: 5 };
const fileName = "Entgeltabrechnung-X-000006-2026-05.pdf";

const rowActive: StaffLite = { id: "s1", display_name: "Phattanaphol", is_active: true };
const rowInactive: StaffLite = { id: "s2", display_name: "Inaktiv", is_active: false };

describe("classifyAssignment", () => {
  it("matched bei genau 1 aktiver staff-Zeile", () => {
    const d = classifyAssignment(fileName, parsed, [rowActive]);
    expect(d.status).toBe("matched");
    expect(d.staffId).toBe("s1");
  });
  it("matched_inactive bei 1 inaktiver staff-Zeile", () => {
    const d = classifyAssignment(fileName, parsed, [rowInactive]);
    expect(d.status).toBe("matched_inactive");
    expect(d.staffId).toBe("s2");
  });
  it("unknown_perso bei 0 Zeilen", () => {
    const d = classifyAssignment(fileName, parsed, []);
    expect(d.status).toBe("unknown_perso");
    expect(d.staffId).toBeNull();
  });
  it("ambiguous bei >1 Zeile", () => {
    const d = classifyAssignment(fileName, parsed, [rowActive, rowInactive]);
    expect(d.status).toBe("ambiguous");
    expect(d.staffId).toBeNull();
  });
  it("unparsable bei parsed=null", () => {
    const d = classifyAssignment("report.pdf", null, []);
    expect(d.status).toBe("unparsable");
    expect(d.persoNr).toBeNull();
  });
});
