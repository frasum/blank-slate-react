# Arbeitsweise & Stammdaten-Referenz — COCO

Schlankes Betriebshandbuch für die laufende Entwicklung. Wird bei jedem neuen Baublock konsultiert. Bewusst kurz gehalten — Architektur-Begründungen stehen im gruendungsdokument.md, nicht hier.

Stand: 21.06.2026

## 1. Rollenverteilung im Team

Drei Rollen, klar getrennt:

- **Lovable Agent = Baumeister.** Schreibt Code, Migrationen, UI auf Basis eines präzisen Prompts. Committet nach main.
- **Claude = Architekt / Prüfer.** Schreibt die Prompts (mit „Nicht anfassen"-Liste und Erfolgs-Gate), prüft jeden Commit via git fetch + Tests + ESLint, gibt Migrations-Vorab-SQL aus.
- **Frank = entscheidet & führt SQL aus.** Gibt Prompts an Lovable, genehmigt, führt alle SQL-Statements selbst im Supabase-Editor aus (Datenhoheit).

Begründung: Bei einem System mit Geld, Arbeitszeit und RLS sind stille Fehler teuer. Die Dreiteilung erzwingt einen Review-Loop und verhindert „stille Lösungen".

## 2. Review-Loop (nach jedem Lovable-Commit)

```
git fetch -q origin && git reset -q --hard origin/HEAD
git log --oneline <letzter-SHA>..origin/HEAD
npx eslint src/ --max-warnings=0
npx vitest run
```

Erst wenn ESLint 0 Fehler und alle Tests grün sind → ABGENOMMEN.

## 3. Pflicht-Regeln (aus Erfahrung teuer gelernt)

- **Prettier/ESLint VOR jedem Commit.** Jeder Lovable-Prompt endet mit: „Vor dem Commit: `npx prettier --write` + `npx eslint --fix` über alle geänderten Dateien. CI muss grün sein." → Spart die wiederkehrenden Formatierungs-Nachzieher.
- **CI nach JEDEM Commit prüfen**, nicht erst wenn rote Runs auflaufen. (Lektion: zwischen CI #75 und #88 waren ~13 rote Runs unbemerkt.)
- **Migrationen immer als Vorab-SQL-Skizze im Prompt mitgeben** — nicht Lovable raten lassen. Reduziert Schema-Fehler erheblich.
- **Massen-SQL in Batches** (max. ~2000–2500 Zeilen pro Datei), sonst bricht der Supabase-Editor mit Connection-Fehler ab. Bei Fehler einfach nochmal „Run".
- **Dokument nach JEDER Session nachziehen** — egal ob mit Claude oder direkt mit dem Lovable-Agenten gearbeitet wurde. Mindestens den Modul-Status (Abschnitt 6/7) aktualisieren. Diese Datei ist die gemeinsame Wahrheit für beide Arbeitswege; nur wenn sie aktuell bleibt, driften die Wege nicht auseinander. Beim Wiedereinstieg gilt der hier dokumentierte Stand als Ausgangspunkt (nicht der „letzte gesehene" Stand einer einzelnen Person), daher: `git pull` + `git log` gegen diesen Stand, um auch Direkt-Commits zu erfassen.
- **Geld-Helfer zentralisieren — aber Verhaltens-Deltas ehrlich machen.** Gleichnamige Helfer divergieren oft subtil (`parseEuroToCents` hatte vier Varianten: leer→`0` vs `null`, negativ erlaubt vs nicht, Punkt als Tausender- vs Dezimaltrenner). Konsolidieren ist erlaubt, aber **nie stillschweigend**: vorher byte-diffen, jede Verhaltensänderung im Prompt/Commit explizit benennen und mit Charakterisierungstests festnageln. Seit 20.06. ist `parseEuroToCents` eine Implementierung in `@/lib/format` (Optionen `emptyAs`/`allowNegative`), die zwei bewussten Deltas sind getestet. **Gleiche Form ≠ gleicher Vertrag:** `parseLocaleNumber` (Prozent/Stunden → Float/NaN) bleibt von `parseEuroToCents` (Geld → Cent/null) getrennt — nicht über Domänengrenzen verschmelzen.
- **Identity-Cache: `await invalidateQueries(["identity"])` VOR `router.invalidate()`/`navigate`.** `ensureQueryData` (react-query v5, `revalidateIfStale` default `false`) liefert sonst stale Cache ohne Refetch abzuwarten → nach Passwortwechsel/Impersonation-Start/-Stop Redirect-Loop. `removeQueries` vermeiden (Flicker beim aktiven AuthContext-`identityQuery`). Guards in `passwort-aendern.tsx`, `impersonate.tsx` (`handleStart`), `impersonation-banner.tsx` (`handleStop`).
- **Jedes DB-Schreibergebnis prüfen (`if (error) throw`).** Verschluckte `.update()`/`.insert()`-Fehler auf Geld-/Zeit-Pfaden brechen unbemerkt Invarianten — z. B. blieb im Auto-Ausstempeln ein fehlgeschlagener Link-Write still, sodass der Idempotenz-Marker `auto_clockout_time_entry_id` NULL blieb und ein Resubmit doppelt ausstempeln konnte. Kein `supabaseAdmin`-Schreibaufruf ohne Fehlerprüfung.
- **PostgREST-`.or()`-String-Interpolation nur mit Allowlist-validierten Werten.** Einzelne DSL-Zeichen zu strippen reicht nicht — Wildcards `*`/`%` bleiben stehen (`firstName="*"` matcht alle). Namens-Eingaben im Login laufen über `validatePinLoginName`; ungültige → generische Ablehnung.
- **CI-Jobs:** `check` (tsc+eslint+vitest) muss grün sein. `db-integration` ist gelegentlich flaky („role_assignments insert failed: upstream") — das ist ein Timing-Problem des lokalen Supabase-Stacks, kein Code-Bug.
- **Migrationen sind beim Commit bereits live.** Lovable wendet committete Migrationen automatisch auf die (einzige) Produktiv-Supabase-Instanz an. Daraus folgt:
  - Frank führt **committete Migrationen NICHT** selbst aus. Nach dem Commit nur noch eine **Read-only-Verify-Query** (Signatur-/Policy-/`to_regprocedure(...)`-Check) zur Bestätigung des DB-Stands.
  - Manuelles SQL durch Frank gilt nur noch für **Ad-hoc-/Daten-SQL** (Imports, einmalige Korrekturen) — nicht für Migrationsdateien.
  - **„prüfe" ist Nachkontrolle, kein Tor vor dem Livegang.** Das Tor _vor_ Live ist der **Prompt** (Migration als fertige SQL-Skizze + „Nicht-anfassen"-Liste + Stop-Bedingung). Fehler werden **vorwärts** mit einer Korrektur-Migration behoben (kein Rückbau — die DB kann nicht zuverlässig zurück). Migrationen daher **additiv/idempotent** (`IF NOT EXISTS`, `ON CONFLICT`, `DROP … IF EXISTS`).
  - Nach jedem Migrations-Commit **zügig prüfen + funktional smoke-testen** — statisches Review fängt Laufzeitfehler nicht (s. Caller-Param-Bug bei den Task-RPCs).

## 4. Stammdaten-Referenz (COCO Produktion)

### Organisation

| ID  | organization_id                        |
| --- | -------------------------------------- |
|     | `77838674-26c1-40dd-9b74-eb1041e79b95` |

### Standorte (locations)

| Name    | location_id                            |
| ------- | -------------------------------------- |
| Spicery | `44a99e7e-93be-44b1-89ab-38e364a02ddc` |
| YUM     | `14c2d773-6c5f-4a24-ba00-1c726f277091` |
| TSB     | `7918a4cd-0388-49b3-abfb-8105b8f17815` |

### Rollen

`admin > manager > staff` (Hierarchie) + `payroll` (Seitenrolle, nur Lesezugriff auf Zeitübersicht/Perioden/Buchhaltung, kein Schreibrecht).

### Abrechnungsperioden

Immer **26. eines Monats bis einschließlich 25. des Folgemonats**. Label = Monat des End-Datums. Beispiel: „Juni 2026" = 26.05.–25.06.2026.

### Skills (skills-Tabelle, je Kategorie)

| Name        | Kategorie | Farbe     |
| ----------- | --------- | --------- |
| VS          | kitchen   | `#bae6fd` |
| PASS        | kitchen   | `#fecdd3` |
| SPÜLEN      | kitchen   | `#d1fae5` |
| CO          | kitchen   | `#fed7aa` |
| SERVICE     | service   | `#dbeafe` |
| BAR         | service   | `#ede9fe` |
| 19 Uhr      | service   | `#99f6e4` |
| GL          | gl        | `#ffe4e6` |
| Hausmeister | other     | `#e7e5e4` |

## 5. Alt-System → COCO Mappings (für Daten-Migrationen)

### Quell-Repos (Lovable/GitHub, frasum)

- **COCO (Ziel):** blank-slate-react
- **tagesabrechnung** (Kasse/Zeit-Quelle) — `gh repo clone frasum/tagesabrechnung`
- **bunker-shift-flow** (Dienstplan-UI-Vorlage: RosterGrid, Paint-Tool) — `gh repo clone frasum/bunker-shift-flow`
- **thaitime-12f46b18** (Dienstplan-Daten + Display-Vorlage)
- **bestellung-5fff1793** (M5-Quelle, hat `SYSTEM_BLUEPRINT.md`) — `gh repo clone frasum/bestellung-5fff1793`

**Klon-Befehle für die Prüf-/Referenz-Repos** (Claude zieht diese für Golden-Master & Portierung; geklont werden, nicht raten):

```bash
gh repo clone frasum/tagesabrechnung
# Referenz: src/lib/shiftCalculations.ts (SFN-Golden-Master), src/lib/sfnRates.ts (M4-Geldsätze),
#           src/pages/DailySummary.tsx (Kassen-Abgleich), src/pages/zeiterfassung/ZtBruttoNetto.tsx (SFN-Geld simple/extended)

gh repo clone frasum/bunker-shift-flow
# Referenz: src/components/roster/RosterGrid.tsx + PaintToolbar.tsx (M3-UI),
#           src/lib/sfn.ts + sfn.test.ts (zweite SFN-Testquelle), src/lib/billing-cycle.ts (26.–25.-Zyklus)

gh repo clone frasum/bestellung-5fff1793
# Referenz: SYSTEM_BLUEPRINT.md + Welle-4/EasyOrder-Quelllogik (M5)
```

### thaitime → COCO Standort-Mapping

| thaitime branch     | COCO location |
| ------------------- | ------------- |
| `spicery 83f56090…` | Spicery       |
| `yum f1229497…`     | YUM           |
| `TSB 2b00f500…`     | TSB           |

### thaitime → COCO Skill-Mapping (Dienstplan)

| thaitime           | COCO        |
| ------------------ | ----------- |
| Vorspeise          | VS          |
| pass               | PASS        |
| spülen             | SPÜLEN      |
| Kochen 1, Kochen 2 | CO          |
| Service 1–4        | SERVICE     |
| Bar                | BAR         |
| 19 Uhr             | 19 Uhr      |
| GL                 | GL          |
| Hausmeister        | Hausmeister |

### Mitarbeiter-Mapping

Über das Nickname in Klammern im thaitime-Vornamen, z.B. „REDACTED" → COCO display_name „REDACTED". Sonderfall: „REDACTED" → REDACTED. „REDACTED" existiert nicht in COCO (ignoriert).

## 6. Aktueller Modul-Status (21.06.2026)

| Modul                                                                                                   | Status    |
| ------------------------------------------------------------------------------------------------------- | --------- |
| B3 Kasse + B4 Trinkgeld + B5 Tresor                                                                     | ✅        |
| B6 Zeitübersicht (Wochenplan/Zusammenfassung/Buchhaltung/Perioden)                                      | ✅        |
| B7 Perioden (26.–25.) + Import Jan–Sep 2026                                                             | ✅        |
| B8 Lohnbüro-Rolle (payroll)                                                                             | ✅        |
| D1 Dienstplan-Datenmodell + Grid                                                                        | ✅        |
| D2a–e Dienstplan editierbar, Realtime, Service-Symbole, Cross-Booking                                   | ✅        |
| D-8 Eine Einteilung/MA/Tag (Pre-Check + UI-Lock, kein DB-Constraint)                                    | ✅        |
| Dienstplan-Migration (re-migriert 17.06.: 3764 echte Schichten)                                         | ✅        |
| D3 Display — Token + Auto-Refresh + Daten ✅; Rotation/Legende/Geburtstag offen                         | 🔄 teilw. |
| M4 Lohn — Rechen-Kern (Stufe 1/3): PAP 2026 + SV, edlohn-cent-getestet                                  | ✅        |
| M4 Lohn — SFN-Geld + Perioden-Aggregation + Verdrahtung (Stufe 2a–c)                                    | ✅        |
| M4 Lohn — Lohnrechner-UI + Excel-Export (`/admin/lohnrechner`)                                          | ✅        |
| Provision (wochenbasiert)                                                                               | ⏳ offen  |
| Geofencing-Stempeln (UI clockIn nur am Standort, distinct-Location)                                     | ✅        |
| PIN-Login via Vorname/Nickname                                                                          | ✅        |
| Hub & Meine Schichten (`/zeit/schichten`, `/zeit/stempeln`)                                             | ✅        |
| Inventur-Session an DB gebunden                                                                         | ✅        |
| Self-Service Welle B — Freier-Tag-Wunsch (`/zeit/wuensche`)                                             | ✅        |
| Self-Service Welle C — Urlaubsanträge + Genehmigung (`/zeit/urlaub`, `/admin/urlaub`)                   | ✅        |
| Kasse — Vier-Zeilen-Bargeldblock + Soll-Wechselgeld je Standort                                         | ✅        |
| Kasse — Abgleichs-Warnungen (POS-/Terminal-Differenz, `payment_terminals.is_gl`)                        | ✅        |
| Impersonation („Anmelden als") + granularer Rechte-Tab + Passwort-Flows (ändern/zurücksetzen)           | ✅        |
| M4 — Payroll-Policies erweitert (`m4-payroll-permissions.db.test`)                                      | ✅        |
| Buchhaltung §3b-Block (`/admin/zeit-uebersicht`, payroll-Tab) inkl. Feiertags-Fix                       | ✅        |
| Interne Verbesserungen: `@/lib/format`, DE-Lokalisierung, Skeletons, Identity-Roundtrip                 | ✅        |
| Refactor: `kasse.tsx` aufgeteilt (2189 → 860 Z., `src/components/cash/*`)                               | ✅        |
| Auto-Ausstempeln: verschluckter DB-Fehler in `submitWaiterSettlementCore` gefixt (`if (linkErr) throw`) | ✅        |
| PIN-/Passwort-Login gegen PostgREST-Filter-Injection gehärtet (Allowlist `validatePinLoginName`)        | ✅        |
| `parseEuroToCents` zentralisiert (eine Impl. in `@/lib/format`; Bestellung-Magnitude-Korrektur)         | ✅        |
| Artikel-Suche (`listArticles`) gegen PostgREST-`.or()`-Injection gehärtet (`sanitizeArticleSearchTerm`) | ✅        |
| jspdf/pdfjs lazy-geladen (#3-Rest: keine statischen PDF-Imports mehr)                                   | ✅        |
| Security-Header / CSP (Report-Only) auf HTML-Responses (`withSecurityHeaders` in `server.ts`)           | ✅        |

**Stand 20.06.2026 (Session-Nachzug, Teil 2 — Härtung & Security-Header):**

- **Artikel-Suche gegen PostgREST-Injection gehärtet (`articles.functions.ts`):** `listArticles` baut den Suchfilter über `.or(name.ilike…, article_number.ilike…)`. Neuer Sanitizer `sanitizeArticleSearchTerm` entfernt alles außer Buchstaben/Ziffern/Leerzeichen/`-`; bleibt nichts übrig, entfällt der Filter (statt kaputter Query). **Schweregrad niedrig** (org-scope + `is_active` sind separate AND-Filter, Injection kann sie nicht umgehen; Aufrufer bereits manager+) — Hauptnutzen ist Robustheit (legitime Suchen wie „50%" / „ART-(2)" funktionieren jetzt). Damit ist die gesamte `.or()`-Injektionsfläche abgedeckt: PIN-/Passwort-Login (s. Block oben) und Artikel-Suche gehärtet; `order-units.functions.ts` interpoliert nur eine **session-abgeleitete UUID** (nicht injizierbar, bewusst belassen, Defense-in-Depth offen).
- **jspdf/pdfjs lazy-geladen (#3-Rest):** Alle drei PDF-Generatoren (`generateDailySummaryPdf`, `buildWeeklyPdf`, `buildBuchhaltungPdf` — letzterer war im ersten Plan **vergessen** und wurde nachgezogen) jetzt `async` mit dynamischem `import("jspdf")`; die drei Aufrufstellen (`kasse.tsx`, `zeit-uebersicht.tsx` ×2) mit `await`. `pdfExport.ts` nutzt `import type jsPDF` nur für den Rückgabetyp (Fall B). pdfjs: `import * as pdfjsLib` dynamisch in der `useEffect`-IIFE; die `?url`-Worker-URL bleibt statisch (billig). **`recharts`-Lazy-Load ist ein separater, noch offener Schritt.** vitest 715.
- **Security-Header / CSP (Report-Only):** `src/lib/security-headers.ts` (`withSecurityHeaders`) setzt auf **HTML-Responses** HSTS, `X-Content-Type-Options: nosniff`, `Referrer-Policy`, `Permissions-Policy` (`geolocation=(self), camera=(), microphone=()`) und eine **`Content-Security-Policy-Report-Only`**. Angewendet im Cloudflare-Worker-Entry `src/server.ts` (`fetch`-Wrapper — der zuverlässige Engpass, bewusst nicht in einer Middleware). CSP-`connect-src` enthält `wss://*.supabase.co` (Dienstplan-Realtime). **Noch Report-Only** → protokolliert Verstöße, blockiert nichts.
  - **Preview-Fix (X-Frame-Options entfernt, Commit `2715360`):** `X-Frame-Options` wurde komplett entfernt — samt der Host-Allowlist `isLovablePreviewHost`. Grund: der Header ist all-or-nothing und blockierte das **legitime** Lovable-Editor-iframe (die Projekt-Domain `cocoplatform.lovable.app` fiel durch die Allowlist → `DENY` → Vorschau tot). Framing wird jetzt **nur über CSP `frame-ancestors 'self' https://lovable.dev https://*.lovable.dev`** gescoped; ein evtl. vorgelagert gesetztes `X-Frame-Options` wird aktiv gelöscht. Da CSP Report-Only ist, blockiert `frame-ancestors` aktuell nicht → Vorschau läuft.
  - **Domain-Wechsel — Betriebsnotiz:** Der Security-Header-Code ist **domain-agnostisch**: überall `'self'`, das die Auslieferungs-Domain automatisch verfolgt; **kein COCO-Host ist hartkodiert**. Ein Domain-Wechsel erfordert daher **keine** Code-Änderung an den Headern. Relevant wird die Domain nur beim späteren **CSP-Scharfschalten** (Report-Only → erzwingend): dann entscheiden (a) die finale Produktions-Domain und (b) ob weiter über den Lovable-Editor gearbeitet wird, ob `frame-ancestors` `lovable.dev` behält oder auf `'self'`/`'none'` verengt wird. Beim Scharfschalten `cdn.gpteng.co` **nicht** whitelisten — das ist Lovables Editor-Skript, das nur in der Vorschau injiziert wird und in Produktion fehlt (am Live-Tab `cocoplatform.lovable.app/auth` verifiziert: kein `gpteng.co`-Request). **Außerhalb des Repos** (Frank-Seite, nicht im Code) zieht ein Domain-Wechsel nach: Supabase → Auth → Site-URL/Redirect-URLs umstellen (sonst brechen Login-Redirects und Passwort-Reset-Mails); MailerSend SPF/DKIM bzw. FROM-Domain im DNS. Randnotiz: Geocoding läuft über `connector-gateway.lovable.dev` (Lovable-Plattform-Endpoint) — kein Domain-Thema, aber zu ersetzen, falls COCO die Lovable-Plattform ganz verlässt.
  - **Auth-Seite Hydration-Meldung (kein Bug, dokumentiert damit nicht erneut untersucht):** `/auth` ist bewusst `ssr: false` (der `getSession()`-Check im `beforeLoad` ist Browser-Storage-abhängig). Die Konsole zeigt dort eine React-Hydration-Meldung (`+<main>` vs `-<Suspense>`) — das ist das **erwartete Verhalten** der SSR-deaktivierten Route (Server schickt den Platzhalter, Client rendert das echte `<main>`), kein Funktions- oder Sicherheitsproblem; Login, Redirect, alles läuft. Ein im selben Tab sichtbarer Passwortmanager (`completion_list.html?username=…`) mutiert nur die Input-Felder, ist **nicht** die Ursache dieser Meldung. Nicht reaktiv „fixen".

**Stand 20.06.2026 (Session-Nachzug):**

- **Auto-Ausstempel-Fix (`cash.functions.ts`):** Im Auto-Ausstempel-Pfad von `submitWaiterSettlementCore` wurde der Fehler des Link-Writes (`waiter_settlements.auto_clockout_time_entry_id`) still verschluckt → jetzt `const { error: linkErr } = … ; if (linkErr) throw linkErr;`. **Bekanntes Restfenster (nicht in diesem Fix):** `performClockOut` läuft vor dem Link-Write und ist nicht atomar mit ihm; bleibt der Link bei einem transienten Fehler NULL (Idempotenz-Marker), kann ein **späterer** Resubmit nach erneutem Einstempeln doppelt ausstempeln. Durable Lösung wäre, den „bereits ausgestempelt"-Check auf die Existenz eines Clockouts mit `triggered_by='settlement'` + `settlement_id` zu stützen — vertagt.
- **PIN-Login gegen PostgREST-Filter-Injection gehärtet (`auth-flows.server.ts` / `.functions.ts`):** `toPostgrestIlikeLiteral` (strippte nur `( ) , . \`, ließ aber `*`/`%` als Wildcards durch → `firstName="*"` matchte alle) **entfernt**, ersetzt durch Allowlist `validatePinLoginName` (`/^[\p{L}][\p{L} -]*$/u`, getrimmt). Ungültige Namen → generische Ablehnung **vor** der Query; der `.or()`-Filter interpoliert weiter, aber sicher (Wert ist DSL-/Wildcard-frei). Die Kandidaten-Query ist von PIN- **und** Passwort-Login geteilt → Allowlist gilt für beide. Neue Test-Suite `auth-flows.server.test.ts`. **DB-Check (Produktion) bestätigt:** kein aktiver Mitarbeiter hat Apostroph/Punkt/Ziffer im `first_name`/`display_name` → kein Lockout.
- **`parseEuroToCents` zentralisiert:** eine Implementierung in `src/lib/format.ts` (`opts: { emptyAs?: 0 | null; allowNegative?: boolean }`); die vier lokalen Varianten ersetzt (kasse-helpers + abrechnung = dünne Options-Wrapper, Aufrufstellen unverändert; beide Bestellung-Dateien importieren direkt mit Defaults). **Bewusste Verhaltensänderungen, getestet:** Bestellung — `"12.50"` ergibt jetzt `1250 ct` statt `125000 ct` (fachliche Korrektur); kasse/abrechnung — Tausendertrenner `"1.234,56"` wird akzeptiert (vorher null→`?? 0`→0 € verbucht), Trailing-Dot `"12."` abgelehnt. **Kein stilles Umskalieren** (alle Deltas nur null↔Zahl). `parseLocaleNumber` (Prozent/Stunden → Float/NaN) bleibt bewusst getrennt — kein Geld-Parser.

**Stand 18.–19.06.2026 (Session-Nachzug):**

- **Auth-/Admin-Ausbau:**
  - **Impersonation („Anmelden als"):** `src/lib/admin/impersonation.functions.ts` (`startImpersonation`/`stopImpersonation`), `src/components/impersonation-banner.tsx`, Route `/admin/impersonate`. **Start** sitzt in `impersonate.tsx` (`handleStart`), **Stop** im Banner (`handleStop`) — nicht in `impersonate.tsx`.
  - **Granularer Rechte-Tab** im Staff-Detail: `permissions-catalog.ts`, `permissions.functions.ts`, `PermissionsTab.tsx`.
  - **Passwort-Flows:** `passwort-aendern.tsx`, `reset-password.tsx`, `password-change.functions.ts`, `password-generator.ts`, `account.functions.ts`. `createStaffAccount` spiegelt den bewährten Flow: `auth.admin.createUser` mit `app_metadata.staff_id`, `user_links`-Insert, `must_change_password=true`, gibt das einmalige Standardpasswort als **Klartext** zurück (nicht geloggt). Admin-gated, schreibt `audit_log staff.account_created`.
  - **M4-Payroll-Policies erweitert** (+ `m4-payroll-permissions.db.test.ts`).
- **Payroll-Kraft „Viktoria Schaffer" angelegt** (Rolle `payroll`, Login `…@etl.de`, PIN). **Bewusst ohne `staff_locations`** → unsichtbar in Dienstplan + Zeitübersicht. **Merker:** Diese Sichtbarkeit hängt an `staff_locations` (`getStaffForRoster` joint es, `getTimeOverview` zieht aus `time_entries` an der Location), **nicht an der Rolle** — kein Rollen-Filter im Code. `participates_in_pool` für externe Kräfte explizit `false` (DB-Default ist `true`).
- **Buchhaltung §3b-Block** im `payroll`-Tab von `/admin/zeit-uebersicht`: §3b-Toggle (Einfach/§3b), Spalten 20–24/24–X/SO-FEI, im §3b-Modus zusätzlich Sonntag/Feiertag 125 %/Feiertag 150 %, Footer-Summen, Suche, PDF/Excel-Export (`buchhaltung-export.ts`, **ExcelJS** — kein `xlsx`). Perioden- und Buchhaltung-Tab existierten bereits (B6/B7) — **kein Neubau**, nur Anreicherung.
  - **Feiertags-Bug gefixt (`e105780`):** `getSfnOverview` rechnete `"simple"` mit leerer `holidayRates`-Map → „Feiertag"/„Feiertag 150 %" strukturell **immer 0**, alles unter „Sonntag". Fix: reine, getestete `src/lib/lohn/compute-staff-sfn.ts` (baut die Map via `bavarianHolidaySurchargeRate`, rechnet simple **und** extended), `getSfnOverview` nutzt sie modusabhängig. 20–24/24–X bleiben die §3b-25 %/40 %-Töpfe (`night25`/`night40`, Entscheidung Frank).
- **Interne Verbesserungen (ohne Verhaltensänderung):**
  - **`src/lib/format.ts`** — nur die byte-identischen Helfer `fmtCents`/`parseIso`/`todayIso` zentralisiert. `parseEuroToCents`/`fmtTime`/`formatDuration`/`daysBetween` **bewusst lokal gelassen** (divergente Varianten, s. §3).
  - **DE-Lokalisierung** `__root.tsx` (404/Error-Seite, `lang="de"`).
  - **Skeleton-Loader** `src/components/ui/page-skeletons.tsx` (kasse/zeit-uebersicht; Dienstplan hatte keinen „Lade…"-Text → Skeleton exportiert, ungenutzt).
  - **Identity-Roundtrip** via `ensureQueryData` in beiden `_authenticated`-`beforeLoad` (ein `getMyIdentity` pro Session statt zwei) + 3 Invalidate-Guards (s. §3).
- **Refactor `kasse.tsx` aufgeteilt (2189 → 860 Z.):** Sub-Komponenten nach `src/components/cash/*` (SettlementWarningsBanner, SettlementsCard, SessionFieldsCard, CashSummaryBlock, ExcelRows, ExpenseForm, AdvanceForm, TipPoolCard), Helper nach `src/lib/cash/kasse-helpers.ts`, geteilte Typen nach `kasse-types.ts`. Byte-identische Extraktion, Tests unverändert (685). `parseEuroToCents` blieb byte-identisch (nicht gemergt).

**Stand 17.06.2026 (Abend, Session-Nachzug):**

- **Kasse — Abgleichs-Warnungen (POS-Differenz + Terminal-Differenz):** Rotes Banner oben im `/admin/kasse`-Editor, wenn Kellner-Abrechnungen existieren und der Soll/Ist-Abgleich ≥ 1 Cent abweicht. Reines, getestetes Modul `src/lib/cash/settlement-warnings.ts` (`computeSettlementWarnings`); Banner-Verdrahtung in `kasse.tsx` nutzt dieselbe Kanal-`kind`-Auflösung wie der Cash-Ledger (kein zweiter Rechenweg). Legacy-Referenz: `tagesabrechnung` `DailySummary.tsx` (`adjustedPosDiff` / `cardTerminalMismatch`) — **1:1 portiert**, nicht aus einer verbalen Beschreibung rekonstruiert (genau das war zuerst der Bug).
  - **Zwei teuer gelernte Semantik-Regeln (sonst False Positives):**
    1. **Wolt ist NICHT im Vectron-Tagesumsatz** (Drittplattform, läuft nicht über die Vectron-Kasse). Im POS-Abgleich wird Wolt **nie** abgezogen — nur `delivery_vectron` (Vectron-Takeaway) + `delivery_souse`. Identität: `vectron_daily_total = Σ Kellner-POS + delivery_vectron + delivery_souse`.
    2. **„Kredit Karten GL" gehört auf die Kellner-Karten-Seite**, nicht zu den physischen Terminals. Flag `payment_terminals.is_gl` (Frank-SQL in COCO) markiert die GL-Deklaration (Spicery `16ba431d…`, YUM `fcf379d8…`; TSB keine Kasse). Terminal-Identität: `(T1 + T2) = Σ Kellner-Karten + GL`. Der Banner splittet `terminalAmounts` via `is_gl` in physisch vs. GL.
  - **Geld-Pfad unberührt:** Wolt bleibt in `cash-ledger.ts` / Saldo / Export gebuchter Umsatz; nur der Settlement-**Abgleich** zieht es nicht ab. Tests in `settlement-warnings.test.ts` nutzen die echten Spicery-10.06.-Zahlen als Regressions-Guard (POS → 0, Terminal → 0, Gegenprobe ohne GL → 1590).
- **Lohn-Tabelle (B6 `/admin/zeit-uebersicht`) — Vorschuss aus Kasse + U/K-Spalten:** Vorschuss-Spalte jetzt **read-only aus `session_advances`** (Kasse, je Standort × Periode summiert) statt manuellem Eingabefeld — keine Doppeleingabe. U/K-Spalten zeigen Urlaubs-/Kranktage aus `roster_absence` (org-weit). Neue read-only Server-Reader `listAdvancesByStaff`/`listAbsencesByStaff` (GET, `loadAdminCaller([manager,admin,payroll])`, org-scoped). `payroll_notes.vorschuss` wird downstream **nicht mehr gelesen** (write-only `0`). **Merker M4:** Vorschuss ist hier **standort-gefiltert**, Abwesenheiten **org-weit** — beim echten Netto-Lohn den Vorschuss-Abzug eines Mehr-Standort-Mitarbeiters über **alle** Standorte summieren, sonst Unterzählung.

**Stand 17.06.2026 (Nachmittag, Session-Nachzug):**

- **Mitarbeiter-Self-Service Wellen A–C** (aus `/zeit` eine MA-Plattform gemacht):
  - **A — Hub + Meine Schichten:** `/zeit` ist Hub mit Karten (Stempeln/Schichten/Abrechnung/Wünsche/Urlaub). `getMyShifts` liest read-only auf eigene `staffId` via `loadStaffCaller`. Stempeluhr → `/zeit/stempeln`, „Meine Schichten" → `/zeit/schichten`.
  - **B — Freier-Tag-Wunsch:** `/zeit/wuensche` (`createDayOffWish`/`getMyDayOffWishes`/`deleteDayOffWish`, reines `day-off-wishes.ts`). Unverbindlich, kein Tausch.
  - **C — Urlaubsanträge mit Genehmigung:** Tabelle `leave_requests` (Status `offen/genehmigt/abgelehnt`). MA-Sicht `/zeit/urlaub`, Manager-Posteingang `/admin/urlaub` (manager+, `runGuarded`). Genehmigung über atomare **SECURITY-DEFINER-RPC `approve_leave_request`** → expandiert den Bereich in `roster_absence` (type `urlaub`, grüner Schirm im Plan). **Sicherheit:** RPC-EXECUTE nur `service_role` (Lockdown-Migration `20260617190822` — sonst Self-Approval am Manager-Guard vorbei); `leave_requests` nur SELECT für `authenticated`. Reines `leave-requests.ts` (validate/count/can-cancel/can-decide) getestet.
  - **Offen — Welle D:** Payslips einsehen (edlohn-PDF-Split, Dry-Run, Personalnummer je edlohn-Mandant).
- **Geofencing-Stempeln (M1) + Distinct-Fix:** UI-`clockIn` ist server-seitig geofence-gegated (`src/lib/geo/`). `locations` hat `latitude`/`longitude`/`geofence_radius_m` (Default 100 m). `clockIn` verlangt **genau einen distinkten** Standort in `staff_locations` (`pickSingleLocation` in `src/lib/time/resolve-location.ts` zählt distinkte `location_id`, **nicht Zeilen** — behebt, dass ein MA mit zwei Bereichs-Zeilen an EINEM Standort fälschlich blockiert wurde) **und** hinterlegte Koordinaten — sonst sprechende deutsche Ablehnung, kein Eintrag. Manager-Korrekturen geofence-frei. **Voraussetzung Live:** alle Standorte brauchen GPS + Radius, sonst kein Stempeln. Google-Maps-Browser-Key per HTTP-Referrer restringieren (er liegt browser-öffentlich im Repo).
- **PIN-Login via Vorname/Nickname:** `validatePin` matcht `first_name` ODER `display_name` (exakt, case-insensitive), der PIN disambiguiert pro Kandidat, `staffId` aus dem server-seitigen Match (nie Client). Mehrdeutigkeit (zwei Gleichnamige mit gleichem PIN) → Ablehnung, **kein** Fremd-Login. Shadow-Session unverändert.
- **Kasse — Vier-Zeilen-Bargeldblock:** `/admin/kasse` zeigt Tages-Bargeld / Differenz zum Wechselgeld / in den Tresor / Wechselgeldbestand-Input. Soll-Wechselgeld als `locations.cash_balance_target_cents` (`bigint NULL`, Migration `20260617184811`); Resolver `COALESCE(location, organizations.cash_balance_target_cents)`. Reine Summen-Funktion `cash-summary.ts` (`computeSummaryRows`). DayInput-Bau aus `pdfExport.ts` in geteilten Helper `session-day-input.ts` (`sessionToDayInput`) extrahiert — **eine Wahrheit** für PDF + UI; `grossRevenueCents` aus `vectron_daily_total_cents`. Golden-Master-Cash-Tests bleiben grün (verhaltensgleich).

**Stand 17.06.2026 (Session-Nachzug):**

- **Dienstplan-Re-Import korrigiert (4362 → 3764):** `roster_shifts` aus korrigiertem thaitime-`schedule_entries`-Export neu aufgebaut. Aufteilung: Spicery 1848, YUM 1905, TSB 11. Lektion: `locations.name` für Spicery ist klein geschrieben („spicery") — Standort-Auflösung daher über feste `location_id`-UUIDs (§4), nicht über den Namen (ein Name-Join scheiterte zunächst an allen 1846 Spicery-Zeilen). Mapping-Sonderfälle bestätigt: „Sumitr (PAE)" → `SUMITR`, „Elson" (ohne Nickname) → display_name `Elson`; Kosal/BIG inaktiv mit 3 Schichten. **Marker-Lektion:** thaitime speichert „nicht verfügbar" als `schedule_entries`-Zeile mit `notes='\t='` (Beleg WIT 27.01.) — Import nimmt nur notiz-freie Zeilen (3764 echte Schichten); der 4365-Vollexport enthält 601 dieser Marker und darf NICHT importiert werden. Die Lasse-Zeilen sind selbst Marker (existieren nicht in COCO). Nachtrag: der 10:59-Export ließ zusätzlich 2 echte Gerard-Schichten (Spicery 08./09.04.) aus — nachgesetzt → Endstand 3764.

**Stand 16.06.2026 (Session-Nachzug):**

- **B2b-Korrektur-UI entfernt:** `/admin/zeit` (Manager-Zeitkorrektur) + die Server-Functions `listEntriesForCorrection`/`getTimeLockSettings`/`createManualEntry`/`updateTimeEntry`/`deleteTimeEntry`/`setTimeLock` bewusst gelöscht. Schema (`source='manual'`, Wasserlinie) bleibt; Korrektur derzeit nur per SQL. Zeit-Migration aus tagesabrechnung (B2c) **unberührt** (eigenes `migration/`-Subsystem). Details im gruendungsdokument-Nachtrag.
- **Branding O1 entschieden:** App heißt „Central Ops" (BrandLockup über alle Seiten).
- **Standorte:** Kontaktfelder ergänzt (`phone`/`contact_name`/`contact_phone` auf `locations`, Migration `20260616102537`; create/update admin-only, org-gescoped). Live-DB-ALTER ggf. noch ausführen.
- **Personaldaten-Tab** in `/admin/staff/:id` (HR-Daten: IBAN, Steuer-ID, SV-Nummer, Steuerklasse, Bank, Urlaub etc.). Eigene Tabelle `staff_personal_details` (NICHT die `staff`-Stammtabelle). RLS: SELECT nur `admin`/`payroll`, Schreiben nur `admin`, org-scoped (Migration `20260616145016` — **verschärft SELECT von manager+ → admin/payroll; auf Live-DB ausführen, sonst lesen Manager dort noch IBAN/SV**). Audit-Log schreibt sensible Felder nur als `[REDACTED]` (`redactForAudit`, getestet) — nie Klartext. IBAN wird validiert/normalisiert.
- **M2 Kasse — Vollmigration abgeschlossen + validiert (16.06.2026):** Komplette
  tagesabrechnung-Historie (Feb–Juni 2026, Spicery + YUM, **239 Sessions**, 782
  Settlements, 1868 Tip-Pool-Einträge, 184 Ausgaben, 3 Einzahlungen) nach COCO migriert.
  TSB hat keine Kasse-Sessions (nur Dienstplan). Pilot (26.04–25.05) unberührt; 4 manuelle
  Juni-Testtage gelöscht + aus Quelle neu importiert.
- **`tip_pool_settlement_only`-Flag** (Migration `20260616195215`, „Option A"): an
  migrierten Kasse-Tagen bestimmt **nur die Kasse** den Trinkgeld-Pool — `time_entries`
  fügen **keine** zusätzlichen Pool-Köpfe hinzu. Alle bestehenden Sessions = `true`; neue
  Live-Sessions default `false` (Live-Verhalten unverändert).
- **Zusatzkellner-Logik:** Eine Kellnerabrechnung gehört zu _einer Kasse_, nicht zu _einer
  Person_ — mehrere Kellner pro Abrechnung möglich (`additional_waiters`, bis zu 4), alle
  sind Service-Pool-**Mitglieder**, Geld zählt einmal. 156 Zusatzkellner als Service-
  `session_tip_pool_entries` nachimportiert (Stunden = Schichtstunden des Primär-Kellners).
- **Spot-Check 06.03 YUM:** Drei-Wege deckungsgleich (COCO = CSV-Quelle = tagesabrechnung)
  bei Umsatz, Settlements, Pool-Besetzung (Service 5 inkl. Kriss, Küche 110,93 €). Bewusste
  Rest-Differenzen (Historie längst ausgezahlt): COCO verteilt **nach Stunden** (~81 €),
  tagesabrechnung **gleichmäßig** (81,69 €); **EM** bleibt im COCO-Küchen-Pool (das
  „kein Pool"-Flag steckte nicht in den Quell-`kitchen_shifts`).

- **M4 Lohn — Stufe 1/3 (Rechen-Kern) fertig (`src/lib/lohn/`):** Reines, getestetes TS-Modul ohne DB/UI/Serverfunktion. Amtlicher **BMF-PAP 2026** nach TS portiert (`pap-2026/pap2026.ts`, `decimal.js` für die BigDecimal-Arithmetik) → Lohnsteuer/Soli/KiSt-Basis in Cent. **SV-AN-Anteile** (KV/RV/AV/PV mit BBG-Deckel, PV-Kinder-Abschläge, Minijob) in `sv-2026.ts`. Zusammenbau Schritt A–F (Gesamtbrutto → St/SV-Brutto → Netto → Auszahlung) in `lohn-core.ts`. **Golden Master:** 3 edlohn-Referenzfälle (Normal StKl 1 / Minijob / StKl 4 + 2 Kinder) **bitgenau** (`golden-master/edlohn-faelle.json`, blockierende Tests, 598 grün). Minijob-RV = **Gesamt(18,6 %) − AG-Pauschale(15 %)**, je cent-gerundet (nicht direkt 3,6 % — sonst 1 Cent Abweichung). Sätze/BBG 2026 als Konstanten in `config-2026.ts` — **BBG durch die 3 Fälle nicht abgedeckt → noch unbelegt** (4. Gutverdiener-Fall offen). Cloudflare-konform: **kein** Edge Function, **kein** Python. **Offen:** Stufe 2 (Stammdaten an `staff`/`staff_personal_details`; fehlende Spalten KVZ/Kinderlosen-Zuschlag-Elterneigenschaft/Bundesland; `hourly_rate_2` einbeziehen; admin-gated `createServerFn`, die den Kern aufruft), Stufe 3 (UI/Batch/CSV-Export). Methoden-Validierung über einen 2. Minijob-Fall (18,6−15 vs. Abrunden) noch offen.
- **`staff_compensation.hourly_rate_2`** (Migration `20260616232913`, zweiter Stundenlohn für Mitarbeiter in zwei Bereichen, z. B. Service/Küche) ergänzt — Live-DB-`ALTER` ggf. noch ausführen. Fließt in M4-Stufe-2 ein (Brutto = Stunden × Satz je Bereich).
- **M4 Lohn — Stufe 2a–c + UI fertig (17.06.2026), zustandslos:**
  - **2a SFN-Geld** (`src/lib/lohn/sfn-geld/`): Topf-Stunden + Stundensatz → steuerfreie Zuschläge (€) in zwei Modi `simple` (Betriebspraxis „Feiertag wie Sonntag", 50 %) und `extended` (§3b additiv, Nacht stapelt, Feiertag 125/150). Charakterisiert gegen `tagesabrechnung` (`ZtBruttoNetto` `aggregateSimple/Extended` + `sfnRates.ts`); Golden Master **5 Fälle × 2 Modi bitgenau**. Die 50-€-Grundlohngrenze ist (wie im Original) definiert, aber **nicht angewandt**.
  - **2b Perioden-Aggregation** (`time-entry-sfn.ts`, `holiday-rate.ts`, `lohn-period.functions.ts`): Brücke `time_entries` → **rohe** Töpfe inkl. `nightDeep` via `calculateShiftHours` (Europe/Berlin-Uhrzeit), **Pause proportional** abgezogen. Bayerische Feiertage aus dem **Code** (`isBavarianHoliday`, Gauß-Ostern) — **keine** `bavarian_holidays`-Tabelle nötig; 125/150-Split via `bavarianHolidaySurchargeRate` (150 % = 1. Mai, 25./26.12.). Zustandslose admin-Serverfn `getSfnPeriodForStaff` (beide Modi). Reine DB-Aggregation als `aggregateSfnPeriod` herausgezogen (von beiden Serverfns genutzt).
  - **2c Verdrahtung** (`person-mapping.ts`, `lohn-rechner.functions.ts`): `staff_personal_details` → `PersonenParameter` (`tax_class` röm.→1–6, KVZ, Kinderzahl, PV-Kinderlosen-Zuschlag aus Kinderzahl+Alter abgeleitet). `totalHours × Satz` → `zeitlohn`-Zeile, SFN-Zuschläge → `zuschlag_frei`, plus manuelle Handposten (Sachbezug/Mahlzeiten/Abzüge) → Lohn-Kern → Brutto/Netto/Auszahlung. Zustandslose admin-Serverfn `berechneLohnFuerMitarbeiter`. Migration `20260617004033`: `staff_personal_details.kk_zusatzbeitrag` (KVZ %) + `children_count` — **Frank-SQL in COCO** (Spalten müssen je Mitarbeiter gepflegt sein, sonst keine Lohnsteuer).
  - **UI** `/admin/lohnrechner` (admin-gated über Route-`beforeLoad` **und** Serverfn): ruft nur die **read-only**-Funktion, zeigt Zeilen/Person/Ergebnis, **Excel-Export** (`lohn-excel-export.ts`, `exceljs`, reine Präsentation). `hourly_rate_2`-Bereichs-Split bewusst ausgelassen (ein Satz pro Person).
  - **Offen (echter M4-Abnahmetest):** Cent-Abgleich gegen einen bekannten **edlohn-Monat** (setzt gepflegte `staff_personal_details` voraus: Steuerklasse, `kk_zusatzbeitrag`, `children_count`). Zusatz: 4. Gutverdiener-Fall (belegt die BBG-Deckel), `hourly_rate_2`-Split.

**Stand B3/B4 (reconciled 17.06.2026):**

- **Trinkgeld-Pool-Verteilung — erledigt:** `src/lib/cash/tip-pool.ts` (reine Verteilung nach Stunden, getestet), `session_tip_pool_entries`, Küchen-/Mitarbeiter-Pool, `tip_pool_settlement_only`.
- **Kassen-Saldo + Excel-Export — vorhanden:** `/admin/kasse-saldo` (`bargeld-export.ts`, „Export Excel").
- **Wirklich offen:**
  - **Provision (wochenbasiert)** — umsatzbasierte Commission-Formel (`commissionPct`/`minRevenue`: Pool/Tag = Σ max(0,(Umsatz − minRevenue × Kellnerzahl) × %)). Kein Modul/Tabelle im Code. (= der separate „Provision"-⏳-Eintrag.)
  - **D-M2-1 Auto-Ausstempeln bei Abrechnungs-Abgabe** — im Code nicht vorhanden; erst damit stempelt das Team in COCO um.
  - **B3c-1 manuelles E2E** des Trinkgeld-/Abrechnungs-Pfads.
  - **D3-Display-Rest:** Bereichs-Rotation, Legende (X/–/U/K/B/♡), Geburtstags-Banner.

**Stand 21.06.2026 (Aufgaben/Kanban-Modul + Migrations-Workflow-Klarstellung):**

- **Migrations-Workflow geklärt** (s. §3): Lovable wendet committete Migrationen direkt auf die Produktiv-DB an; Frank verifiziert nur noch read-only und führt committete Migrationen nicht mehr selbst aus.
- **Aufgaben/Kanban (neuer Modulstrang):** Restaurant-Aufgabenboard. Kategorien `service`/`kitchen`/`maintenance`/`manager_admin`, Status `open/in_progress/done/cancelled`, `priority` 0–3, `sort_order` numeric (Drag&Drop), Archivieren statt Löschen. Manager-Board `/admin/aufgaben`, Staff-Board `/zeit/aufgaben`, Realtime live.
  - **Sicherheitsmuster (Hausmuster):** Schreib-RPCs `create_task/set_task_status/reassign_task/update_task/archive_task/claim_task` sind **service_role-only**; Identität kommt als Parameter (`p_caller_staff_id`/`p_organization_id`) aus dem Server-Fn (`loadAdminCaller`), die Rolle wird in der RPC autoritativ aus `role_assignments` ermittelt. **Kein `auth.uid()`/`current_*()`/`has_permission()` in diesen RPCs** (war unter service_role NULL → „kein aktiver Aufrufer"; live gefixt mit Migration `…123007`). RLS auf `tasks`: nur SELECT (admin/manager + staff), **keine** Client-Schreib-Policy.
  - **Bewusste Entscheidung „volle Transparenz":** Staff sehen alle nicht-archivierten Tasks ihrer Standorte **inkl. `manager_admin`** (anlegen dürfen sie `manager_admin` weiterhin nicht). Archivieren ist admin-only (kein `manager`/`tasks.delete`).
  - **Migrationen (alle live):** `…074514`(Enums) · `…074544`(tasks+RLS) · `…074628`(RPCs) · `…075820`(Staff-Policy+claim) · `…080455`(Realtime) · `…081844`(Permission-Defaults) · `…090845`(claim_task-Grant normalisiert) · `…123007`(RPCs auf Caller-Parameter).
  - **Erledigt (21.06.):** End-to-End-Smoke-Test bestätigt (Anlegen → Staff sieht/claimt → Realtime). **Assignee-Filter nach Kategorie** gebaut — reines, getestetes `filter-staff-by-category.ts`. Standort ist über die Quelle (`staffForLocation` im Admin-Board, `listStaffForLocation` im Staff-Board) bereits erzwungen; der Filter narrowt zusätzlich nach Skill/Rolle (`service`/`kitchen` → Skill-Kategorie; `manager_admin`/`maintenance` → Rolle bzw. `other`-Skill).

**Stand 21.06.2026 (Trinkgeld-Reporting, Netto-Fix, Standort-Pillen, Mitarbeiter-Index Teilstand):**

- **Trinkgeld-/Cash-Reporting (Anzeige, Geld-Kern unverändert):** KPI-Kacheln (`SessionFieldsCard`), Trinkgeld-Quote-Spalte (`SettlementsCard`), Kellner-Pool-Anteil (nur nach Tagesabschluss sichtbar), Tip/h pro Pool. Reine Lese-/Anzeige-Logik über den bestehenden `computeSessionTipPoolCore` — keine Persistenz-/Math-Änderung.
- **Netto-Trinkgeld-Korrektur (Geld-Anzeige-Bug, live gefixt):** Kellner-Sicht zeigte „Mein Trinkgeld (netto, Küche ab)" ohne Abzug des Küchenanteils. `differenz_cents` ist brutto, `kitchen_tip_cents` separat. Neue reine, getestete Funktion `waiterNetTipCents(differenzCents, kitchenTipCents) = max(0, differenz − kitchen_tip)` in `waiter-settlement.ts`, verwendet in `abrechnung.tsx`.
- **Standort-Pillen-Refactor:** `LocationPills` + `pill-select` ersetzen die Standort-Dropdowns quer durch die Admin-Routen; Sentinels (`all`, `""`/`__all__`) bleiben erhalten.
- **Mitarbeiter-Index (Teilstand):** Berechtigung als Dropdown via neuer Server-Fn `setStaffRole` — **admin-only, Last-Admin-Schutz** (`wouldRemoveLastActiveAdmin`), org-gescoped, auditiert (`staff.set_role`) — plus Skill-Chips. **Offen:** Abteilungs-Pills (`setStaffLocationDepartment` mit `organization_id` + In-Org-Validierung), Skill-Sperre nach Abteilung als geteiltes `skill-eligibility.ts` (UI + `assignStaffSkills`), Regel „Abteilungs-Entzug blockieren, solange ein abhängiger Skill aktiv ist", sowie `assertStaffInOrg` in `setStaffRole` als Defense-in-Depth.

## 7. Modul M5 — Bestellwesen (bestellung.pro-Migration), Stand 16.06.2026

Quelle der Wahrheit: Legacy `bestellung` (Repo `bestellung-5fff1793`, hat `SYSTEM_BLUEPRINT.md`). In „Wellen" gebaut. Geld = BIGINT cents. Alle Server-Fns Cloudflare-kompatibel (kein Edge-Function, kein SMTP).

| Welle       | Inhalt                                                                                 | Status                                    |
| ----------- | -------------------------------------------------------------------------------------- | ----------------------------------------- |
| Welle 1     | Bestell-Kern (9 Tabellen, atomare RPC `create_order_from_cart`, E-Mail via MailerSend) | ✅ LIVE                                   |
| Welle 2     | Inventur (per-Standort, 2 Lagerorte, Bestandswert)                                     | ✅ LIVE                                   |
| Welle 3-A/B | Wein-Katalog + Quiz (`category='Wein'`, `wine_quiz_scores`)                            | ✅ LIVE                                   |
| Welle 3-C   | KI-Weinrecherche (Firecrawl + Perplexity)                                              | ⏳ offen (optional)                       |
| Welle 4     | EasyOrder (4-A Schema, 4-B Resolver, 4-C UI, 4-D Verwaltung)                           | ✅ Code fertig; Live-Deploy 4-B/C/D offen |
| Stammdaten  | 40 Lieferanten + ~1335 Artikel importiert                                              | ✅ LIVE                                   |

**Historischer Bestell-Import (16.06.2026):** 45 abgeschlossene (`confirmed`) Bestellungen + 367 Positionen aus Legacy `bestellung` nach COCO `orders`/`order_items` importiert (alle Standort YUM, Zeitraum Dez 2025–Mai 2026). Einmaliges Direkt-SQL im Supabase-Editor, NICHT als Migration committet (setzt existierende Lieferanten voraus). Mapping: Lieferanten per Name → COCO-ID (12/12, Legacy-UUIDs nicht erhalten); Standort → YUM; Geld → cents; `order_number` original übernommen. Bewusst NICHT mitgenommen: `pending`-Bestellungen (34); `order_items.article_id` bleibt NULL (Legacy-Artikel-IDs existieren in COCO nicht — `article_name`/`sku`/Preise als Text erhalten); `email_sent`/`confirmed_at`/`delivery_date` (nicht im Export). Verifiziert: 45/367. Optionaler Nachzug offen: Artikel-Verlinkung per Name+Lieferant-Match (separates UPDATE-Skript).

**EasyOrder-Architektur (wichtig):** Staff bestellt vereinfacht über COCOs bestehenden PIN-Login (`validatePin` → echte Supabase-Session via Shadow-User → RLS greift). KEIN Legacy-bcrypt-Edge-Function-Modell (das war die tagesabrechnung-Lücke: PIN ohne Session → keine RLS). An bestehende `staff` gekoppelt (keine `employees`-Tabelle). Tabellen `staff_easyorder_access` + `staff_easyorder_suppliers` (4-A, live, RLS manager+). 4-B `easyorder.functions.ts`: `staffId` IMMER aus `auth.uid` via `loadAdminCaller`, nie vom Client; alle Permission-Checks server-seitig; nutzt die atomare RPC. 4-D `easyorder-admin.functions.ts`: manager-gated, Cross-Org-Validierung (`assertStaffInOrg`/`assertLocationInOrg`/supplier-count).

**Stand 16.06.2026 (Katalog-/Bestell-Umbau, direkt mit Lovable gebaut):**

- **Lieferanten-Seite = alleinige Katalogansicht.** `bestellung.lieferanten.tsx` zeigt Lieferanten als aufklappbare Header mit ihren Artikeln (inkl. „letzte Bestellung"). Separate `bestellung.artikel.tsx` entfernt. Neue Server-Fn `getLastOrderByArticle` (in `orders.functions.ts`): „wer hat bestellt" wird über das `audit_log` aufgelöst (`order.create` → `actor_staff_id`), weil `orders` KEIN `user_id` trägt; ohne Audit-Treffer → „—" (gilt u. a. für die importierten Alt-Bestellungen). Artikel-/Lieferanten-CRUD auf Dialoge umgestellt.
- **Warenkorb-Seite entfernt** (`bestellung.warenkorb.tsx` gelöscht) → ersetzt durch Inline-Cart (`CartDrawer` + `SendOrderDialog`). `/admin/bestellung` leitet jetzt auf `…/lieferanten` (war kurz auf die gelöschte warenkorb-Route → gefixt).
- **Pro-Lieferant-Bestellung:** RPC `create_order_from_cart` um optionalen `p_supplier_id` erweitert — Migration `20260616132808` (DROP+CREATE, SECURITY DEFINER + `search_path`; löscht beim Filter nur die Cart-Items des bestellten Lieferanten). Rückwärtskompatibel (4. Param `DEFAULT NULL`).
- **Auto-Versand pro Mitarbeiter:** neue Spalte `staff.can_easyorder_auto_send` (Migration `20260616140653`, default false). `true` → EasyOrder löst beim Absenden direkt den MailerSend-Versand aus; `false` → Bestellung bleibt `pending`, Admin versendet manuell.
- **MailerSend echt verdrahtet:** `send-order-email.server.ts` schickt an die MailerSend-API, setzt danach `email_sent`/`email_sent_at` + Audit. Secrets: `MAILERSEND_API_KEY` / `MAILERSEND_FROM_EMAIL` / `MAILERSEND_FROM_NAME` (NICHT `FROM_EMAIL`/`FROM_NAME`). Lieferant braucht `suppliers.email`, sonst Fehler.
- **Umbenennungen (Nav):** Tab „Bestellungen" → Lieferanten-Katalog, „Bestellhistorie" → `bestellungen`-Seite.
- **Noch auf Live-DB auszuführen:** Migrationen `20260616132808` + `20260616140653`. Code-Gates grün geprüft (tsc 0, ESLint 0/5, vitest 571).

**Offen M5:** 3-C (optional), Live-Deploy + RLS-CSV-Verifikation von Welle 4 (4-A war live), MailerSend SPF/DKIM in Hostinger-DNS + Secrets `MAILERSEND_API_KEY`/`MAILERSEND_FROM_EMAIL`/`MAILERSEND_FROM_NAME` (Frank-Seite) für echten Mailversand. Niedrige Prio: Lieferanten-Namensvarianten in UI prüfen.

## 8. CI-Befund (15.06.2026): db-integration Schema-Cache-Blocker

Bekanntes Supabase/PostgREST-Problem (Issues #42183, #39446): nach Migrationen kennt der PostgREST-Schema-Cache neue Tabellen/Spalten nicht (PGRST204 `guest_count` / PGRST205 `wine_quiz_scores`). 4 DB-Tests scheitern dauerhaft daran (im Test-SETUP beim `suppliers`-Insert, NICHT in der Logik). 75/79 DB-Tests grün. 4 CI-Fix-Versuche (Container-Restart, Probe-Logik, `db reset`, `pgrst_watch`-Event-Trigger) lösten es im CI nicht. Entscheidung: `db-integration` via `continue-on-error` NON-BLOCKING — läuft + reportet, blockiert aber nicht den grünen Gesamtstatus. `check`-Job (tsc+eslint+vitest) bleibt blockierend. Revisiten wenn Supabase-CLI den Cache-Reload nach `db reset` fixt → `continue-on-error` entfernen. Konsequenz: EasyOrder 4-B/4-D Sicherheits-DB-Tests statisch wasserdicht, aber nicht real in CI bewiesen (scheitern im Setup, nicht an der Logik). Der `pgrst_watch`-Trigger bleibt drin (hilft in Produktion).

**Hinweis CI:** Die 5 tolerierten `react-hooks/exhaustive-deps`-Warnings sind aufgeräumt — `eslint .` ist wieder bei **0 Warnings**. Am 18.06. wurde ein **Format-Job** in der CI ergänzt (prüft Prettier). **Wiederkehrendes Muster:** Lovable überspringt gern `npx prettier --write` → CI wird **nur** an Prettier rot (tsc/vitest grün). Standing Fix: `prettier --write` vor jedem Commit (steht in §3). Optionaler Folgeschritt: husky Pre-Commit-Hook, der `prettier --write` lokal automatisch laufen lässt.
