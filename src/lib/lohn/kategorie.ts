/**
 * Gemeinsam nutzbare Kategorien-Helfer für die Lohn-Kern-Module.
 * Reine Funktion, keine Abhängigkeiten — bewusst nicht in `lohn-rechner.functions.ts`
 * (Server-Modul), damit Client-Code und Server-Code sie zirkelfrei importieren können.
 */

import type { Beschaeftigungsart } from "./types";

/**
 * Liefert die Kategorie für die Zeitlohn-Zeile abhängig von der
 * Beschäftigungsart. Minijobber müssen als `aushilfe_paust` gebucht werden,
 * damit `svBeitraegeMinijob` den RV-Eigenanteil korrekt aufstockt.
 */
export function zeitlohnKategorie(b: Beschaeftigungsart): "aushilfe_paust" | "zeitlohn" {
  return b === "minijob" ? "aushilfe_paust" : "zeitlohn";
}
