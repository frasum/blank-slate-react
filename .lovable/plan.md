## Problem

Beim Öffnen von `/auth` erscheint kurz die Root-Fehlerseite („Erneut versuchen"), dann ein Weißblitz, dann erst das Login-Formular.

## Ursache

`/auth` läuft mit `ssr: false`. Der Server rendert deshalb nur die Suspense-Hülle, der Client mountet direkt `<main>` (AuthPage). React meldet Hydration-Mismatch (siehe Runtime-Error: `<Suspense>` server vs. `<main>` client), der Fehler schlägt bis in den Root-`errorComponent` durch → sichtbarer „Erneut versuchen"-Flash. Danach regeneriert React den Baum → Weißblitz → dann das Login.

Zusätzlich Konsolen-Warnung `Invalid DOM property 'fetchpriority'` aus `head().links` (falscher Casing) — schreibt im SSR-HTML `fetchpriority=""`, verstärkt den Attributunterschied.

## Umsetzung (nur `src/routes/auth.tsx`)

1. `fetchpriority: "high"` → `fetchPriority: "high"` im `head().links`.
2. `AuthPage` in einen Client-Only-Wrapper packen: erste Render-Runde gibt dieselbe leere `<main>`-Hülle zurück wie SSR (mit denselben Klassen), nach `useEffect` mountet der eigentliche Inhalt. Damit ist die Server-HTML deckungsgleich mit der ersten Client-Hydrierung → kein Mismatch, kein Error-Flash, kein Weißblitz.

Keine Änderungen an Login-Logik, Auth-Middleware, Root-Layout, anderen Routen oder Server-Functions.

## Verifikation

- `bun run tsc --noEmit`, `npx eslint .`, `npx prettier --check .`, `npx vitest run` grün.
- Preview `/auth`: keine Hydration-Warnung, kein „Erneut versuchen"-Flash, kein Weißblitz — Login erscheint direkt.
