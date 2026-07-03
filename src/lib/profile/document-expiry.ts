// Ampel-Status für Dokumente-Ablauf (SP3, reine Funktion, keine Seiteneffekte).
// `expired`  = valid_until < heute (rot)
// `expiring` = 0 ≤ (valid_until − heute) ≤ 60 Tage (gelb; genau heute = expiring,
//              genau +60 = expiring, +61 = ok)
// `ok`       = valid_until > heute + 60 Tage (grün)
// `none`     = kein Ablaufdatum gepflegt (grau)
//
// Vergleich erfolgt in UTC auf Tagesebene, damit Zeitzone/Uhrzeit nicht in die
// Grenzfall-Entscheidung reinschwappt.

export type DocumentExpiryStatus = "expired" | "expiring" | "ok" | "none";

const MS_PER_DAY = 24 * 60 * 60 * 1000;
const EXPIRING_WINDOW_DAYS = 60;

function toUtcMidnight(d: Date): number {
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate());
}

function parseIsoDate(iso: string): number | null {
  // Erwartet `YYYY-MM-DD` (Postgres `date`). Wir tolerieren auch volle
  // Timestamps und schneiden auf den Datumsteil zurück.
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]) - 1;
  const d = Number(m[3]);
  const t = Date.UTC(y, mo, d);
  return Number.isFinite(t) ? t : null;
}

export function documentExpiryStatus(
  validUntil: string | null | undefined,
  today: Date,
): DocumentExpiryStatus {
  if (validUntil == null || validUntil === "") return "none";
  const ts = parseIsoDate(validUntil);
  if (ts === null) return "none";
  const todayTs = toUtcMidnight(today);
  const diffDays = Math.round((ts - todayTs) / MS_PER_DAY);
  if (diffDays < 0) return "expired";
  if (diffDays <= EXPIRING_WINDOW_DAYS) return "expiring";
  return "ok";
}