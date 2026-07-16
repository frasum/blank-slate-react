// WP1 — Reine Zustands-Logik des Wochenplan-Inline-Editors.
//
// Der Editor kennt genau zwei Trigger, die eine Entscheidung erzwingen:
//   * Blur (Fokus verlässt die Zelle)
//   * Enter (bewusstes Committen)
//
// Vor WP1 war die leere Zelle mit "15:00"/"23:00" vorbefüllt, ein reines
// Wegklicken hat also unabsichtlich eine echte Schicht erzeugt. Ab WP1
// startet der Edit-State mit leeren Strings; die Uhrzeiten stehen nur noch
// als placeholder-Attribut im Input. Diese Datei ist die Wahrheitsquelle
// dafür, welche Aktion aus einem Zustand folgt — die UI ruft nur noch aus.

export type EditSnapshot = {
  from: string;
  to: string;
  existingId: string | null;
  origFrom: string;
  origTo: string;
};

export type EditorAction =
  | { kind: "close" } // stiller Editor-Schluss, kein Toast, kein Create
  | { kind: "noop" } // bestehender Eintrag unverändert
  | { kind: "create"; from: string; to: string }
  | { kind: "update"; id: string; from: string; to: string }
  | { kind: "delete"; id: string } // beide Felder leer bei existingId → Löschen
  | { kind: "error" };

const HHMM = /^([01]\d|2[0-3]):[0-5]\d$/;

export function parseHHMM(raw: string): string | null {
  const s = raw.trim().replace(/[.\-\s]/g, ":");
  let h: string;
  let m: string;
  if (s.includes(":")) {
    const [hp, mp = ""] = s.split(":");
    if (!/^\d{1,2}$/.test(hp) || !/^\d{1,2}$/.test(mp)) return null;
    h = hp.padStart(2, "0");
    m = mp.padStart(2, "0");
  } else {
    if (!/^\d+$/.test(s)) return null;
    if (s.length <= 2) {
      h = s.padStart(2, "0");
      m = "00";
    } else if (s.length === 3) {
      h = s.slice(0, 1).padStart(2, "0");
      m = s.slice(1);
    } else if (s.length === 4) {
      h = s.slice(0, 2);
      m = s.slice(2);
    } else {
      return null;
    }
  }
  const out = `${h}:${m}`;
  return HHMM.test(out) ? out : null;
}

export function resolveEditorAction(e: EditSnapshot): EditorAction {
  const bothEmpty = e.from.trim() === "" && e.to.trim() === "";
  if (bothEmpty) {
    // Neue Zelle ohne Eingabe → stiller Schluss. KEIN Phantom-Create.
    if (!e.existingId) return { kind: "close" };
    // Bestehender Eintrag mit beiden Feldern geleert → Lösch-Pfad.
    return { kind: "delete", id: e.existingId };
  }
  const from = parseHHMM(e.from);
  const to = parseHHMM(e.to);
  if (!from || !to) return { kind: "error" };
  if (e.existingId) {
    if (from === e.origFrom && to === e.origTo) return { kind: "noop" };
    return { kind: "update", id: e.existingId, from, to };
  }
  return { kind: "create", from, to };
}
