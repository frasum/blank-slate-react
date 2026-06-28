// Reiner Parser für edlohn-Entgeltabrechnungs-Dateinamen.
// Keine DB, kein I/O — siehe Welle D / Lohn-Verteilung.
//
// Hinweis (Ehrlichkeitsregel): TSB ist aktuell aus der Lohnabrechnung
// ausgeklammert. perso_nr ist projektweit org-eindeutig (Live-CSV bestätigt).
// Wird TSB künftig in den Lohnlauf aufgenommen und kollidieren Personal-Nrn.,
// MUSS auf ein (Mandant, perso)-Modell umgestellt werden.

export type ParsedPayslipName = { persoNr: number; year: number; month: number };

const PATTERN = /-(\d{6})-(\d{4})-(0[1-9]|1[0-2])\.pdf$/i;

/**
 * Liest perso_nr + Abrechnungsmonat aus einem edlohn-PDF-Dateinamen.
 * Erwartetes Muster: "...-NNNNNN-YYYY-MM.pdf" (NNNNNN = 6-stellige perso_nr).
 * Gibt `null` zurück, wenn das Muster nicht passt — lieber Fehlanzeige
 * (Mensch prüft) als falsch zugeordnete Lohnabrechnung.
 */
export function parsePayslipName(fileName: string): ParsedPayslipName | null {
  const m = PATTERN.exec(fileName);
  if (!m) return null;
  return {
    persoNr: parseInt(m[1], 10),
    year: parseInt(m[2], 10),
    month: parseInt(m[3], 10),
  };
}