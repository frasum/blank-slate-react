/**
 * Mapping `staff_personal_details` → `PersonenParameter` (Stufe 1).
 *
 * Reine Funktion, ohne DB-Zugriff. `asOf` ist das Periodenende (toDate)
 * und dient ausschließlich der Altersberechnung für den PV-Zuschlag.
 */

import type { Beschaeftigungsart, PersonenParameter, Steuerklasse } from "./types";

const ROMAN_TO_STKL: Record<string, Steuerklasse> = {
  I: 1,
  II: 2,
  III: 3,
  IV: 4,
  V: 5,
  VI: 6,
};

export interface StaffDetailsForLohn {
  tax_class: string | null;
  child_tax_allowances: number | null;
  kk_zusatzbeitrag: number | null;
  church_tax_liable: boolean | null;
  children_count: number | null;
  has_parent_status: boolean | null;
  is_minijob: boolean | null;
  date_of_birth: string | null;
  rv_frei?: boolean | null;
  av_frei?: boolean | null;
  lst_freibetrag_monat_cent?: number | null;
  is_midijob?: boolean | null;
  kv_frei?: boolean | null;
  pv_frei?: boolean | null;
  is_pkv?: boolean | null;
  pkv_basis_beitrag_monat_cent?: number | null;
  ist_werkstudent?: boolean | null;
}

function alterAm(dob: string | null, asOf: string): number | null {
  if (!dob) return null;
  const b = new Date(`${dob}T00:00:00Z`);
  const a = new Date(`${asOf}T00:00:00Z`);
  if (Number.isNaN(b.getTime()) || Number.isNaN(a.getTime())) return null;
  let age = a.getUTCFullYear() - b.getUTCFullYear();
  const m = a.getUTCMonth() - b.getUTCMonth();
  if (m < 0 || (m === 0 && a.getUTCDate() < b.getUTCDate())) age--;
  return age;
}

/**
 * `asOf` = Periodenende (z. B. `"2026-01-31"`).
 * Wirft, wenn die Steuerklasse fehlt — ohne sie ist keine Lohnsteuerberechnung möglich.
 */
export function staffDetailsToPerson(d: StaffDetailsForLohn, asOf: string): PersonenParameter {
  const stkl = d.tax_class ? ROMAN_TO_STKL[d.tax_class] : undefined;
  if (!stkl) throw new Error("Steuerklasse fehlt in den Stammdaten.");

  const kinderzahl = d.children_count ?? 0;
  const age = alterAm(d.date_of_birth, asOf);

  return {
    steuerklasse: stkl,
    zkf: Number(d.child_tax_allowances ?? 0),
    kvzProzent: Number(d.kk_zusatzbeitrag ?? 0),
    kirchensteuerBayern: !!d.church_tax_liable,
    kinderzahl,
    elterneigenschaft: !!d.has_parent_status,
    // PV-Kinderlosen-Zuschlag: keine Kinder UND >=23. Alter unbekannt -> vorsichtshalber
    // Zuschlag setzen, damit nicht versehentlich zu wenig PV abgezogen wird.
    pvKinderlosZuschlag: kinderzahl === 0 && (age === null ? true : age >= 23),
    beschaeftigung: (d.is_minijob ? "minijob" : "normal") as Beschaeftigungsart,
    rvFrei: !!d.rv_frei,
    avFrei: !!d.av_frei,
    lstFreibetragMonatCent: Number(d.lst_freibetrag_monat_cent ?? 0),
    istMidijob: !!d.is_midijob,
    kvFrei: !!d.kv_frei,
    pvFrei: !!d.pv_frei,
    istPkv: !!d.is_pkv,
    pkvBasisBeitragMonatCent: Number(d.pkv_basis_beitrag_monat_cent ?? 0),
    istWerkstudent: !!d.ist_werkstudent,
  };
}
