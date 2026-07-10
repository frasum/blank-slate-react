// Reine Helfer für den BK1-Import — testbar ohne DB.
//
// - extractSingleIban: sichert zu, dass eine CSV genau eine IBAN enthält.
//   Mehrere IBANs im gleichen File sind ein harter Fehler (die CSV gehört
//   dann nicht zu einem einzelnen Konto).
// - chunk: teilt große Arrays in Blöcke (für PostgREST-`in()`-Listen, die
//   sonst zu lange URLs erzeugen würden).

export function extractSingleIban(
  rows: ReadonlyArray<{ iban: string }>,
): { ok: true; iban: string } | { ok: false; ibans: string[] } {
  const set = new Set<string>();
  for (const r of rows) {
    const iban = r.iban.replace(/\s+/g, "");
    if (iban) set.add(iban);
  }
  const ibans = [...set];
  if (ibans.length === 1) return { ok: true, iban: ibans[0] };
  return { ok: false, ibans };
}

export function chunk<T>(arr: readonly T[], size: number): T[][] {
  if (size <= 0) throw new Error("chunk size must be > 0");
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}
