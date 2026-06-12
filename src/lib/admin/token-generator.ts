// Badge-Token-Generator (B1c).
//
// Vorgabe Gründungsdokument: zufällig (32 Byte), ablaufend, widerrufbar,
// Validierung nur serverseitig, niemals in Logs/Konsole. Hier nur die
// reine Erzeugung — die Speicherung (mit expires_at/used_at) und die
// Sicherstellung, dass der Klartext NUR direkt nach Erstellung an die UI
// geht, übernehmen die aufrufenden Server-Functions.

/** Erzeugt 32 zufällige Bytes (CSPRNG) und kodiert sie als base64url. */
export function generateBadgeToken(randomBytes: (n: number) => Uint8Array = defaultRandomBytes): string {
  const bytes = randomBytes(32);
  return base64UrlEncode(bytes);
}

function defaultRandomBytes(n: number): Uint8Array {
  const out = new Uint8Array(n);
  crypto.getRandomValues(out);
  return out;
}

function base64UrlEncode(bytes: Uint8Array): string {
  let bin = "";
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
  const b64 = btoa(bin);
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}