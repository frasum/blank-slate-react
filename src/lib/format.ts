// Zentrale, byte-identische Format-Helfer. Nur Funktionen aufnehmen, die in
// allen Aufrufstellen exakt gleich implementiert sind — divergente Varianten
// (z.B. parseEuroToCents, fmtTime) bleiben bewusst lokal.

export function fmtCents(c: number | null | undefined): string {
  const v = (c ?? 0) / 100;
  return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function parseIso(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}

export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
