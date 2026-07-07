// KI1 — Datenschutz-Schicht. Ersetzt Personennamen (Anzeige-, Vor- und
// Nachname) deterministisch durch `MA-<n>`-Platzhalter, bevor Text an das
// Sprachmodell geht; kehrt die Ersetzung in der finalen Modell-Antwort um.
//
// Reines Modul — keine DB, kein I/O. Getestet in pseudonym.test.ts.
//
// Regeln:
//   – Match nur an Wortgrenzen (Unicode-Buchstaben inkl. Umlaute), damit
//     „Anna" nicht in „Ananas" ersetzt wird.
//   – Reihenfolge: längste Namen zuerst → „Max Mustermann" wird vor „Max"
//     ersetzt, damit der Nachname nicht als eigener Platzhalter „durchrutscht".
//   – Kollisionsfrei: jede eindeutige Original-Zeichenkette bekommt genau
//     einen Code; unterschiedliche Personen mit gleichem Alias landen
//     zwangsläufig auf denselben MA — akzeptabel, weil das Modell die Person
//     dann ohnehin nicht mehr auseinanderhalten kann und die Rückübersetzung
//     eindeutig bleibt (siehe Test „Kollisionsfreiheit"). Vorsorge dagegen ist
//     Aufgabe der Aufrufer (staff-Liste enthält keine Doppel-Aliases).
//   – Case-insensitiver Match, aber der Original-String (Groß/Kleinschreibung)
//     ist der Map-Schlüssel — so bleibt die Rückübersetzung deterministisch.

export type StaffPseudonymInput = {
  id: string;
  displayName: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type PseudonymMap = {
  /** name (lowercased) → MA-Code */
  forward: Map<string, string>;
  /** MA-Code → Original-Anzeigename (bevorzugt displayName) */
  reverse: Map<string, string>;
  /** Kompilierter Regex für alle Namen (case-insensitiv, Wortgrenzen). */
  pattern: RegExp | null;
};

// Unicode-Word-Boundary — JS `\b` funktioniert für Buchstaben mit Umlauten
// unzuverlässig. Wir verlangen daher, dass links/rechts KEIN Buchstabe steht.
const LETTER_CLASS = "[\\p{L}\\p{M}]";

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Baut die Ersetzungs-Map. Reihenfolge der Namen bestimmt die MA-Nummerierung. */
export function buildPseudonymMap(staff: readonly StaffPseudonymInput[]): PseudonymMap {
  const forward = new Map<string, string>();
  const reverse = new Map<string, string>();
  const rawNames: { original: string; primary: string }[] = [];

  let counter = 0;
  for (const s of staff) {
    const primary = (s.displayName ?? "").trim();
    if (primary.length === 0 && !s.firstName && !s.lastName) continue;
    counter += 1;
    const code = `MA-${counter}`;

    const candidates = new Set<string>();
    if (primary) candidates.add(primary);
    if (s.firstName) candidates.add(s.firstName.trim());
    if (s.lastName) candidates.add(s.lastName.trim());
    // Auch die einzelnen Bestandteile des Anzeigenamens aufnehmen — sonst
    // rutscht z. B. „Bäng" in „Bäng Müller" durch, wenn das Modell nur den
    // Vornamen erwähnt.
    for (const part of primary.split(/\s+/).filter(Boolean)) candidates.add(part);

    let anyMapped = false;
    for (const name of candidates) {
      const key = name.toLocaleLowerCase("de");
      if (key.length < 2) continue; // 1-Buchstaben-Aliases nicht ersetzen
      if (!forward.has(key)) {
        forward.set(key, code);
        anyMapped = true;
        rawNames.push({ original: name, primary });
      }
    }
    if (anyMapped) reverse.set(code, primary || (s.firstName ?? s.lastName ?? code));
  }

  // Regex: längste Alternativen zuerst.
  const alternatives = [...new Set(rawNames.map((r) => r.original))]
    .sort((a, b) => b.length - a.length)
    .map(escapeRegex);

  const pattern =
    alternatives.length === 0
      ? null
      : new RegExp(
          `(?<!${LETTER_CLASS})(${alternatives.join("|")})(?!${LETTER_CLASS})`,
          "giu",
        );

  return { forward, reverse, pattern };
}

/** Ersetzt in `text` alle bekannten Namen durch ihren MA-Code. */
export function pseudonymize(text: string, map: PseudonymMap): string {
  if (!map.pattern) return text;
  return text.replace(map.pattern, (match) => {
    const code = map.forward.get(match.toLocaleLowerCase("de"));
    return code ?? match;
  });
}

/** Kehrt MA-Codes im Text zurück zu Anzeigenamen. */
export function depseudonymize(text: string, map: PseudonymMap): string {
  if (map.reverse.size === 0) return text;
  // MA-<Zahl>: Codes können mehrstellig werden (MA-10, MA-100).
  return text.replace(/MA-\d+/g, (m) => map.reverse.get(m) ?? m);
}

/** Pseudonymisiert jede String-Value in einem JSON-fähigen Objekt (rekursiv). */
export function pseudonymizeDeep<T>(value: T, map: PseudonymMap): T {
  if (!map.pattern) return value;
  if (typeof value === "string") return pseudonymize(value, map) as T;
  if (Array.isArray(value)) return value.map((v) => pseudonymizeDeep(v, map)) as T;
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = pseudonymizeDeep(v, map);
    }
    return out as T;
  }
  return value;
}