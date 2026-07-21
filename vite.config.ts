// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// DP2 — Build-stabile App-Version für den Display-Versions-Handschlag.
// Bevorzugt VITE_APP_VERSION (z. B. Commit-SHA im CI), sonst Build-Zeitstempel.
// KEIN Laufzeit-Zufallswert — die Konstante muss über alle Requests desselben
// Builds identisch bleiben.
const APP_VERSION =
  process.env.VITE_APP_VERSION ??
  process.env.COMMIT_SHA ??
  process.env.CF_PAGES_COMMIT_SHA ??
  `build-${Date.now().toString(36)}`;

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    define: {
      __APP_VERSION__: JSON.stringify(APP_VERSION),
    },
  },
});
