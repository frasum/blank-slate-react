# Fix: Logout-Schleife auf /auth (Maximum call stack size exceeded)

## Bestätigte Ursache

In `src/contexts/auth-context.tsx` (Zeilen 56–61) navigiert `signOut` **vor** `supabase.auth.signOut()` nach `/auth`:

```ts
await router.navigate({ to: "/auth", replace: true });
await supabase.auth.signOut();
```

Zu diesem Zeitpunkt hält Supabase die Session noch. Die Route `/auth` hat in `src/routes/auth.tsx` einen `beforeLoad`-Guard, der bei aktiver Session hart auf `/` umleitet. `/` liegt unter `_authenticated/route.tsx`, dessen `beforeLoad` wiederum bei fehlender Session auf `/auth` umleitet — sobald direkt danach `supabase.auth.signOut()` ausgeführt wird, feuert `onAuthStateChange` (`SIGNED_OUT`) und der Provider ruft `queryClient.clear()`. Kombination aus laufender Navigation, konkurrierendem State-Wechsel und den beiden gegenläufigen `beforeLoad`-Redirects erzeugt die Redirect-/Invalidierungs-Schleife, die Sentry als `Maximum call stack size exceeded` meldet. Genau dieses Muster steht auch in der Lovable-Stack-Overflow-Notiz zu diesem Repo.

## Minimalfix

Reihenfolge in `src/contexts/auth-context.tsx` zurückdrehen — sonst nichts:

```ts
signOut: async () => {
  await queryClient.cancelQueries();
  queryClient.clear();
  await supabase.auth.signOut();               // 1) Session zuverlässig beenden
  await router.navigate({ to: "/auth", replace: true }); // 2) danach navigieren
},
```

Damit:
- Wenn `/auth` erreicht wird, ist die Session bereits weg → `beforeLoad` lässt die Seite normal rendern, kein Redirect nach `/`.
- `_authenticated`-Guards sehen keine Session mehr und leiten nicht mehr konkurrierend nach `/auth`.
- `onAuthStateChange` (`SIGNED_OUT`) im Provider bleibt unverändert; `queryClient.clear()` wurde bereits vor `signOut()` gemacht, die zusätzliche Cache-Invalidierung im Listener ist harmlos.

Passwort-Login, PIN-Login, `beforeLoad`-Guards, RLS, Rollen, DB, Supabase-Konfig — nichts davon wird angefasst.

## Regressionstest

Kleiner Unit-Test für den Provider-Kontrakt, ohne Router-Umbauten:

- Datei: `src/contexts/auth-context.test.tsx` (neu).
- Rendert `<AuthProvider>` mit gemockten `supabase.auth`, `useRouter`, `useQueryClient`, `getMyIdentity`.
- Ruft `signOut()` und prüft die Aufrufreihenfolge über ein gemeinsames `calls[]`-Array: `supabase.auth.signOut` **vor** `router.navigate`.
- Sichert die Regression („navigate before signOut") gegen Wiedereinführung ab.

Wenn das Mocken der TanStack-Router-/Query-Provider im vorhandenen Setup nicht ohne Zusatz-Infrastruktur klappt, wird der Test übersprungen (Vorgabe: keine größeren Umbauten) und im Bericht ehrlich vermerkt.

## Änderungsumfang

- `src/contexts/auth-context.tsx` — zwei Zeilen tauschen.
- `src/contexts/auth-context.test.tsx` — neuer, kleiner Reihenfolge-Test (nur wenn ohne Umbau möglich).

Keine weiteren Dateien.

## Verifikation

- `bunx tsgo --noEmit`
- `bunx vitest run` (gezielt auf neue/betroffene Tests, plus voller Lauf)
- `bun run build`

## Bericht danach

- Bestätigte Ursache (Reihenfolge signOut/navigate + gegenläufige `beforeLoad`-Guards)
- Geänderte Dateien + Diff der zwei Zeilen
- Testergebnisse (tsc/vitest/build)
- Ob der Regressionstest hinzugefügt werden konnte
- Hinweis auf verbliebene Auth-Risiken, falls beim Lesen aufgefallen — ohne sie in diesem PR anzufassen
