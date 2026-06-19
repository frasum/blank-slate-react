Vier interne Verbesserungen ohne sichtbare Verhaltensänderung.

## 1) `src/lib/format.ts` — nur `fmtCents`, `parseIso`, `todayIso` (+ Tests)

Neue Datei mit genau diesen drei Exports, wörtlich aus der bestehenden identischen Variante:

```ts
export function fmtCents(c: number | null | undefined): string {
  const v = (c ?? 0) / 100;
  return v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
export function parseIso(iso: string): Date {
  return new Date(`${iso}T12:00:00Z`);
}
export function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}
```

Lokale Definitionen nur nach Byte-Diff ersetzen:
- `src/routes/_authenticated/admin/kasse.tsx` → `fmtCents`, `todayIso`
- `src/routes/_authenticated/admin/zeit-uebersicht.tsx` → `todayIso`
- `src/routes/_authenticated/admin/dienstplan.tsx` → `parseIso`, `todayIso`
- `src/components/roster/RosterGrid.tsx` → `parseIso`

**Nicht zentralisiert** (divergente Logik/Signatur — stille Verhaltensänderung wäre die Folge): `parseEuroToCents` (4 Varianten), `fmtTime` (ISO vs `HH:mm:ss`), `formatDuration` (`(startIso,endIso)` vs `(ms)`), `daysBetween` (nur 1 Definition).

Tests `src/lib/format.test.ts`:
- `fmtCents`: `0→"0,00"`, `12345→"123,45"`, `123456→"1.234,56"`, `null→"0,00"`.
- `parseIso("2026-03-15")`: `getUTCHours()===12`, Y/M/D korrekt.
- `todayIso`: Länge 10, Regex `^\d{4}-\d{2}-\d{2}$`.

## 2) `src/routes/__root.tsx` — DE-Lokalisierung
- `<html lang="en">` → `<html lang="de">`.
- „Page not found" → „Seite nicht gefunden".
- „Go home" → „Zur Startseite" (beide Vorkommen).
- „This page didn't load" → „Diese Seite konnte nicht geladen werden".
- „Try again" → „Erneut versuchen".
- Begleittexte unverändert.

## 3) Skeleton-Loader
Neue Datei `src/components/ui/page-skeletons.tsx` (nutzt bestehendes `Skeleton`) mit `KassePageSkeleton` (~5-Zeilen-Tabelle), `ZeitSkeleton` (Tabellen-Skelett), `DienstplanSkeleton` (Grid). Einsatz ausschließlich in `kasse.tsx`, `zeit-uebersicht.tsx`, `dienstplan.tsx` an den „Lade…"-Stellen. Andere „Lade…"-Vorkommen unverändert.

## 4) Identity-Roundtrip via `ensureQueryData` (+ 3 Invalidate-Guards)

In `src/routes/_authenticated/route.tsx` und `src/routes/_authenticated/admin/route.tsx` `beforeLoad` umstellen:

```ts
const identity = await context.queryClient.ensureQueryData({
  queryKey: ["identity", data.session.user.id ?? null],
  queryFn: () => getMyIdentity(),
});
```

Key exakt wie AuthContext (`["identity", session?.user.id ?? null]`). Redirect-Checks (`mustChangePassword`, role-Gate, payroll-Redirect) Zeichen-für-Zeichen unverändert.

**Cache-Guards gegen Redirect-Loop / Race** — Reihenfolge zwingend `await invalidateQueries` VOR `router.invalidate()`/`navigate`. Begründung: `ensureQueryData` (react-query v5, `revalidateIfStale` default `false`) liefert sonst stale Daten ohne auf Refetch zu warten. Der aktive AuthContext-`identityQuery` (`enabled: !!session`) sorgt dafür, dass `invalidateQueries` (default `refetchType: 'active'`) den Refetch in-place abwartet — kein Flicker. **Kein `removeQueries`** (würde aktiven Eintrag löschen → `identity: null`-Flicker).

Jeweils `const queryClient = useQueryClient();`:
- `passwort-aendern.tsx` Success-Handler:
  ```ts
  await queryClient.invalidateQueries({ queryKey: ["identity"] });
  await router.invalidate();
  ```
- `impersonate.tsx` `handleStart` nach Erfolg, **vor** `router.navigate`: `await queryClient.invalidateQueries({ queryKey: ["identity"] });`
- `src/components/impersonation-banner.tsx` `handleStop` (dort wird `stopImpersonation` aufgerufen — nicht in `impersonate.tsx`), **vor** `router.navigate`: dito.

## Nicht anfassen
DB, Server-Function-Signaturen, Sicherheitsmodell. `parseEuroToCents`/`fmtTime`/`formatDuration`/`daysBetween`. `kasse-saldo.tsx`, `stempeln.tsx`. „Lade…" außerhalb von kasse/zeit-uebersicht/dienstplan.

## Vor Commit & Erfolgs-Gate
`prettier --write` + `eslint --fix` über geänderte Dateien. `tsc --noEmit`, `eslint .`, `vitest run` grün, `format.test.ts` grün. Network-Tab: nur ein `getMyIdentity`-Call pro Session bei Admin-Navigation. Nach Passwortwechsel kein Redirect-Loop.

## Geänderte / neue Dateien
- **neu** `src/lib/format.ts`, `src/lib/format.test.ts`, `src/components/ui/page-skeletons.tsx`
- `src/routes/__root.tsx`
- `src/routes/_authenticated/route.tsx`, `src/routes/_authenticated/admin/route.tsx`
- `src/routes/_authenticated/admin/kasse.tsx`, `zeit-uebersicht.tsx`, `dienstplan.tsx`
- `src/components/roster/RosterGrid.tsx`
- `src/routes/_authenticated/passwort-aendern.tsx`
- `src/routes/_authenticated/admin/impersonate.tsx`
- `src/components/impersonation-banner.tsx`
