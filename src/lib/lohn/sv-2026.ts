/**
 * Arbeitnehmer-Anteile zur Sozialversicherung 2026.
 *
 * Reine Funktion: Eingabe = St/SV-Brutto in Cent (+ Personenflags),
 * Ausgabe = KV/RV/AV/PV in Cent (kaufmännisch gerundet).
 *
 * Stufe 1: BBG-Deckelung ist implementiert, aber durch die drei
 * Referenzfälle NICHT belegt — alle Bruttowerte liegen unter den BBG.
 */

import {
  BBG_MONAT_2026_CENT,
  MINIJOB_RV_MINDEST_CENT,
  SV_SAETZE_2026,
  UEBERGANGSBEREICH_2026,
} from "./config-2026";
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

/** AN-beitragspflichtige Einnahme im Übergangsbereich. AE in Cent. */
export function midijobBemessungCent(aeCent: number): number {
  const { UG_CENT, OG_CENT } = UEBERGANGSBEREICH_2026;
  if (aeCent <= UG_CENT || aeCent > OG_CENT) return aeCent;
  return roundCent((OG_CENT / (OG_CENT - UG_CENT)) * (aeCent - UG_CENT));
}

/**
 * Beitragspflichtige Gesamt-Einnahme (BE_G) im Übergangsbereich.
 * Formel: `BE_G = F·G + ((OG − F·G) / (OG − G)) · (AE − G)` für AE in (UG, OG].
 * Außerhalb dieses Bereichs = tatsächliches AE (kein Übergangs-Effekt).
 * Wird für den PV-Kinderlosen-Zuschlag benötigt (den trägt der AN allein
 * auf die Gesamt-BE, nicht auf die reduzierte AN-BE).
 */
export function midijobBemessungGesamtCent(aeCent: number): number {
  const { UG_CENT, OG_CENT, FAKTOR_F } = UEBERGANGSBEREICH_2026;
  if (aeCent <= UG_CENT || aeCent > OG_CENT) return aeCent;
  const fG = FAKTOR_F * UG_CENT;
  return roundCent(fG + ((OG_CENT - fG) / (OG_CENT - UG_CENT)) * (aeCent - UG_CENT));
}

/** Normalfall (kein Minijob). */
export function svBeitraege(e: SvEingabe): SvErgebnis {
  const basisCent = e.person.istMidijob ? midijobBemessungCent(e.stSvBruttoCent) : e.stSvBruttoCent;
  const bemessungKvPv = Math.min(basisCent, BBG_MONAT_2026_CENT.KV_PV);
  const bemessungRvAv = Math.min(basisCent, BBG_MONAT_2026_CENT.RV_AV);

  const kvSatz = SV_SAETZE_2026.KV_AN_PROZENT + e.person.kvzProzent / 2;
  const pvSatz = pvSatzProzent(e.person);

  // PV im Midijob: Grundanteil (1,8 % − Kind-Abschläge) auf BE_AN,
  // Kinderlosen-Zuschlag (0,6 PP) aber auf BE_G (Gesamt) — den trägt der
  // AN allein. EINE Rundung am Ende, sonst 1 Cent Drift gegenüber edlohn.
  let pvCent: number;
  if (e.person.pvFrei) {
    pvCent = 0;
  } else if (e.person.istMidijob && basisCent !== e.stSvBruttoCent) {
    const bemessungGesamt = Math.min(
      midijobBemessungGesamtCent(e.stSvBruttoCent),
      BBG_MONAT_2026_CENT.KV_PV,
    );
    let grundsatz = SV_SAETZE_2026.PV_AN_BASIS_PROZENT;
    if (e.person.elterneigenschaft && e.person.kinderzahl >= 2) {
      const abschlaege = Math.min(e.person.kinderzahl, 5) - 1;
      grundsatz -= abschlaege * SV_SAETZE_2026.PV_KIND_ABSCHLAG_PP;
    }
    const zuschlagPP = e.person.pvKinderlosZuschlag ? SV_SAETZE_2026.PV_KINDERLOS_ZUSCHLAG_PP : 0;
    pvCent = roundCent((bemessungKvPv * grundsatz) / 100 + (bemessungGesamt * zuschlagPP) / 100);
  } else {
    pvCent = roundCent((bemessungKvPv * pvSatz) / 100);
  }

  return {
    kvCent: e.person.kvFrei ? 0 : roundCent((bemessungKvPv * kvSatz) / 100),
    rvCent: e.person.rvFrei ? 0 : roundCent((bemessungRvAv * SV_SAETZE_2026.RV_AN_PROZENT) / 100),
    avCent: e.person.avFrei ? 0 : roundCent((bemessungRvAv * SV_SAETZE_2026.AV_AN_PROZENT) / 100),
    pvCent,
  };
}

/**
 * Minijob: KV/AV/PV = 0; nur RV-Eigenanteil auf den Aushilfe-Zeitlohn.
 *
 * Mindestbemessungsgrundlage 175 €/Monat (§163 Abs. 8 SGB VI): der Gesamt-
 * beitrag (18,6 %) wird auf `max(AE, 175 €)` berechnet, die AG-Pauschale
 * (15 %) bleibt auf dem tatsächlichen AE — der AN trägt die Differenz.
 *
 * Ausnahme: `aushilfeZeitlohnCent === 0` → keine Aushilfe-Zeile → rvCent 0
 * (nicht auf 175 € hochziehen).
 */
export function svBeitraegeMinijob(e: MinijobEingabe): SvErgebnis {
  if (e.aushilfeZeitlohnCent <= 0) {
    return { kvCent: 0, rvCent: 0, avCent: 0, pvCent: 0 };
  }
  const bemessungRvCent = Math.max(e.aushilfeZeitlohnCent, MINIJOB_RV_MINDEST_CENT);
  return {
    kvCent: 0,
    // AN-RV im Minijob = Gesamt(18,6 %) − AG-Pauschale(15 %), jeweils
    // cent-gerundet (standard-SV-Mechanik), nicht direkt 3,6 % — sonst 1 Cent Abweichung.
    rvCent:
      roundCent((bemessungRvCent * SV_SAETZE_2026.RV_GESAMT_PROZENT) / 100) -
      roundCent((e.aushilfeZeitlohnCent * SV_SAETZE_2026.MINIJOB_AG_PAUSCHAL_RV_PROZENT) / 100),
    avCent: 0,
    pvCent: 0,
  };
}
