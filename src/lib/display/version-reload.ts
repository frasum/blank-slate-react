// DP2 — Reine Entscheidungs-Funktion für den Display-Versions-Handschlag.
// Aufrufer merkt sich die zuletzt gesehene Version und ggf. einen
// Zeitstempel (ms) des letzten Auto-Reloads. Wir entscheiden hier nichts
// über sessionStorage/window — das ist Sache des Aufrufers.
//
// Regeln:
//   - unbekannte oder gleiche Version → kein Reload
//   - neue Version, aber letzter Reload < RELOAD_COOLDOWN_MS her → kein Reload
//   - sonst → Reload

export const RELOAD_COOLDOWN_MS = 5 * 60 * 1000;

export function shouldReload(
  known: string | null,
  incoming: string | null | undefined,
  lastReloadAt: number | null,
  now: number,
): boolean {
  if (!incoming) return false;
  if (!known) return false;
  if (known === incoming) return false;
  if (lastReloadAt != null && now - lastReloadAt < RELOAD_COOLDOWN_MS) return false;
  return true;
}