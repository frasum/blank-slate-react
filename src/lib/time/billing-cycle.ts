// Z5 — Abrechnungsperioden-Rhythmus 26.→25. als reine Berechnung.
//
// Kein DB-Zugriff, damit die Regel in Server-Handlern und Tests identisch
// verwendet wird. Die Perioden-Tabelle bleibt Führungsgröße für das Sperren
// abgeschlossener Perioden; diese Funktion liefert nur den logischen
// Kalender-Rahmen der laufenden Periode für heute (todayIso).

function pad(n: number): string {
  return String(n).padStart(2, "0");
}

export function currentBillingCycle(todayIso: string): {
  startDate: string;
  endDate: string;
} {
  const [y, m, d] = todayIso.split("-").map(Number);
  let startY = y;
  let startM = m;
  let endY = y;
  let endM = m;
  if (d <= 25) {
    startM = m - 1;
    if (startM === 0) {
      startM = 12;
      startY = y - 1;
    }
    endM = m;
    endY = y;
  } else {
    startM = m;
    startY = y;
    endM = m + 1;
    endY = y;
    if (endM === 13) {
      endM = 1;
      endY = y + 1;
    }
  }
  return {
    startDate: `${startY}-${pad(startM)}-26`,
    endDate: `${endY}-${pad(endM)}-25`,
  };
}

export function isInCurrentBillingCycle(businessDateIso: string, todayIso: string): boolean {
  const { startDate, endDate } = currentBillingCycle(todayIso);
  return businessDateIso >= startDate && businessDateIso <= endDate;
}