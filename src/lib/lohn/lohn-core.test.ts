/**
 * Golden-Master-Test — End-to-End gegen die drei edlohn-Referenzfälle.
 *
 * Strikte Gleichheit (toBe / Toleranz 0). Wenn ein Feld abweicht,
 * MUSS der Test fehlschlagen — Konstanten nicht "passend drehen".
 */

import { describe, expect, it } from "vitest";
import fixtures from "./golden-master/edlohn-faelle.json";
import { berechneLohn } from "./lohn-core";
import type { LohnEingabe, LohnErgebnis } from "./types";

type Fall = {
  name: string;
  eingabe: LohnEingabe;
  erwartet?: Partial<LohnErgebnis>;
  erwartet_teilweise?: Partial<LohnErgebnis>;
};

const faelle = (fixtures as unknown as { faelle: Fall[] }).faelle;

describe("Golden Master: berechneLohn (edlohn)", () => {
  it("Fixture enthält 8 edlohn-Referenzfälle (Fälle 1–3 unverändert, 4–8 Stufe 3a)", () => {
    expect(faelle.length).toBe(8);
  });

  // Standard-Loop: Vollassertion per subset-Match (toMatchObject), damit
  // additive Ergebnis-Felder wie `stBruttoAusweisCent` bestehende Fälle
  // nicht brechen. Fall 7 hat nur ein Teilassert (KV-Rundung offen, s. §40).
  for (const fall of faelle) {
    if (fall.erwartet) {
      it(`reproduziert "${fall.name}" cent-genau`, () => {
        const ist = berechneLohn(fall.eingabe);
        expect(ist).toMatchObject(fall.erwartet as Partial<LohnErgebnis>);
      });
    }
  }

  // Teilassert-Fälle (bekannte Modell-Grenze, s. Doku §40 – z. B. edlohn-KV-
  // Rundung Fall 7 oder Selbstzahler-KV/PV-Beitrag Fall 4).
  for (const fall of faelle) {
    if (fall.erwartet_teilweise) {
      it(`Teilassert: "${fall.name}"`, () => {
        const ist = berechneLohn(fall.eingabe);
        expect(ist).toMatchObject(fall.erwartet_teilweise as Partial<LohnErgebnis>);
      });
    }
  }
});
