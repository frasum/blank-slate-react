// PIN-Format-Validierung für PIN-Verwaltung (B1c).
//
// SEC-PIN2: Mindestlänge auf 6 Ziffern erhöht (vorher 4). Ein 4-stelliger
// PIN hat nur 10.000 Kombinationen — mit dem 15-Min/5-Versuche-Limit sind
// realistisch mehrere Tage Bruteforce möglich, mit 6 Stellen sind es 1 Mio.
// ACHTUNG: bereits gespeicherte 4- oder 5-stellige PINs bleiben in der DB
// gültig und funktionieren beim Login weiterhin (siehe PIN_CREDENTIAL_PATTERN
// in auth-flows.functions.ts). Erst beim NÄCHSTEN Setzen greift die neue
// Untergrenze — Admins sollten bestehende Kurz-PINs proaktiv rotieren.
export const PIN_MIN_LENGTH = 6;
export const PIN_MAX_LENGTH = 8;

export function isValidPinFormat(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`).test(pin);
}

export function assertValidPinFormat(pin: string): void {
  if (!isValidPinFormat(pin)) {
    throw new Error(`PIN muss aus ${PIN_MIN_LENGTH} bis ${PIN_MAX_LENGTH} Ziffern bestehen.`);
  }
}
