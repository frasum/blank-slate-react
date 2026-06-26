// Schritt 2 — Urlaub/Krank als steuer-/SV-pflichtige Lohnarten.
// Baut bis zu 4 Entgeltzeilen (Basis + Zuschlag je Abwesenheitsart) aus den
// von Frank gepflegten Tagezahlen + Soll-Std/Tag, Stundensatz und dem
// 3-Monats-Ø SFN/Tag (aus der Diagnose). Alle Zeilen `zeitlohn` (St=L/SV=L).

import type { Entgeltzeile } from "./types";

export function buildUrlaubKrankZeilen(args: {
  urlaubTage: number;
  krankTage: number;
  sollHoursPerDay: number;
  hourlyRateCents: number;
  sfnTagCent: number;
}): Entgeltzeile[] {
  const { urlaubTage, krankTage, sollHoursPerDay, hourlyRateCents, sfnTagCent } = args;
  const zeilen: Entgeltzeile[] = [];

  if (urlaubTage > 0) {
    const stunden = urlaubTage * sollHoursPerDay;
    zeilen.push({
      kategorie: "zeitlohn",
      bezeichnung: "Urlaubsstunden",
      betragCent: Math.round(stunden * hourlyRateCents),
      stunden,
      satzCent: hourlyRateCents,
    });
    zeilen.push({
      kategorie: "zeitlohn",
      bezeichnung: "Zuschlag Urlaubsentgelt (3M-Ø)",
      betragCent: Math.round(urlaubTage * sfnTagCent),
    });
  }

  if (krankTage > 0) {
    const stunden = krankTage * sollHoursPerDay;
    zeilen.push({
      kategorie: "zeitlohn",
      bezeichnung: "Lohnfortzahlung Krankheit",
      betragCent: Math.round(stunden * hourlyRateCents),
      stunden,
      satzCent: hourlyRateCents,
    });
    zeilen.push({
      kategorie: "zeitlohn",
      bezeichnung: "Zuschlag Krank (3M-Ø)",
      betragCent: Math.round(krankTage * sfnTagCent),
    });
  }

  return zeilen;
}
