// Build-Check: stellt sicher, dass das service-role-Modul und der Service-
// Role-Key NIE im Client-Bundle landen können.
//
// Strategie: statische Quellanalyse — keine import-Aufrufe innerhalb der
// Tests, sondern grep über src/.
//   1. client.server darf nur in *.server.ts-Dateien statisch importiert
//      werden. Dynamische Imports (await import(...)) sind erlaubt, weil
//      sie nur in den Handler-Bodies von Server-Functions stehen.
//   2. SUPABASE_SERVICE_ROLE_KEY darf nur in *.server.ts-Dateien auftauchen.
//   3. Ein VITE_-prefixter Service-Role-Key ist nirgendwo erlaubt.

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";

const ROOT = "src";

function walk(dir: string): string[] {
  const entries = readdirSync(dir);
  return entries.flatMap((entry) => {
    const p = join(dir, entry);
    if (statSync(p).isDirectory()) return walk(p);
    return /\.(ts|tsx)$/.test(p) ? [p] : [];
  });
}

// Testdateien (inkl. Test-Helper unter src/test/) werden nicht ins Client-
// Bundle gepackt → ausschließen.
const ALL_FILES = walk(ROOT).filter(
  (f) =>
    !/\.test\.tsx?$/.test(f) && !f.startsWith(`${ROOT}/test/`) && !f.startsWith(`${ROOT}\\test\\`),
);
const NON_SERVER_FILES = ALL_FILES.filter((f) => !/\.server\.tsx?$/.test(f));

const STATIC_CLIENT_SERVER_IMPORT =
  /^[ \t]*import[\s\S]*?from\s+["']@\/integrations\/supabase\/client\.server["']/m;

describe("Client/Server-Grenze für service-role", () => {
  it("client.server wird nur in *.server.ts-Dateien statisch importiert", () => {
    const offenders = NON_SERVER_FILES.filter((f) =>
      STATIC_CLIENT_SERVER_IMPORT.test(readFileSync(f, "utf8")),
    );
    expect(
      offenders,
      `Statischer client.server-Import außerhalb *.server.ts: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("SUPABASE_SERVICE_ROLE_KEY taucht nur in *.server.ts-Dateien auf", () => {
    const offenders = NON_SERVER_FILES.filter((f) =>
      readFileSync(f, "utf8").includes("SUPABASE_SERVICE_ROLE_KEY"),
    );
    expect(
      offenders,
      `Service-Role-Key-Referenz außerhalb *.server.ts: ${offenders.join(", ")}`,
    ).toEqual([]);
  });

  it("kein VITE_-prefixter Service-Role-Key irgendwo im Code", () => {
    const offenders = ALL_FILES.filter((f) =>
      /VITE_[A-Z_]*SERVICE_ROLE/.test(readFileSync(f, "utf8")),
    );
    expect(offenders, `VITE_-prefixter Service-Role-Key gefunden: ${offenders.join(", ")}`).toEqual(
      [],
    );
  });
});
