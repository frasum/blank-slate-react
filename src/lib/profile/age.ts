// Reines Alters-Helferchen. Kein DB, kein React — testbar.
// Liefert das Alter in vollen Jahren nach Kalender (Geburtstag im
// laufenden Jahr berücksichtigt), null bei fehlendem/ungültigem
// oder in der Zukunft liegendem Datum.

export function computeAgeYears(
  birthDate: string | null | undefined,
  today: Date = new Date(),
): number | null {
  if (!birthDate) return null;
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(birthDate.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  // Kalenderplausibilität via Round-Trip.
  const probe = new Date(Date.UTC(y, mo - 1, d));
  if (
    probe.getUTCFullYear() !== y ||
    probe.getUTCMonth() !== mo - 1 ||
    probe.getUTCDate() !== d
  ) {
    return null;
  }
  const ty = today.getFullYear();
  const tm = today.getMonth() + 1;
  const td = today.getDate();
  let age = ty - y;
  if (tm < mo || (tm === mo && td < d)) age -= 1;
  if (age < 0) return null;
  return age;
}