import { describe, expect, it } from "vitest";
import { shouldShowCrossBookingDot, type DisplayCellKind } from "./cell";

describe("shouldShowCrossBookingDot", () => {
  it.each<DisplayCellKind>(["empty", "available"])(
    "zeigt den Punkt auf leeren Display-Zellen (%s)",
    (cellKind) => {
      expect(shouldShowCrossBookingDot({ cellKind, crossBooked: true })).toBe(true);
    },
  );

  it.each<DisplayCellKind>(["shift", "urlaub", "krank", "wish"])(
    "überlagert belegte Status-Zellen nicht (%s)",
    (cellKind) => {
      expect(shouldShowCrossBookingDot({ cellKind, crossBooked: true })).toBe(false);
    },
  );

  it("zeigt ohne Cross-Booking keinen Punkt", () => {
    expect(shouldShowCrossBookingDot({ cellKind: "empty", crossBooked: false })).toBe(false);
  });
});