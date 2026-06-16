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
  erwartet: LohnErgebnis;
};

const faelle = (fixtures as { faelle: Fall[] }).faelle;

describe("Golden Master: berechneLohn (edlohn)", () => {
  it("Fixture enthält die erwarteten 3 Fälle", () => {
    expect(faelle.length).toBe(3);
  });

  for (const fall of faelle) {
    it(`reproduziert "${fall.name}" cent-genau`, () => {
      const ist = berechneLohn(fall.eingabe);
      expect(ist).toEqual(fall.erwartet);
    });
  }
});
