// Generator für Standardpasswörter beim Anlegen/Reset von Mitarbeiter-Konten.
//
// Format: coco-XXXX-XXXX (14 Zeichen), Alphabet ohne verwechselbare Zeichen
// (kein I, l, O, 0, 1). CSPRNG via crypto.getRandomValues — wird NUR im
// UI direkt nach dem Erzeugen einmal angezeigt, nie geloggt, nie in der DB
// gespeichert (siehe Projektregel "Tokens niemals in Logs/Konsole").

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

export function generateStandardPassword(
  randomBytes: (n: number) => Uint8Array = defaultRandomBytes,
): string {
  const bytes = randomBytes(8);
  let s = "";
  for (let i = 0; i < 8; i++) s += ALPHABET[bytes[i] % ALPHABET.length];
  return `coco-${s.slice(0, 4)}-${s.slice(4)}`;
}

function defaultRandomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}
