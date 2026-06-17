// Welle B — reine Hilfsfunktionen für Freier-Tag-Wünsche.
// Keine I/O, kein React — testbar via Vitest.

export function dayOffWishKey(staffId: string, iso: string): string {
  return `${staffId}|${iso}`;
}

export function sortWishesByDate<T extends { wishDate: string }>(rows: T[]): T[] {
  return [...rows].sort((a, b) => (a.wishDate < b.wishDate ? -1 : a.wishDate > b.wishDate ? 1 : 0));
}
