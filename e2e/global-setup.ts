// Schutzriegel seit ENV2: Der Supabase-Client fällt bei fehlender Env auf
// PRODUKTIONS-Werte zurück (src/integrations/supabase/client.ts,
// Publishable-Fallback). E2E schreibt (Kassen-Finalize!) und darf deshalb
// ausschließlich gegen den lokalen Supabase-Stack laufen — lieber roter
// Lauf als ein Test-Finalize in der echten Kasse.

export default async function globalSetup(): Promise<void> {
  const url = process.env.VITE_SUPABASE_URL ?? "";
  const isLocal =
    url.startsWith("http://127.0.0.1") || url.startsWith("http://localhost");
  if (!isLocal) {
    throw new Error(
      `E2E-Schutzriegel: VITE_SUPABASE_URL="${url || "<leer>"}" ist keine lokale URL. ` +
        `Erlaubt sind ausschließlich http://127.0.0.1... oder http://localhost... ` +
        `Ohne lokale Env würde der Client-Fallback (ENV2) gegen die Produktions-DB schreiben.`,
    );
  }
  // Positiv-Beleg im CI-Log — Voraussetzung des Erfolgs-Gates.
  console.log(`E2E gegen ${url} — ok`);
}