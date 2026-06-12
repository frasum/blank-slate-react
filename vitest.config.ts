import { defineConfig } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";

// DB-Integrationstests (`*.db.test.ts`) laufen NUR, wenn ein lokaler
// Supabase-Stack über die CLI hochgezogen ist und `SUPABASE_DB_TESTS=1`
// gesetzt wurde (siehe .github/workflows/ci.yml, Job `db-integration`).
// Lokal/in Lovable werden sie ausgeschlossen, damit `bun run vitest run`
// ohne lokale DB grün bleibt.
const includeDbTests = process.env.SUPABASE_DB_TESTS === "1";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    exclude: includeDbTests
      ? ["node_modules/**", "dist/**"]
      : ["node_modules/**", "dist/**", "src/**/*.db.test.ts"],
    testTimeout: includeDbTests ? 30_000 : 5_000,
  },
});
