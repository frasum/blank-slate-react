/**
 * Zusammenbau Brutto → Steuer-/SV-Brutto → Netto → Auszahlung
 * (Schritte A–F gem. Bauplan M4 Stufe 1).
 */

import { KIRCHENSTEUER_BAYERN_PROZENT, LZZ_MONAT } from "./config-2026";
import { lohnsteuer2026 } from "./lohnsteuer-2026";
import { svBeitraege, svBeitraegeMinijob, type SvErgebnis } from "./sv-2026";
import type { Entgeltzeile, Kategorie, LohnEingabe, LohnErgebnis } from "./types";

function sumBy(zeilen: Entgeltzeile[], pred: (k: Kategorie) => boolean): number {
  let s = 0;
  for (const z of zeilen) {
    if (pred(z.kategorie)) s += z.betragCent;
  }
  return s;
}

/** Kaufmännische Cent-Rundung. */
function roundCent(centValue: number): number {
  return Math.sign(centValue) * Math.round(Math.abs(centValue));
}

/**
 * Berechnet die vier Kennzahlen (Gesamtbrutto, St/SV-Brutto, Netto,
 * Auszahlung) und liefert alle Zwischengrößen mit zurück.
 */
export function berechneLohn(eingabe: LohnEingabe): LohnErgebnis {
  const { person, zeilen } = eingabe;

  // --- Schritt A: Gesamtbrutto = Summe aller Zeilen außer 'abzug' ---
  const gesamtbruttoCent = sumBy(zeilen, (k) => k !== "abzug");

  // --- Schritt B: Steuer-/SV-Brutto ---
  const summeZuschlagFrei = sumBy(zeilen, (k) => k === "zuschlag_frei");
  const summeSachbezugFrei = sumBy(zeilen, (k) => k === "sachbezug_frei");
  const summeMahlzeitenPaust = sumBy(zeilen, (k) => k === "mahlzeiten_paust");
  const summeAushilfePaust = sumBy(zeilen, (k) => k === "aushilfe_paust");

  const stSvBruttoCent =
    gesamtbruttoCent -
    summeZuschlagFrei -
    summeSachbezugFrei -
    summeMahlzeitenPaust -
    summeAushilfePaust;

  // --- Schritt C: Lohnsteuer / Soli / KiSt ---
  let lstCent = 0;
  let soliCent = 0;
  let kistCent = 0;

  // --- Schritt D: SV ---
  let sv: SvErgebnis;

  if (person.beschaeftigung === "minijob") {
    // Minijob: LSt(AN) = 0 (Arbeitgeber pauschal), nur RV-Eigenanteil.
    sv = svBeitraegeMinijob({ aushilfeZeitlohnCent: summeAushilfePaust });
  } else {
    const papErgebnis = lohnsteuer2026({
      stkl: person.steuerklasse,
      lzz: LZZ_MONAT,
      re4Cent: stSvBruttoCent,
      zkf: person.zkf,
      kvzProzent: person.kvzProzent,
      kirchensteuer: person.kirchensteuerBayern,
      pvz: person.pvKinderlosZuschlag,
      pva: clampPva(person.kinderzahl, person.elterneigenschaft),
      freibetragCent: person.lstFreibetragMonatCent,
    });
    lstCent = papErgebnis.lstlzzCent;
    soliCent = papErgebnis.solzlzzCent;
    if (person.kirchensteuerBayern) {
      kistCent = roundCent((papErgebnis.bkCent * KIRCHENSTEUER_BAYERN_PROZENT) / 100);
    }
    sv = svBeitraege({ stSvBruttoCent, person });
  }

  // --- Schritt E: Gesamtnetto ---
  const gesamtnettoCent =
    gesamtbruttoCent -
    lstCent -
    soliCent -
    kistCent -
    sv.kvCent -
    sv.rvCent -
    sv.avCent -
    sv.pvCent;

  // --- Schritt F: Auszahlung ---
  const summeAbzug = sumBy(zeilen, (k) => k === "abzug");
  const auszahlungCent = gesamtnettoCent - summeSachbezugFrei - summeMahlzeitenPaust - summeAbzug;

  return {
    gesamtbruttoCent,
    stSvBruttoCent,
    lstCent,
    soliCent,
    kistCent,
    kvCent: sv.kvCent,
    rvCent: sv.rvCent,
    avCent: sv.avCent,
    pvCent: sv.pvCent,
    gesamtnettoCent,
    auszahlungCent,
  };
}

function clampPva(kinderzahl: number, elterneigenschaft: boolean): 0 | 1 | 2 | 3 | 4 {
  if (!elterneigenschaft || kinderzahl < 2) return 0;
  const v = Math.min(kinderzahl, 5) - 1;
  return v as 0 | 1 | 2 | 3 | 4;
}
