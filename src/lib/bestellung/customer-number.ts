// SL1: Reine Auflösung der Kundennummer je Bestellung.
//
// Semantik (siehe supplier_locations-Migration):
// - Fehlt die Standort-Zeile → org-weiter Wert (suppliers.customer_number).
// - Zeile mit NULL / Leerstring in customer_number → ebenfalls Fallback.
// - Zeile mit non-empty customer_number → verwenden.
//
// Bewusst KEINE .functions/.server-Endung: reiner Helper, in Browser- und
// Server-Code importierbar, damit z. B. UI-Previews denselben Wert zeigen
// wie der Versand.

export function resolveCustomerNumber(
  orgWide: string | null | undefined,
  perLocation: { customer_number: string | null } | null | undefined,
): string | null {
  const perLoc = perLocation?.customer_number;
  if (typeof perLoc === "string" && perLoc.trim().length > 0) {
    return perLoc;
  }
  if (typeof orgWide === "string" && orgWide.trim().length > 0) {
    return orgWide;
  }
  return null;
}