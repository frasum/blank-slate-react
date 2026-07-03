/**
 * Sätze, Beitragsbemessungsgrenzen und sonstige Konstanten 2026.
 *
 * Einzige Quelle für die Stufe-1-Module (sv-2026.ts, lohn-core.ts).
 * Wird in Stufe 2 ggf. in eine config-Tabelle gezogen — bis dahin reicht
 * diese Datei.
 */

/** Arbeitnehmer-Beitragssätze (Prozent) 2026. */
export const SV_SAETZE_2026 = {
  /** Allgemeiner KV-Satz Arbeitnehmer (ohne Zusatzbeitrag). */
  KV_AN_PROZENT: 7.3,
  /** RV-Anteil Arbeitnehmer (allgemein). */
  RV_AN_PROZENT: 9.3,
  /** AV-Anteil Arbeitnehmer. */
  AV_AN_PROZENT: 1.3,
  /** PV-Basissatz Arbeitnehmer. */
  PV_AN_BASIS_PROZENT: 1.8,
  /** Zuschlag für kinderlose Arbeitnehmer ≥23 Jahre (Prozentpunkte). */
  PV_KINDERLOS_ZUSCHLAG_PP: 0.6,
  /**
   * Beitragsabschlag in der PV je Kind ab dem 2. bis einschl. 5. Kind
   * (Prozentpunkte je Kind).
   */
  PV_KIND_ABSCHLAG_PP: 0.25,
  /**
   * Minijob: Eigenanteil des Arbeitnehmers zur Rentenversicherung (informativ,
   * 18,6 % − 15 % = 3,6 %). NICHT direkt für die Rechnung verwenden — der
   * AN-Anteil wird als Differenz aus Gesamt(18,6 %) und AG-Pauschale(15 %),
   * jeweils cent-gerundet, ermittelt (sonst 1 Cent Abweichung zu edlohn).
   */
  MINIJOB_RV_AN_PROZENT: 3.6,
  /** Voller RV-Gesamtbeitragssatz 2026 (AG+AN), Basis der Minijob-AN-Differenzrechnung. */
  RV_GESAMT_PROZENT: 18.6,
  /** Minijob: pauschaler AG-RV-Beitrag. AN-Anteil = Gesamt(18,6 %) − diese Pauschale. */
  MINIJOB_AG_PAUSCHAL_RV_PROZENT: 15.0,
} as const;

/**
 * Monatliche Beitragsbemessungsgrenzen 2026 in Cent.
 *
 * HINWEIS: Diese Werte werden von den drei edlohn-Referenzfällen
 * (Stand Stufe 1) NICHT berührt — alle Bruttowerte liegen darunter.
 * Die Konstanten sind als Bestandteil der Konfiguration geführt, gelten
 * aber als "noch nicht durch Test belegt", bis in Stufe 2/3 entsprechende
 * Fälle hinzukommen.
 */
export const BBG_MONAT_2026_CENT = {
  /** KV/PV: 5.812,50 € pro Monat. */
  KV_PV: 581_250,
  /** RV/AV: 8.450,00 € pro Monat. */
  RV_AV: 845_000,
} as const;

/** Kirchensteuersatz Bayern. */
export const KIRCHENSTEUER_BAYERN_PROZENT = 8;

/**
 * Übergangsbereich (Midijob) 2026 — Eckwerte als Cent.
 * Untergrenze = Minijob-Grenze 2026 (603 €), Obergrenze = 2000 €.
 */
export const UEBERGANGSBEREICH_2026 = {
  /** Untergrenze = Minijob-Grenze 2026 (603 €) in Cent. */
  UG_CENT: 60300,
  /** Obergrenze 2000 € in Cent. */
  OG_CENT: 200000,
  /**
   * Amtlicher Faktor F 2026 (Übergangsbereich).
   * Quelle: Geringfügigkeits-Richtlinien 2026. Wird für die Berechnung der
   * beitragspflichtigen Gesamt-Einnahme (BE_G) im Midijob-Bereich benötigt —
   * insbesondere für den PV-Kinderlosen-Zuschlag, den der AN allein trägt.
   */
  FAKTOR_F: 0.6603,
} as const;

/**
 * Minijob: Mindestbemessungsgrundlage RV in Cent (§163 Abs. 8 SGB VI).
 * Bei RV-Pflicht im Minijob wird der Gesamtbeitrag auf `max(AE, 175 €)`
 * berechnet; der AG trägt 15 % vom tatsächlichen AE, der AN die Differenz.
 */
export const MINIJOB_RV_MINDEST_CENT = 17500;

/**
 * Standard-Lohnzahlungszeitraum (LZZ) des PAP: 2 = Monat.
 * Stufe 1 rechnet ausschließlich monatsweise.
 */
export const LZZ_MONAT = 2 as const;
