// P2 — E2E-Konfiguration für den Kassen-Finalize.
//
// Bewusst minimal: ein Chromium-Projekt, `baseURL` aus `E2E_BASE_URL`
// (Default `http://localhost:3000`, Vite-Dev-Server dieses Templates).
// Wenn keine URL gesetzt ist, startet Playwright den Dev-Server selbst.
//
// KEIN Zugriff auf Produktion: die Seed-Helper (`e2e/seed.ts`) verweigern
// den Start, sobald `SUPABASE_URL` nicht auf localhost zeigt. Der Config
// selbst reicht das nicht durch — Sicherung liegt im Seed-Layer.

import { defineConfig, devices } from "@playwright/test";

// Der Lovable-Vite-Wrapper (@lovable.dev/vite-tanstack-config) besitzt den
// Dev-Port (8080) inkl. strictPort — CLI-Flags werden überstimmt. Wir richten
// uns nach ihm statt gegen ihn.
const baseURL = process.env.E2E_BASE_URL ?? "http://localhost:8080";
const startDevServer = !process.env.E2E_BASE_URL;

export default defineConfig({
  testDir: "./e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  retries: 0,
  reporter: [["list"]],
  use: {
    baseURL,
    trace: "retain-on-failure",
    screenshot: "only-on-failure",
    video: "off",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: startDevServer
    ? {
        command: "bun run dev",
        url: baseURL,
        reuseExistingServer: true,
        timeout: 120_000,
      }
    : undefined,
});
