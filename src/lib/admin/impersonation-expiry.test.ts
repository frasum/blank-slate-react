import { describe, expect, it } from "vitest";
import {
  IMPERSONATION_MAX_MINUTES,
  impersonationRemainingMs,
  isImpersonationExpired,
} from "./impersonation-expiry";

describe("isImpersonationExpired", () => {
  const start = "2026-07-07T10:00:00.000Z";

  it("frisch gestartet ist nicht abgelaufen", () => {
    expect(isImpersonationExpired(start, "2026-07-07T10:00:00.000Z")).toBe(false);
  });

  it("nach 59 min noch nicht abgelaufen", () => {
    expect(isImpersonationExpired(start, "2026-07-07T10:59:00.000Z")).toBe(false);
  });

  it("exakt bei 60 min gilt noch als aktiv (Grenzfall)", () => {
    expect(isImpersonationExpired(start, "2026-07-07T11:00:00.000Z")).toBe(false);
  });

  it("eine Millisekunde nach 60 min ist abgelaufen", () => {
    expect(isImpersonationExpired(start, "2026-07-07T11:00:00.001Z")).toBe(true);
  });

  it("61 min ist deutlich abgelaufen", () => {
    expect(isImpersonationExpired(start, "2026-07-07T11:01:00.000Z")).toBe(true);
  });

  it("Zeitzonen-neutral: äquivalente Zeitpunkte in unterschiedlichen Offsets sind gleich", () => {
    // 12:00 Europe/Berlin (Sommer, +02:00) == 10:00 UTC
    expect(isImpersonationExpired("2026-07-07T12:00:00+02:00", "2026-07-07T13:01:00+02:00")).toBe(
      true,
    );
    expect(isImpersonationExpired("2026-07-07T12:00:00+02:00", "2026-07-07T13:00:00+02:00")).toBe(
      false,
    );
  });

  it("respektiert benutzerdefinierte Maximaldauer", () => {
    expect(isImpersonationExpired(start, "2026-07-07T10:31:00.000Z", 30)).toBe(true);
    expect(isImpersonationExpired(start, "2026-07-07T10:29:00.000Z", 30)).toBe(false);
  });

  it("ungültige Zeitstempel werfen keinen Fehler (Fallback: nicht abgelaufen)", () => {
    expect(isImpersonationExpired("nope", "2026-07-07T10:00:00.000Z")).toBe(false);
  });

  it("Default-Konstante ist 60 Minuten", () => {
    expect(IMPERSONATION_MAX_MINUTES).toBe(60);
  });
});

describe("impersonationRemainingMs", () => {
  const start = "2026-07-07T10:00:00.000Z";

  it("liefert volle 60 min bei Startzeitpunkt", () => {
    expect(impersonationRemainingMs(start, start)).toBe(60 * 60_000);
  });

  it("liefert 1 min nach 59 min", () => {
    expect(impersonationRemainingMs(start, "2026-07-07T10:59:00.000Z")).toBe(60_000);
  });

  it("nie negativ nach Ablauf", () => {
    expect(impersonationRemainingMs(start, "2026-07-07T12:00:00.000Z")).toBe(0);
  });
});