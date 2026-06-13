// PIN-Format-Validierung für PIN-Verwaltung (B1c).
// Vorgabe: 4–8 Ziffern, keine sonstigen Zeichen.

export const PIN_MIN_LENGTH = 4;
export const PIN_MAX_LENGTH = 8;

export function isValidPinFormat(pin: string): boolean {
  return new RegExp(`^\\d{${PIN_MIN_LENGTH},${PIN_MAX_LENGTH}}$`).test(pin);
}

export function assertValidPinFormat(pin: string): void {
  if (!isValidPinFormat(pin)) {
    throw new Error("PIN muss aus 4 bis 8 Ziffern bestehen.");
  }
}
