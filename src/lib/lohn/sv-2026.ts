/**
 * Arbeitnehmer-Anteile zur Sozialversicherung 2026.
 *
 * Reine Funktion: Eingabe = St/SV-Brutto in Cent (+ Personenflags),
 * Ausgabe = KV/RV/AV/PV in Cent (kaufmännisch gerundet).
 *
 * Stufe 1: BBG-Deckelung ist implementiert, aber durch die drei
 * Referenzfälle NICHT belegt — alle Bruttowerte liegen unter den BBG.
 */

import { BBG_MONAT_2026_CENT, SV_SAETZE_2026 } from "./config-2026";
import type { PersonenParameter } from "./types";

export interface SvErgebnis {
  kvCent: number;
  rvCent: number;
  avCent: number;
  pvCent: number;
}

/** Eingabe für die Normalfall-SV-Berechnung. */
export interface SvEingabe {
  stSvBruttoCent: number;
  person: PersonenParameter;
}

/** Eingabe für den Minijob (nur RV-Eigenanteil auf Aushilfe-Zeitlohn). */
export interface MinijobEingabe {
  aushilfeZeitlohnCent: number;
}

/** Kaufmännische Cent-Rundung (Half-Away-From-Zero). */
function roundCent(centValue: number): number {
  return Math.sign(centValue) * Math.round(Math.abs(centValue));
}

/**
 * Berechne den effektiven PV-Satz (Prozent) für eine Person.
 * - Basis: 1,80 %
 * - +0,60 PP wenn kinderlos & ≥23
 * - −0,25 PP je Kind ab dem 2. bis einschl. 5. Kind, nur bei Elterneigenschaft
 */
export function pvSatzProzent(person: PersonenParameter): number {
  let satz = SV_SAETZE_2026.PV_AN_BASIS_PROZENT;
  if (person.pvKinderlosZuschlag) {
    satz += SV_SAETZE_2026.PV_KINDERLOS_ZUSCHLAG_PP;
  }
  if (person.elterneigenschaft && person.kinderzahl >= 2) {
    const abschlaegeKinder = Math.min(person.kinderzahl, 5) - 1; // ab 2. bis 5.
    satz -= abschlaegeKinder * SV_SAETZE_2026.PV_KIND_ABSCHLAG_PP;
  }
  return satz;
}

/** Normalfall (kein Minijob). */
export function svBeitraege(e: SvEingabe): SvErgebnis {
  const bemessungKvPv = Math.min(e.stSvBruttoCent, BBG_MONAT_2026_CENT.KV_PV);
  const bemessungRvAv = Math.min(e.stSvBruttoCent, BBG_MONAT_2026_CENT.RV_AV);

  const kvSatz =
    SV_SAETZE_2026.KV_AN_PROZENT + e.person.kvzProzent / 2;
  const pvSatz = pvSatzProzent(e.person);

  return {
    kvCent: roundCent((bemessungKvPv * kvSatz) / 100),
    rvCent: roundCent((bemessungRvAv * SV_SAETZE_2026.RV_AN_PROZENT) / 100),
    avCent: roundCent((bemessungRvAv * SV_SAETZE_2026.AV_AN_PROZENT) / 100),
    pvCent: roundCent((bemessungKvPv * pvSatz) / 100),
  };
}

/** Minijob: KV/AV/PV = 0; nur RV-Eigenanteil auf den Aushilfe-Zeitlohn. */
export function svBeitraegeMinijob(e: MinijobEingabe): SvErgebnis {
  return {
    kvCent: 0,
    rvCent: roundCent(
      (e.aushilfeZeitlohnCent * SV_SAETZE_2026.MINIJOB_RV_AN_PROZENT) / 100,
    ),
    avCent: 0,
    pvCent: 0,
  };
}