## Ziel

Die Kachel „Abrechnung" im `/zeit`-Hub (`src/routes/_authenticated/zeit/index.tsx`) nur denjenigen zeigen, die sie realistisch nutzen können. Alle anderen sehen die Kachel nicht mehr.

## Sichtbarkeits-Regel

Kachel „Abrechnung" ist sichtbar, wenn **mindestens eine** dieser Bedingungen erfüllt ist:

1. Caller hat Rolle `admin` oder `manager` in `role_assignments`.
2. Caller ist Service-fähig: er hat **irgendeine** `roster_shifts`-Zeile mit `area='service'` (also mindestens einmal für Service eingeteilt gewesen — deckt „arbeitet in Küche und Service" automatisch mit ab).

Für reine Küchenkräfte wie BÄNG (nur `area='kitchen'`-Schichten, Rolle `staff`) ist die Kachel damit ausgeblendet.

## Umsetzung

### 1) Server-Fn (neu)

`src/lib/zeit/abrechnung-visibility.functions.ts`:

- `canSeeAbrechnungTile()` — `createServerFn({ method: "GET" })` + `requireSupabaseAuth`.
- Nutzt `loadStaffCaller` (`staffId`/`organizationId` aus `auth.uid`, nie vom Client).
- Prüft in dieser Reihenfolge (early-return true bei Treffer):
  - `role_assignments`: Rolle des Callers = `admin`|`manager`? → true.
  - `roster_shifts`: `exists (staff_id = caller, organization_id = caller, area = 'service')` mit `limit(1)` → true.
- Sonst false.
- Rückgabe: `{ visible: boolean }`.

Reine Read-Fn, keine Migration, keine RLS-Änderung.

### 2) Hub-Kachel filtern

`src/routes/_authenticated/zeit/index.tsx`:

- Component nutzt `useSuspenseQuery` mit `queryOptions({ queryKey: ["zeit","abrechnung-visible"], queryFn: canSeeAbrechnungTile })` und lädt via Loader (`context.queryClient.ensureQueryData`) — Standard-Muster laut `tanstack-query-integration`.
- `TILES` bleibt statisch; im Render wird die Abrechnung-Kachel gefiltert (`.filter(t => t.to !== "/zeit/abrechnung" || visible)`).
- Kein `localStorage`, kein Client-Rollen-Guess.

### 3) Route `/zeit/abrechnung` bleibt hart-serverseitig geschützt

`ensureMyOpenSession` (§30) bleibt unverändert die harte Grenze: URL-Aufrufe von Nicht-Service-Staff werden weiterhin mit `ForbiddenError` „heute nicht als Service im Dienstplan eingeteilt …" abgewiesen. Die Kachel-Filterung ist reine UI-Kosmetik zusätzlich zum bestehenden Server-Guard.

### 4) Doku

Kein neuer §; ein Satz in §30 anhängen: „Im `/zeit`-Hub wird die Kachel für Nicht-Service-Staff (kein `admin`/`manager` und keine einzige `area='service'`-Schicht in `roster_shifts`) ausgeblendet — die Server-Guard bleibt die harte Grenze." (Kommt beim nächsten Doku-Nachzug-Prompt in `arbeitsweise.md` — jetzt kein Doku-Commit.)

## Nicht enthalten

- Keine Änderung an `ensureMyOpenSession`/`resolveSessionLocation`.
- Keine Änderung an `staff_locations`/`roster_shifts`/RLS.
- Keine Umschreibung anderer Kacheln (Stempeluhr, Schichten, Kalender bleiben für alle sichtbar).
- Kein Test-neu; kleine Sichtbarkeitshilfe, keine Geld-/Zeit-Logik.
