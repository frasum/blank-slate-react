# Vereinte Gastronomie-Betriebsplattform

Neubau einer einzigen Anwendung, die die vier Bestandsprojekte
(`bunker-shift-flow`, `thaitime`, `tagesabrechnung`, `bestellung`) ablöst.

Stack: TanStack Start (React 19, Vite 7), Bun, Supabase, TypeScript strict.

## Status

Phase **B0 von B0–B7** — Fundament: TS-Strict, Lint, Test-Setup, CI,
erste Mandanten-Tabellen, Geschäftstag-Funktion, RLS-Inventur-Skript.

## Bauplan & Designentscheidungen

Maßgeblich ist [`docs/gruendungsdokument.md`](docs/gruendungsdokument.md).
Jede Abweichung von dort wird zuerst diskutiert, dann gebaut.

## Entwicklung

```bash
bun install
bun run dev        # Vite/TanStack-Dev-Server
bun run test       # Vitest
bun run lint       # ESLint
bun run tsc --noEmit
```

## RLS-Inventur

`scripts/check-rls-inventory.sql` listet öffentliche und bedingungslose
Policies. Wird in CI gegen die Migrationen geprüft.
