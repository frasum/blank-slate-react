// Zentrale Sonderfall-Erkennungen für einzelne Mitarbeiter.
//
// Sumitr nutzt ausschließlich die Stempel-Seite. Statt eines „Zurück"-Links
// bekommt er dort einen direkten „Abmelden"-Button. Damit dieselbe Regel
// überall identisch angewandt wird, liegt die Erkennung hier zentral.

import type { Identity } from "@/lib/auth/me.functions";

const SUMITR_NAME_PREFIX = "sumitr";

export function isSumitr(identity: Identity | null | undefined): boolean {
  const name = identity?.displayName?.trim().toLowerCase() ?? "";
  return name.startsWith(SUMITR_NAME_PREFIX);
}