# Arbeitsweise & Stammdaten-Referenz — COCO

Schlankes Betriebshandbuch für die laufende Entwicklung. Wird bei jedem neuen Baublock konsultiert. Bewusst kurz gehalten — Architektur-Begründungen stehen im gruendungsdokument.md, nicht hier.

Stand: 04.07.2026

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

- **Prettier/ESLint VOR jedem Commit.** Die CI fährt `prettier --check` über das **ganze Repo** (inkl. `docs/`), nicht nur `src/` — genau daran hingen mehrfach rote Runs (tsc/vitest grün, nur Format rot). Jeder Lovable-Prompt endet daher mit diesem Pflicht-Block: „Vor dem Commit: `npx prettier --write .` + `npx eslint --fix src/` über alle geänderten Dateien. Danach müssen `npx tsc --noEmit` (0 Fehler), `npx eslint . --max-warnings=5` (0 Fehler), `npx vitest run` (grün) und `npx prettier --check .` (sauber, **ganzes Repo**) alle durchlaufen. Erst dann committen." → Spart die wiederkehrenden Formatierungs-Nachzieher.
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
- **Neue Stammdaten-Spalte ⇒ Select-Liste mitziehen.** Jede neue Spalte auf `staff_personal_details`, die der Berechnungspfad braucht, MUSS in die explizite `.select(...)`-Liste in `src/lib/lohn/lohn-rechner.functions.ts` (Funktion `computeLohnForStaff`). Migration + Mapping (`staffDetailsToPerson`) + Berechnung allein reichen NICHT: fehlt die Spalte im Select, kommt sie als `undefined` an → `!!undefined = false` bzw. `?? default` → das Feature greift stillschweigend nicht, obwohl Code, Daten und CI grün sind. (Aktivrente-Hebel 26.06.: ~1 h Phantom-Deploy-Suche, bis die fehlende Select-Spalte gefunden war.) Daher nennt jeder Hebel-Prompt mit neuer Spalte die Select-Erweiterung explizit.
- **Vor neuem Tabellen-/Enum-Bau: existierendes Schema UND diese Doku prüfen.** Bevor eine neue Tabelle oder ein neuer Enum entsteht, gegen `src/integrations/supabase/types.ts` greppen (`awk '/^      <tabelle>: \{/,/^      }/' …`) UND Abschnitt 6 / diese Datei lesen — oft existiert der Speicher schon. Beispiel 29.06.: Für Abwesenheits-Overlays wurde kurzzeitig `staff_absences` gebaut, obwohl `roster_absence` / `leave_requests` (Abschnitt 6) Abwesenheiten längst führen → verworfen (siehe Abschnitt 20). Welle-B/C-Direktbauten (Frank+Lovable ohne Claude) existieren auch ohne Claudes Wissen; das prüfe-Protokoll (git pull + `types.ts` + Doku) gilt damit auch fürs **Schema**, nicht nur für Code.
- **Storage-Buckets nie als Migration:** Der Lovable-Migrations-Guard blockiert
  `INSERT INTO storage.buckets` in Migrationsdateien still (`bucket_sql_blocked`
  — so dreimal unbemerkt beim staff-documents-Bucket, 03.07.2026). Buckets
  gehören in `docs/seed-storage.sql` (Ops-Seed, bei DB-Neuaufbau manuell nach
  den Migrationen ausführen). `storage.objects`-Policies sind davon nicht
  betroffen und bleiben reguläre Migrationen.
- **Lovable-Diskrepanz-Meldungen: erst SHA-Beweis, dann glauben.** Zweimal
  am 03.07. meldete Lovable „Prompt kollidiert mit Code-Realität" bzw.
  behauptete „mein Workspace ist identisch mit origin/HEAD (Revert)" —
  beide Male war die Sandbox desynchron und origin unversehrt (frischer
  Clone mit Zeitstempel als Beweis). Regel: Bei jeder Diskrepanz-Meldung
  zuerst `git rev-parse HEAD` des Workspace UND von origin verlangen;
  Claude verifiziert parallel per frischem Clone. Bis zur Klärung darf
  Lovable NICHTS committen (Push aus alter Sandbox wischt neuere Commits
  weg — E1-Muster). Origin ist die Wahrheit, nie die Workspace-Aussage.

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

`admin > manager > staff` (Hierarchie) + zwei **Seitenrollen** (RANK 0 — erben **keine** Hierarchie-Rechte): `payroll` (nur Lesezugriff auf Zeitübersicht/Perioden/Buchhaltung, kein Schreibrecht) und `planer` (Dienstplan-Bearbeitung, aber nur in freigegebenen `(Standort, Bereich)`-Kombinationen via `permission_overrides`; sieht den ganzen Plan, ändert nur den eigenen Scope — Details §25/§26).

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

### tagesabrechnung → COCO Kassen-Mapping (Juni-Nachimport, 29.06.2026)

Rekonstruiert per Kalibrierung gegen bereits validierte Bestands-Sessions (Referenztag 10.06.). Geld = Quellwert ×100 → `*_cents`. **`sessions.id` und `waiter_settlements.id` werden 1:1 aus der Quelle übernommen.**

**Standort:** `restaurant_id` `3065f458-…` → YUM, `a1710390-…` → Spicery. (TSB hat in der Quelle keine Kassen-Sessions.)

**`sessions`:** `pos_total`→`vectron_daily_total_cents`; `session_date`→`business_date`; `guest_count`, `einladung`, `finedine_vouchers`, `vorschuss`, `sonstige_einnahme`, `vouchers_sold/redeemed` → gleichnamige `*_cents`. Konstant gesetzt: `status='open'`, `tip_pool_settlement_only=true`, `opentabs_deduction_cents=0`, `cash_actual_cents`/`opening_balance_cents`=NULL.

**Kanäle (`session_channel_amounts`, je `channel_id`):** `wolt_revenue`→Wolt, `takeaway_total`→Vectron-Takeaway, `ordersmart_revenue`→SOUSE. **Terminals (`session_terminal_amounts`, je `terminal_id`):** `terminal_1_total`→Terminal 1, `terminal_2_total`→Terminal 2, `card_total_gl`→Kredit Karten GL. **Null-Beträge erzeugen keine Zeile.** Diese Tabellen haben **keine** `location_id`-Spalte.

**`waiter_settlements` (eine Zeile je `waiter_shifts`):** `pos_sales`→`pos_sales_cents`; **`kassiert_brutto_cents = pos_sales` (Entscheidung A** — folgt der Live-Wahrheit, nicht dem Quell-Feld `kassiert_brutto`); `card_total`, `cash_handed_in`, `differenz`, `open_invoices`, `kitchen_tip`, `hilf_mahl` → `*_cents`; `kitchen_tip_rate`=0.0200; `status='submitted'`; `submitted_at` aus Quelle. `partner_staff_id`/`second_waiter_name`=NULL, `additional_waiters='[]'`. **Die Tabelle hat keine `location_id`-Spalte.** Zusatzkellner bekommen **keine** Settlement-Zeile.

**`session_tip_pool_entries`:** `hours_minutes = round(hours_worked × 60)`. Service je `waiter_shifts` mit `participates_in_pool=true`; Küche je `kitchen_shifts`. **Zusatzkellner** (`additional_waiters`/`second_waiter_name`) erhalten einen **eigenen** Service-Eintrag mit den Stunden des Primärkellners und `note='Zusatzkellner-Nachimport'`. Die Tabelle hat **keine** `location_id`-Spalte.

**Mitarbeiter-Auflösung:** Quell-`waiter_name`/`staff_name` → COCO `staff_id` über `upper(staff.display_name)` (case-insensitive). Sonderfälle: Login-Form `jirawut.saechiang` → `COCO` (perso 19); `KRIS` → `KRISS` (Quelle schrieb dieselbe Person in zwei Schreibweisen).

**Idempotenz:** Import-SQL nutzt durchgängig `WHERE NOT EXISTS` (gefahrlos mehrfach ausführbar); Kassendetail-Tabellen (`session_card_transactions`/`session_expenses`/`session_bank_deposits`/`session_advances`/`session_register_transfers`) werden für diese settlement-only-Sessions **nicht** befüllt.

**Leere native Hüllen ersetzen (26./27.06., nachgezogen 29.06.):** Beim Nachimport zeigte sich, dass COCO für manche Tage bereits eine **leere native Session-Hülle** führt — die Session existiert, hat aber `vectron_daily_total_cents=0` und 0 Kind-Zeilen. Eine Lückenerkennung über die reine **Session-Existenz** übersieht diese; geprüft werden muss der **Inhalt** (vectron + Zähler von `waiter_settlements`/`session_channel_amounts`/`session_terminal_amounts`/`session_tip_pool_entries`). Betroffen waren YUM 28. sowie YUM **und** Spicery 26.+27. Behandlung = **guarded Replace**: die leere Hülle nur löschen, wenn sie kinderlos ist (`NOT EXISTS` auf alle vier Kind-Tabellen, die eigene Legacy-`id` per `id <> …` ausgenommen), dann die Legacy-Session mit Legacy-`id` einspielen — atomar in `BEGIN…COMMIT`. **Konsequenz für den Go-Live-Re-Import:** Der muss leere native Hüllen **ersetzen**, nicht nur fehlende Tage auffüllen — sonst bleiben Tage mit Null-Umsatz in der Abrechnung sichtbar, obwohl die Legacy echte Zahlen hat.

### Mitarbeiter-Mapping

Über das Nickname in Klammern im thaitime-Vornamen, z.B. „REDACTED" → COCO display_name „REDACTED". Sonderfall: „REDACTED" → REDACTED. „REDACTED" existiert nicht in COCO (ignoriert). Sonderfall Doppel-Nickname GIG: Der bestehende Küchen-„GIG" (perso 360) und der neue Service-„GIG" tragen in thaitime denselben Nickname-Stamm — daher KEIN Auto-Match. „(GIG SERVICE)" ist per Hardcode auf den eigenen Service-Mitarbeiter `staff_id 93e44abe-d1d8-4763-b0a6-63cea7313687` (display_name „GIG SERVIE", Spicery/`service`) gemappt; der Küchen-GIG bleibt unverändert.

## 6. Aktueller Modul-Status (29.06.2026)

| Modul                                                                                                                                  | Status                                                  |
| -------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------- |
| B3 Kasse + B4 Trinkgeld + B5 Tresor                                                                                                    | ✅                                                      |
| B6 Zeitübersicht (Wochenplan/Zusammenfassung/Buchhaltung/Perioden)                                                                     | ✅                                                      |
| B7 Perioden (26.–25.) + Import Jan–Sep 2026                                                                                            | ✅                                                      |
| B8 Lohnbüro-Rolle (payroll)                                                                                                            | ✅                                                      |
| D1 Dienstplan-Datenmodell + Grid                                                                                                       | ✅                                                      |
| D2a–e Dienstplan editierbar, Realtime, Service-Symbole, Cross-Booking                                                                  | ✅                                                      |
| D-8 Eine Einteilung/MA/Tag (Pre-Check + UI-Lock, kein DB-Constraint)                                                                   | ✅                                                      |
| Dienstplan-Migration (Re-Import 17.06.: 3764 · Delta-Nachimport 29.06.: +114 → 3873, inkl. Jul–Sep-Planung + GIG-Service)              | ✅                                                      |
| D3 Display — Token, Auto-Refresh, Einstellungen (Rotation/Bereiche/Header/Legende/Nachricht/QR), Bereichs-Freigabe, Geburtstags-Banner | ✅                                                      |
| M4 Lohn — Rechen-Kern (Stufe 1/3): PAP 2026 + SV, edlohn-cent-getestet                                                                 | ✅                                                      |
| M4 Lohn — SFN-Geld + Perioden-Aggregation + Verdrahtung (Stufe 2a–c)                                                                   | ✅                                                      |
| M4 Lohn — Lohnrechner-UI + Excel-Export (`/admin/lohnrechner`)                                                                         | ✅                                                      |
| M4 Lohn — Perioden-Übersicht (Liste aller aktiven MA je Periode, Klick → Detail)                                                       | ✅                                                      |
| M4 Lohn — Lohnrechner-Übersicht CSV-Export (edlohn-Abgleichs-Datensatz)                                                                | ✅                                                      |
| M4 Lohn — Sachbezug + Mahlzeiten als automatische Lohnarten                                                                            | ✅                                                      |
| M4 Lohn — Soll-Std/Tag-Feld (Vertrags-Soll je MA)                                                                                      | ✅                                                      |
| M4 Lohn — Urlaub/Krank ins Brutto (`lohn_absence_days`, Tage = Vorgabe)                                                                | ✅                                                      |
| Provision (wochenbasiert)                                                                                                              | ✅ P1 Server + P2 UI (E2E-Freigabe Frank ausstehend)    |
| Geofencing-Stempeln (UI clockIn nur am Standort, distinct-Location)                                                                    | ✅                                                      |
| PIN-Login via Vorname/Nickname                                                                                                         | ✅                                                      |
| Hub & Meine Schichten (`/zeit/schichten`, `/zeit/stempeln`)                                                                            | ✅                                                      |
| M-Statistik — Umsatz (S-1/S-2: reine Fn + Server-Fn, Kalendermonat, doppelzählungsfrei)                                                | ✅                                                      |
| M-Statistik — Trinkgeld (S-7: Tagesreihe + Totals + perStaff, Reuse computeSessionTipPoolCore)                                         | ✅                                                      |
| M-Statistik — Personalquote (S-8: Basis-Brutto B2, gültigkeitsdatierter hourly_rate)                                                   | ✅                                                      |
| M-Statistik — UI (Tabs, KPI/Chart, Trinkgeld, Personalquote, Standortvergleich, PDF, freier Zeitraum)                                  | ✅                                                      |
| Inventur-Session an DB gebunden                                                                                                        | ✅                                                      |
| Self-Service Welle B — Freier-Tag-Wunsch (`/zeit/wuensche`)                                                                            | ✅                                                      |
| Self-Service Welle C — Urlaubsanträge + Genehmigung (`/zeit/urlaub`, `/admin/urlaub`)                                                  | ✅                                                      |
| Kasse — Vier-Zeilen-Bargeldblock + Soll-Wechselgeld je Standort                                                                        | ✅                                                      |
| Kasse — Abgleichs-Warnungen (POS-/Terminal-Differenz, `payment_terminals.is_gl`)                                                       | ✅                                                      |
| Trinkgeld-Pool — Küche manuell, Plan-Snapshot, GL-Sicht, Teilnahme-Override (§21)                                                      | ✅                                                      |
| Impersonation („Anmelden als") + granularer Rechte-Tab + Passwort-Flows (ändern/zurücksetzen)                                          | ✅                                                      |
| M4 — Payroll-Policies erweitert (`m4-payroll-permissions.db.test`)                                                                     | ✅                                                      |
| Buchhaltung §3b-Block (`/admin/zeit-uebersicht`, payroll-Tab) inkl. Feiertags-Fix                                                      | ✅                                                      |
| Interne Verbesserungen: `@/lib/format`, DE-Lokalisierung, Skeletons, Identity-Roundtrip                                                | ✅                                                      |
| Refactor: `kasse.tsx` aufgeteilt (2189 → 860 Z., `src/components/cash/*`)                                                              | ✅                                                      |
| Auto-Ausstempeln: verschluckter DB-Fehler in `submitWaiterSettlementCore` gefixt (`if (linkErr) throw`)                                | ✅                                                      |
| PIN-/Passwort-Login gegen PostgREST-Filter-Injection gehärtet (Allowlist `validatePinLoginName`)                                       | ✅                                                      |
| `parseEuroToCents` zentralisiert (eine Impl. in `@/lib/format`; Bestellung-Magnitude-Korrektur)                                        | ✅                                                      |
| Artikel-Suche (`listArticles`) gegen PostgREST-`.or()`-Injection gehärtet (`sanitizeArticleSearchTerm`)                                | ✅                                                      |
| jspdf/pdfjs lazy-geladen (#3-Rest: keine statischen PDF-Imports mehr)                                                                  | ✅                                                      |
| Security-Header / CSP (Report-Only) auf HTML-Responses (`withSecurityHeaders` in `server.ts`)                                          | ✅                                                      |
| Mitarbeiter-Matrix (Stammblatt-Umbau: Standort-Dept-Pills, Skill-Eligibility, Index-Redesign)                                          | ✅                                                      |
| payroll = Büro (Index-Sperre + Dienstplan-Ausschluss, keine 4. Abteilung)                                                              | ✅                                                      |
| Wochenplan → Abrechnungsperioden (26.–25., gemeinsamer Periodenbegriff im Zeit-Screen)                                                 | ✅                                                      |
| Aufräumen: Dead-Code, `makeAuditWriter` zentral, Typ-Single-Source `staff-domain.ts`                                                   | ✅                                                      |
| Rolle „Planer" (P-1..P-3b: scoped Dienstplan-Zugang, Verwaltung, Login-Redirect; Multiblock verworfen)                                 | ✅                                                      |
| M4 Stufe 3a — edlohn-Abgleich Härtung (5 Fixes, GM-Fälle 4–8)                                                                          | ✅ ABGENOMMEN 03.07.2026, HEAD 1a9f0f4, 1008 Tests grün |
| M-BWA Welle F1 — Schema `bwa_monthly`, Quersummen-Kern, Server-Fns, Erfassung (§41)                                                    | ✅                                                      |
| M-BWA Historie-Import Mai 23–Apr 25 (48 Zeilen, Ist=Soll verifiziert)                                                                  | ✅                                                      |
| M-BWA Welle F2a — Dashboard: KPIs+YoY, Prime Cost, Wasserfall, Break-even (§41)                                                        | ✅                                                      |
| M-BWA Welle F2b — Vergleich-Tab, Sachkosten-Drilldown, Break-even-Sortier-Fix (§41)                                                    | ✅                                                      |
| M-BWA Welle F3 — PDF-Upload + eurodata-Parser mit Review-Screen (§41)                                                                  | ✅                                                      |
| M-BWA Welle F4a — Jahresabschluss-Parser + Server-Layer inkl. Gate-Härtung (§49)                                                       | ✅                                                      |
| M-BWA Welle F4b — Jahresabschluss-UI (Upload, Drill-Down, KPIs, Mehrjahres) + Migrations-Nachzug F4a (§49)                             | ✅                                                      |
| Lohn-RLS-Härtung — SELECT manager+ auf lohn_absence_days/lohn_recurring_zeilen (§42)                                                   | ✅                                                      |
| Welle SP1 — Self-Service Stammdaten & Dokumente: Schema + Server-Layer (§43)                                                           | ✅                                                      |
| Welle SP2 — Mitarbeiter-UI `/profil` (Kontakt direkt, Anträge, Dokumente) (§43)                                                        | ✅ (SP3 Admin-Review offen)                             |

**Juni-Kassenlücke geschlossen (29.06.2026):** YUM (16., 18.–25.) und Spicery (16., 18.–25., 28.) aus `tagesabrechnung` nachimportiert — 19 Sessions; das leere native YUM-28 durch Legacy-Daten ersetzt. `vectron_daily_total_cents` 19/19 gegen die Quelle verifiziert. Mapping siehe Abschnitt 5.

**⚠ Offen bei COCO-Go-Live (Wiederholung des Imports):** COCO läuft derzeit nur als **Test**; `tagesabrechnung` ist weiterhin **live** und im Produktivbetrieb. Beim Umschalten von COCO auf live müssen **alle bis dahin in COCO fehlenden Tagesabrechnungen erneut** aus `tagesabrechnung` nachgezogen werden (nicht nur die Juni-Lücke). Das Mapping und das idempotente Import-Verfahren (`WHERE NOT EXISTS`) stehen in Abschnitt 5 und sind 1:1 wiederverwendbar — pro Durchlauf nur die fehlenden Session-IDs/Tage neu exportieren und einspielen.

**Stand 26.06.2026 (Lohnrechner — Perioden-Übersicht):**

- **Geteilter Rechen-Kern (`lohn-rechner.functions.ts`):** Der Pro-MA-Zusammenbau (`aggregateSfnPeriod` → `staff_personal_details` → `staffDetailsToPerson` → Entgeltzeilen → `berechneLohn`) wurde aus `berechneLohnFuerMitarbeiter` in den privaten Helper `computeLohnForStaff(supabaseAdmin, { staffId, fromDate, toDate, mode, zusatzZeilen })` extrahiert. **Einzelansicht und Übersicht rechnen über denselben Helper** — kein zweiter Rechenpfad, kein Drift. Reine Code-Verschiebung (Golden-Master + `lohn-core` unverändert grün → verhaltensgleich). Rückgabe-Shape von `berechneLohnFuerMitarbeiter` bleibt 1:1.
- **Neue read-only serverFn `berechneLohnUebersicht`** (`payroll.calc.run`, `loadAdminCaller(["admin","payroll"])`, org-scoped): rechnet **alle aktiven MA** einer Periode. Schleife mit **`try/catch` pro MA** — ein MA ohne `staff_personal_details` erscheint mit „—" + Hinweis statt die ganze Liste abzureißen (die Einzelansicht wirft dort weiterhin bewusst). Übersicht rechnet **ohne** manuelle Zusatzzeilen (rohe Perioden-Rechnung); Zeilen liefern `totalHours`, `hourlyRateCents`, `zuschlagCents`, `bruttoCents`, `nettoCents`, `auszahlungCents`.
- **UI `/admin/lohnrechner`:** Perioden-Dropdown (26.–25., aus `listPeriods`) **ersetzt** die freien Von/Bis-Felder; Default = neueste Periode. Übersichts-Tabelle mit Spalten **Mitarbeiter · Stunden · Stundenlohn · Zuschläge · Brutto · Netto · Auszahlung**. **Klick auf eine Zeile** öffnet die **unveränderte** Detailansicht (Zeilen, Person, Ergebnis, Excel-Export, Zusatzzeilen) für den MA; Fehlerzeilen sind nicht klickbar. Altes Staff-Dropdown entfernt.
- **Gates:** `tsc`/`eslint --max-warnings=5`/`prettier`/`vitest` (743) grün. Kein Schema-/RLS-/Migrations-Eingriff (read-only über `supabaseAdmin` hinter Permission-Gate).

**Stand 26.06.2026 (M4 Lohn — Übersichts-CSV + edlohn-Abgleich: Sachbezug/Mahlzeiten, Soll-Std/Tag, Urlaub/Krank ins Brutto):**

- **CSV-Export der Lohnrechner-Übersicht (`/admin/lohnrechner`):** voller Abgleichs-Datensatz für den edlohn-Vergleich. Reines Modul `src/lib/lohn/lohn-csv-export.ts` (`buildUebersichtCsv`, getestet): `perso_nr` (= edlohn-Personal-Nr., Join-Schlüssel), SFN-Topf-Stunden, alle Steuer-/SV-Cent-Felder. UTF-8-BOM, `;`-getrennt, Geld als Cent-Ganzzahl, Kommentar-Headerzeile mit Periode. Download über `downloadBlob` — **nicht** über eine vorab im State erzeugte Object-URL (die wird vom React-Query-Refetch widerrufen → toter `blob:`-Link; Fix-Lektion).
- **Sachbezug + Mahlzeiten als automatische Lohnarten** (Migration `20260626104055`: `staff_personal_details.meal_allowance bool default true` + `sachbezug_monthly_cents int default 0`). Reines Modul `src/lib/lohn/fixed-zeilen.ts` (`buildFixedZeilen`, `mahlzeitSachbezugCent(year)`, `countDistinctWorkdays`, getestet). Sachbezug = fixer Monatsbetrag pro Person (50 € als Flag; perso 1,11,25,129,309 = 0). Mahlzeiten = distinct Arbeitstage × amtl. Sachbezugswert (2026 = 4,57 €, 2025 = 4,40, 2024 = 4,13; jahres-gemappt, 16. SvEV-ÄndVO v. 19.12.2025). `lohn-core.ts` behandelt beide Kategorien (`sachbezug_frei`/`mahlzeiten_paust`) bereits korrekt (ins Gesamtbrutto, RAUS aus St-/SV-Brutto, am Ende als geldwerter Vorteil abgezogen) — es fehlte nur das automatische Erzeugen. CSV um `arbeitstage`/`mahlzeiten_cent`/`sachbezug_cent` erweitert. Cent-genau gegen edlohn verifiziert.
- **Soll-Std/Tag-Feld** (Migration `20260626114245`: `staff_personal_details.soll_hours_per_day numeric default 8`). Vertragliche Soll-Stunden/Arbeitstag (8/7/6) — **nicht** der Ist-Schnitt: edlohn rechnet die Urlaub/Krank-Basis mit dem Vertrags-Soll (lange Ist-Schichten verzerren den Durchschnitt).
- **Urlaub/Krank ins Brutto** (Migration `20260626121324`: Tabelle `lohn_absence_days(staff_id, organization_id, period_start, urlaub_tage, krank_tage)`; RLS SELECT own-org, write manager+):
  - **Tagezahl = Franks Vorgabe.** Der Dienstplan rotiert → keine festen Arbeits-Wochentage; die genaue Tagezahl ist Franks manuelles Urteil. Frank pflegt sie pro Periode (`period_start` = Periodenbeginn, z. B. `2026-04-26` für „Mai 2026") per SQL in `lohn_absence_days`. COCO rechnet nur Basis + Zuschlag darauf.
  - **4 steuerpflichtige `zeitlohn`-Zeilen** (analog edlohn-Abrechnung) aus `src/lib/lohn/urlaub-krank-zeilen.ts` (`buildUrlaubKrankZeilen`, getestet): Urlaubsstunden + Zuschlag Urlaubsentgelt (3M-Ø), Lohnfortzahlung Krankheit + Zuschlag Krank (3M-Ø). Beide St=L/SV=L (Kategorie `zeitlohn`, **nicht** `zuschlag_frei`): SFN-Zuschläge in Urlaub/Krank sind voll steuer-/SV-pflichtig (§3b EStG nur für tatsächlich geleistete Arbeit; fortgezahlte Zuschläge = Phantomlohn, BSG 2024).
  - **Basis** = Tage × Soll-Std/Tag × Stundensatz (aus `staff_compensation`, auch bei 0 Ist-Stunden vorhanden) → cent-genau gegen edlohn.
  - **Zuschlag** = Tage × 3-Monats-Ø SFN/Tag. Der 3M-Ø kommt aus `urlaub-krank-diagnose.ts`/`urlaub-krank-core.ts` (read-only): Fenster 91 Tage vor Periodenbeginn, SFN-Geld ÷ (gearbeitete + eigene Abwesenheitstage). **Den Nenner um die eigenen Abwesenheitstage zu erweitern war der Schlüssel** — sonst ist der Schnitt bei zuletzt viel-abwesenden MA ~2× zu hoch. Liegt ±~15 % an edlohn (edlohns interne 3M-Glättung nicht bit-genau nachbaubar; bewusst „nah").
  - **CSV:** `urlaub_tage`/`krank_tage` (verwendet) + `urlaub_tage_est`/`krank_tage_est` (COCO-Schätzung als Befüll-Hilfe) + `avg_std_tag`/`avg_sfn_tag_cent`.
- **End-to-End-Abgleich (Mai 2026):** 9/11 Abwesenheits-MA innerhalb ±1 % St-Brutto gegen edlohn. Ausreißer perso 23 (+98 %) und 317 (+22 %) sind die separaten Midijob-/Stundenkürzungs-Lücken (COCO rechnet volle Ist-Stunden, edlohn gekürzt), **nicht** die Abwesenheitszahlung.
- **Verifizierter Stand:** HEAD `a753cf0` — `tsc`/`format:check`/`eslint --max-warnings=5`/`vitest` (765) grün.
- **Noch offen am edlohn-Abgleich** (separate Hebel, kartiert): Midijob-Übergangsbereich-SV (perso 17,23,117,334,358), `hourly_rate_2`/Doppelsatz, StKl 5/6 (PAP), Provision (wochenbasiert), Nischen (GF-Tantieme/bAV, Aktivrente).

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
- **Dienstplan-Delta-Nachimport (29.06.: +114 → 3873):** Additiver Nachimport (Mode A) der seit dem 17.06.-Re-Import in thaitime hinzugekommenen Plan-Schichten. 3711 von 3825 thaitime-Zeilen trafen exakt bestehende COCO-Keys (Mapping 1:1 bestätigt); 114 echte Lücken (Spicery 107, YUM 7; Küche 89 / Service 25; Planungshorizont Jun–Sep, Aug + Sep vorher 0). Idempotent via `ON CONFLICT (staff_id, location_id, shift_date, area) DO NOTHING` in `BEGIN…COMMIT`, alle `status='confirmed'`. **Neuer MA „GIG SERVICE":** trägt in thaitime denselben Nickname-Stamm wie der bestehende Küchen-GIG (perso 360) → KEIN Auto-Match, sondern eigener COCO-MA (`93e44abe-d1d8-4763-b0a6-63cea7313687`, „GIG SERVIE", Spicery/`service` in `staff_locations`) + Hardcode-Mapping „(GIG SERVICE)" → diese `staff_id` (18 Schichten). **Lektion:** Delta gegen validierte Bestands-Keys kalibrieren statt raten; Doppel-Nicknames (Gig Küche vs. Service) per Hardcode trennen, sonst zieht der Auto-Resolver beide auf denselben MA; Kalibrier-CSVs mit JOIN-Spalten täuschen echte Tabellen-Spalten vor → vor jedem INSERT `select *` einer Referenzzeile prüfen.

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
  - **D-M2-1 Auto-Ausstempeln bei Abrechnungs-Abgabe** — ✅ umgesetzt (§27): Die Abgabe stempelt Stempler automatisch aus und setzt für Nicht-Stempler das Service-Pool-Ende aus dem Abgabezeitpunkt („Ablauf B"). Damit stempelt das Service-Team in COCO um.
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

**Stand 21.06.2026 (Abend, Session-Nachzug — Mitarbeiter-Matrix, payroll=Büro, Wochenplan-Perioden, Aufräumen):**

- **Mitarbeiter-Matrix abgeschlossen** (schließt den „Mitarbeiter-Index (Teilstand)"-Block oben ab — die dort als _offen_ genannten Punkte sind jetzt erledigt):
  - **Abteilungs-Pills je Standort:** Server-Fn `setStaffLocationDepartment` (toggelt eine `(staff_id, location_id, department)`-Zeile, `organization_id`, In-Org-Validierung via `assertStaffInOrg`/`assertLocationInOrg`, auditiert).
  - **Skill-Eligibility als geteiltes reines Modul** `src/lib/admin/skill-eligibility.ts` (`isSkillCategoryEligible`/`ineligibleSkills`/`distinctDepartments`, getestet) — genutzt von UI **und** `assignStaffSkills`.
  - **Regel (a) „Abteilungs-Entzug blockieren, solange ein abhängiger Skill aktiv ist":** `setStaffLocationDepartment` wirft **vor** dem DELETE, wenn dadurch ein gehaltener Skill verwaisen würde — kein stilles Skill-Entfernen, kein Cascade.
  - **`setStaffRole` gehärtet** mit `assertStaffInOrg` (Defense-in-Depth).
  - **Index-Redesign** (`staff.index.tsx`, UI-only, Vorlage bunker `StaffMatrixView`): Hero-Kopf mit Zählern, Suche, Filter-Tabs (Alle/Service/Küche), **Spalte je Standort** (alle 3 Org-Standorte — behebt „letzte Abteilung verschwindet"), inline farbige Skill-Chips (`skill.color`-Hex, **nicht** `hsl(var(--…))`), optimistische Updates + Fehler-Toasts.
- **payroll = Büro (Entscheidung):** Eine „Büro"-Kraft braucht **keine** Bereiche/Skills und gehört **nicht** in Dienstplan/Zeiterfassung — das ist exakt die bestehende **`payroll`-Rolle**, **kein** 4. Department. Der „Büro-als-Abteilung"-Ansatz wurde verworfen.
  - **Im Index:** `payroll`-MA → Dept-Pills deaktiviert (—), Skills-Zelle „Lohnbüro – keine Bereiche/Skills" (nicht-destruktiv, Daten bleiben).
  - **OR-gehaltene-Skills-Filter:** im Index nur Skill-Chips, deren Kategorie zu einer Abteilung des MA passt **oder** die der MA bereits hält (Hausmeister/`other` nur sichtbar/entfernbar, wenn gehalten).
  - **Roster-Ausschluss (b2):** `getStaffForRoster` (`roster.functions.ts`) filtert payroll-Staff jetzt **per Rolle** aus dem Dienstplan-Grid. **Abgrenzung zur Notiz vom 18.–19.06.** („Sichtbarkeit hängt an `staff_locations`, nicht an der Rolle"): Der **Dienstplan** hat damit jetzt zusätzlich einen **Rollen-Filter**; die **Zeitübersicht/Zeiterfassung bleibt bewusst rollen-ungefiltert** — sonst verschwänden echte historische Stunden einer Person, die später payroll wurde.
- **Wochenplan → Abrechnungsperioden (26.–25.):** Der Wochenplan-Tab in `zeit-uebersicht.tsx` war der **einzige** Tab noch am Kalendermonat. Jetzt hängt er am bereits vorhandenen `selectedPeriodId`/`effectivePeriodId`/`selectedPeriod` (gemeinsam mit Zusammenfassung/Buchhaltung/Perioden) → **ein** Periodenbegriff für den ganzen Zeit-Screen, wie der Dienstplan. Wochen-Chips spannen den 26.–25.-Zyklus (`periodWeeks`); ein Sync-Effekt (`useEffect`, Deps nur `[effectivePeriodId]`) hält `weekStart` immer in der gewählten Periode; „Heute" zieht die Periode mit. `selectedMonth`/`monthOptions`/`monthWeeks` entfernt. **Reine UI, keine Migration.**
- **Aufräum-Refactors (abgenommen, grün):**
  - Toter Code entfernt (`example.functions.ts`, `config.server.ts`).
  - `makeAuditWriter` aus den Einzeldateien nach `src/lib/admin/audit.ts` zentralisiert.
  - `fmtCents`-Duplikat in `trinkgeld-rest.tsx` durch Import aus `@/lib/format` ersetzt (`pdfExport.ts` `fmtEur` bewusst belassen — anderes Format).
  - **Typ-Single-Source `src/lib/staff-domain.ts`** für `StaffDepartment`/`SkillCategory`; die Hubs (`skill-eligibility`, `skills.functions`, `tip-pool`, `import-assignments`) importieren/re-exportieren daraus.
- **Lektion „Reverted to commit X":** Ein Lovable-Revert auf einen älteren Commit nimmt **alle** dazwischenliegenden Commits mit — hier kollateral die Typ-Konsolidierung (`staff-domain.ts`), die danach sauber wiederhergestellt wurde. Bei „Reverted to commit X" im Log künftig immer `git diff X..HEAD --stat` prüfen, was wegfällt.
- **Lektion „Januar-Zeitdaten nicht sichtbar" (kein Bug):** Die Daten sind vollständig in der DB (660 Januar-`time_entries`: YUM 359 + spicery 301, alle mit `ended_at` + korrekter `location_id`; Woche 26.01. hat 70 spicery-Einträge). Die leere Wochenplan-Woche im Screenshot war ein **veralteter Preview-Build**, kein Code-Fehler. Vorgehen bei „Daten fehlen": erst per SQL gegen die DB prüfen, bevor man im Code jagt.
- **Verifizierter Stand:** HEAD `b5b6a40` — `tsc`/`eslint --max-warnings=5`/`prettier`/`vitest` (738) grün.

## 7. Modul M5 — Bestellwesen (bestellung.pro-Migration), Stand 16.06.2026

Quelle der Wahrheit: Legacy `bestellung` (Repo `bestellung-5fff1793`, hat `SYSTEM_BLUEPRINT.md`). In „Wellen" gebaut. Geld = BIGINT cents. Alle Server-Fns Cloudflare-kompatibel (kein Edge-Function, kein SMTP).

| Welle       | Inhalt                                                                                 | Status                                    |
| ----------- | -------------------------------------------------------------------------------------- | ----------------------------------------- |
| Welle 1     | Bestell-Kern (9 Tabellen, atomare RPC `create_order_from_cart`, E-Mail via MailerSend) | ✅ LIVE                                   |
| Welle 2     | Inventur (per-Standort, 2 Lagerorte, Bestandswert)                                     | ✅ LIVE                                   |
| Welle 3-A/B | Wein-Katalog + Quiz (`category='Wein'`, `wine_quiz_scores`)                            | ✅ LIVE                                   |
| Welle 3-C   | KI-Weinrecherche (Firecrawl + Perplexity)                                              | ⏳ offen (optional)                       |
| Welle 4     | EasyOrder (4-A Schema, 4-B Resolver, 4-C UI, 4-D Verwaltung)                           | ✅ Code fertig; Live-Deploy 4-B/C/D offen |
| Welle E1    | Einheitenmodell (Bestell-/Inventureinheit, Faktor, Snapshots, Bar/Trockenlager)        | ✅ LIVE (03.07.2026)                      |
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

**Lektion (30.06.2026):** Die CI fährt `prettier --check .` über das **ganze Repo** (inkl. `docs/`), nicht nur `src/`. Lokale Prüfung daher ebenfalls mit `prettier --check .` — ein Check nur über `src/**/*.{ts,tsx}` übersieht Doku-Format-Drift, der die CI rot hält (so geschehen: ~9 rote Runs allein wegen unformatierter `arbeitsweise.md`, während `src/` grün war).

## 9. Sicherheits-Härtung #1–#3 (24.06.2026)

Sicherheits-Durchgang nach einem externen Review (ChatGPT, gegen einen Repo-Snapshot), von Claude gegen den echten Code kalibriert. Drei echte Lücken geschlossen, alle Atomaritäts-/Cross-System-Pfade abgesichert. Gates durchgehend grün (tsc, eslint 0/5, prettier, 738 Tests).

**Geteilter Guard:** neue Datei `src/lib/admin/org-guards.ts` mit `assertStaffInOrg(staffId, organizationId)` (lazy `supabaseAdmin`, wirft „Mitarbeiter nicht in dieser Organisation."). Aus `staff.functions.ts` extrahiert, wird von mehreren Pfaden genutzt.

| Fix | Inhalt                                                                                                                                                                                                                                                                                                                                                            | Migration        |
| --- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| #1  | `create_order_from_cart` (4-arg-Overload) war `SECURITY DEFINER` + `GRANT … authenticated` → direkt aufrufbar (IDOR + Audit-Bypass). `REVOKE` von PUBLIC/anon/authenticated, `GRANT` nur `service_role` (wie 3-arg-Variante). App ruft über `supabaseAdmin` → keine Breakage.                                                                                     | `20260622063557` |
| #2a | PIN: `setPin` von Delete+Insert auf **atomares Upsert** (`onConflict: "staff_id"`, `staff_pins.staff_id` ist `NOT NULL UNIQUE`) + `assertStaffInOrg` davor; `clearPin` Guard ergänzt.                                                                                                                                                                             | — (nur TS)       |
| #2b | `replace_staff_skills` / `replace_staff_role` / `replace_staff_locations` — Delete+Insert je in **einer** Transaktion, org-gefilterte Inserts. Schließt latente Cross-Org-Lücke in Skills/Standorten (hatten keinen Guard).                                                                                                                                       | `20260624194327` |
| #2c | `save_cart_as_draft` / `load_draft_into_cart` — Draft↔Cart-Kopieren komplett in DB-Transaktion, hart auf `(organization_id, user_id)` gescoped (schließt #5 Cart-Besitz für diese Pfade).                                                                                                                                                                         | `20260624195337` |
| #2d | `link_account_to_staff` — DB-Teil der Konto-Erstellung (user_links-Insert + staff-Update) atomar. `createStaffAccount` kompensiert bei RPC-Fehler den zuvor erstellten Auth-User (`auth.admin.deleteUser`, best-effort) → **kein verwaister Auth-User**. `resetStaffPassword` bewusst unverändert (harmloser Failure-Mode; Kompensation wäre schlechter als Ist). | `20260624200904` |
| #3  | `setPermissionOverride` / `clearPermissionOverride` org-scharf: Aufrufer-Org via `current_organization_id()` → `assertStaffInOrg` vor dem Schreiben. `getStaffPermissions` war bereits org-scharf (Fehlalarm).                                                                                                                                                    | — (nur TS)       |

**RPC-Muster (verbindlich für solche Fixes):** `SECURITY DEFINER` + `SET search_path = public` + staff-in-org-Guard + org-gescopter Delete + org-gefilterter Insert + `REVOKE ALL FROM PUBLIC, anon, authenticated` + `GRANT EXECUTE TO service_role`. Danach **Supabase-Types regenerieren**, sonst ist der `rpc("…")`-Aufruf nicht typsicher (tsc rot).

**Prinzip (teuer gelernt, gilt weiter):** Unter `service_role` ist `auth.uid()` **NULL** — keine `auth.uid()`-Checks in service_role-aufgerufenen SECURITY-DEFINER-Funktionen. `staffId`/Org kommen immer aus dem Aufruferkontext (`loadAdminCaller`), nie vom Client.

**Kalibrierung (als Fehlalarm verworfen, dokumentiert):**

- `hasPin` über `staff_pins`-Embed ist korrekt (To-One → Objekt/null, kein Array-Bug).
- Ein `UNIQUE(staff_id, shift_date)` auf `roster_shifts` wäre eine **Design-Regression** — Cross-Booking über Bereiche/Standorte ist **absichtlich** nur ein advisory roter Punkt, kein harter Block.
- `.env` ist zwar eingecheckt, enthält aber nur den publishable/anon-Key + domain-beschränkten Maps-Key (kein `service_role`/Secret) → niedrige Priorität.

**Offen — Härtungs-Backlog (Defense-in-Depth, keine offene Lücke):** Display-Token `Referrer-Policy: no-referrer` + Rotation; `search_path`-Härtung breiter ausrollen; Composite-FKs `(organization_id, location_id)`; Check-Constraints (qty>0, cents≥0 — nuanciert, manche Beträge legitim negativ); db-security-Tests blockierend machen (aus dem flaky `db-integration`-Job herauslösen); Bun-Version pinnen.

## 10. Zeit-Re-Import März–Juni 2026 + location_id-Reparatur (26.06.2026)

Arbeitszeiten der Perioden **März–Juni 2026** wurden aus der Legacy-`tagesabrechnung` (`zt_shifts`) neu nach COCO `time_entries` importiert (über `/admin/migration`), weil die Quelldaten korrigiert wurden. Der Import **ersetzt** bestehende Import-Zeilen periodenweise. Danach war eine **location_id-Reparatur** nötig (siehe Lektion unten).

### Ergebnis (alle Perioden verifiziert: Zeilen = distinct import_keys, Stunden = Quelle ± Rundung)

| Periode | Zeitraum      | Zeilen | Std (COCO) | Std (Quelle) |
| ------- | ------------- | ------ | ---------- | ------------ |
| März    | 26.02.–25.03. | 649    | 5261,73    | 5261,79      |
| April   | 26.03.–25.04. | 699    | 5675,67    | 5675,67      |
| Mai     | 26.04.–25.05. | 676    | 5464,57    | 5464,55      |
| Juni    | 26.05.–25.06. | 670    | 5369,38    | 5369,40      |

Wasserlinie (`organization_settings.time_locked_through_date`) steht auf 25.06. Übersprungene Quell-Zeilen pro Periode sind legitime Leer-Platzhalter (0 h, keine Zeiten) + Abwesenheiten (Urlaub/Krank).

### Verbindliche Prozedur pro Periode

1. **Export + Sanity** (tagesabrechnung-DB): **16**-Spalten-SELECT aus `zt_shifts` JOIN `staff` ON `staff.id = zt_shifts.employee_id`; `ohne_staff_match` muss **0** sein. Die 16. Spalte `restaurant` wird **pro Schicht** über die Kette `zt_shifts.week_id → weeks.period_id → scheduling_periods.restaurant_id → restaurants.name` abgeleitet (für die 8 Mehrhaus-Fälle ist das das einzige verlässliche Per-Schicht-Signal — **nicht** der Heimatstandort des MA).
2. **Dry-Run** auf `/admin/migration`.
   2a. **Standort-Gate im Dry-Run**: Der Zähler **„ohne Standort"** (`importedWithoutLocation`) muss **0** sein. Ist er > 0, fehlt/ist falsch die Export-Spalte `restaurant` (oder ein Name matcht keine COCO-`locations`-Zeile) → **nicht committen**, Export korrigieren.
3. **Gescopter DELETE** der alten Import-Zeilen in COCO (`source='import'` + `business_date`-Range) — **niemals** `clock`/`manual` anfassen — **mit Rest-Check im SELBEN Editor-Lauf**.
4. **Commit erst wenn Rest = 0.**
5. **Endcheck**: `count = distinct import_keys = erwartete Zeilenzahl`.
6. **Stunden-Abgleich** gegen die Quelle.

### Lektionen (teuer gelernt)

- **„Success. No rows returned" sagt NICHTS über betroffene Zeilen.** DELETE + Rest-Check immer in **einem** Editor-Lauf ausführen; **nie committen, solange Rest ≠ 0** (einmal beinahe doppelt importiert, weil ein DELETE in einem anderen Tab/Connection lief).
- **Der Importer setzt KEIN `location_id`.** Re-importierte Zeilen hatten `location_id = NULL` und waren dadurch im Wochenplan **unsichtbar** — `getWeeklyTimeEntries` (in `src/lib/time/time-admin.functions.ts`) filtert strikt `.eq("location_id", …)`, und „Alle" lädt pro Standort und merged. NULL-Location-Zeilen erscheinen nirgends.
- **location_id-Backfill-Mechanik** (einmalig, manuell per SQL — nicht im Importer):
  - **34 Single-Location-Mitarbeiter**: neue NULL-Zeilen bekamen den (einzigen) Standort ihrer bestehenden Zeilen kopiert (`HAVING count(DISTINCT location_id) = 1`). UUID-Aggregat über `(min(location_id::text))::uuid` — `max(uuid)` existiert nicht.
  - **8 Mehrhaus-Fälle** (DEAU, Elson, EM, MO, SUMITR, GUNG, NET + BIG): Standort **pro Schicht** aus der Quell-Kette abgeleitet — `zt_shifts.week_id` → `weeks.period_id` → `scheduling_periods.restaurant_id` → `restaurants.name`. Die **Abteilung disambiguiert NICHT** (alle arbeiten dieselbe Abteilung an beiden Häusern); die scheduling_period ist das einzige verlässliche Per-Schicht-Signal. Mapping auf COCO über `import_key = 'tagesabrechnung:' || zt_shifts.id`, dann gezieltes UPDATE (nur `source='import' AND location_id IS NULL`).
  - Endstand: **0** Import-Zeilen ohne `location_id`.

### Offen

- **Importer setzt `location_id` jetzt beim Import** (erledigt): optionale CSV-Spalte `restaurant` → `resolveLocationId()` (rein, case-insensitiv, getrimmt; `null` bei Miss) gegen die `locations`-Namens-Map der Org. Neuer Zähler `importedWithoutLocation` macht NULL-Location-Zeilen im Dry-Run/Commit sichtbar (Badge „X ohne Standort" im Migrations-UI). **Voraussetzung:** der Export liefert die 16. Spalte `restaurant` pro Schicht (s. Prozedur). Der frühere manuelle location_id-Backfill ist nur noch **Fallback**, falls versehentlich ein alter 15-Spalten-Export ohne `restaurant` benutzt wurde (dann zeigt der Dry-Run `importedWithoutLocation > 0`).

### Vollständigkeits-Abschluss (04.07.2026)

**Jan+Feb 2026 waren bereits importiert** (früherer, hier zuvor nicht
dokumentierter Lauf) — heute zeilengenau verifiziert: COCO source='import'
umfasst 26.12.2025–25.06.2026 mit 4019 Zeilen = Quelle aller sechs Perioden
(4085) minus 66 legitime Leer-/Abwesenheits-Zeilen (Jan 1, Feb 65).
Stunden-Abgleich: 2026-01 = 648 Zeilen/5345,00 h, 2026-02 = 677/5450,50 h —
exakt Quelle. Die Legacy-Historie beginnt am 26.12.2025; davor existiert
nichts.

**Lücken-Schluss 26.–29.06.2026:** Zwischen Import-Ende (25.06.) und
Pool-Writeback-Start (30.06., §51) fehlten vier Tage. Per §10-Prozedur
geschlossen (Export 16 Spalten, /admin/migration, Run-ID 40865e29-…):
gelesen 76 / importiert 75 / übersprungen 1 (invalid_time = Abwesenheit
28.06. ohne Zeiten). Verifiziert pro Tag: 20/156,77 · 19/156,68 · 17/133,83
· 19/153,25 = 75 Einträge / 600,53 h (Quelle 600,49 — Rundungsrauschen).
Der Importer zog die Zeit-Wasserlinie automatisch auf den 29.06. nach.

**Neue harte Regel:** Die Import-Obergrenze ist der Pool-Writeback-Start
(30.06.2026). Ab diesem Datum erfasst COCO selbst (clock/pool/manual) —
ein zt_shifts-Import darüber hinaus wäre Doppelzählung im Lohn und ist
VERBOTEN. Die Legacy-Zeiterfassung ist damit Archiv; die COCO-Zeit-Historie
ist lückenlos vom 26.12.2025 bis heute.

## 11. Modul M4 — edlohn-Cent-Abgleich Juni 2026 (26.06.2026)

COCO-Lohnrechner cent-genau gegen die offizielle edlohn-Abrechnung Juni 2026 (Mandant 09290/205, 39 MA) abgeglichen. Methode: CSV-Export `/admin/lohnrechner` (simple) ↔ edlohn-Referenz, Diff je Spalte. Standard-Kohorte deckungsgleich (Rest <0,3 % Rundungsrauschen — COCO rundet SFN/Stunden minimal niedrig, immateriell). Sonderfälle als „Hebel" abgearbeitet.

### Datenfixes (reine Stammdaten, Produktion)

- `kk_zusatzbeitrag` für 33 GKV-MA gesetzt → KV cent-genau.
- `lohn_absence_days` (Urlaub/Krank-Tage) für 10 MA.
- `soll_hours_per_day` korrigiert (Perso 23, 117, 334).
- `tax_class`: 11→VI, 352→IV, 358→V.
- `children_count`/`has_parent_status` (Treiber-C, PV-Sätze) für Eltern inkl. 331 (1 Kind).
- `date_of_birth`-Fix (25, 27).
- `is_minijob = true` (12, 20).
- Perso 27 (NET = Narunet Dannerbeck): war `perso_nr = null` („Steuerklasse fehlt") → repariert (perso_nr, tax_class IV, kk_zusatzbeitrag).

### Code-Hebel (Lovable, CI-grün, deployt)

| Hebel               | MA                | Status | Mechanik                                                                                                                                         |
| ------------------- | ----------------- | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| StKl 6              | 11                | ✅     | reine Daten (`tax_class` I→VI)                                                                                                                   |
| Pauschal-Minijob    | 12, 20            | ✅     | `zeitlohnKategorie()` → erste Zeile `aushilfe_paust`; RV = 3,6 % Aufstockung; KV/AV/PV/LSt = 0                                                   |
| Aktivrente          | 100, 331          | ✅     | neue Spalten `rv_frei`/`av_frei`/`lst_freibetrag_monat_cent`; RV/AV-Befreiung in `svBeitraege`; Freibetrag via `freibetragCent` → PAP `LZZFREIB` |
| Midijob/Werkstudent | 17,23,117,334,358 | ✅     | Übergangsbereich `midijobBemessungCent` (UG=603/OG=2000) + Werkstudent (`kv_frei`/`av_frei`/`pv_frei`); s. §12                                   |
| Privat-KV/GF        | 1, 109, 309       | 🔄     | SV (Ph.1) + Brutto/St-SV-Split (Ph.3) ✅; LSt-Vorsorgepauschale (Ph.2) offen; s. §12                                                             |
| Doppelsatz          | 320, 352          | ⏸️     | zurückgestellt — COCO kennt keine Rate-1/Rate-2-Attribution; Lösung später per `lohn_second_rate_hours`-Tabelle                                  |

Aktivrente-Detail: DEAU (100) voll RV+AV-frei + Freibetrag 2000 €/Monat; NOK (331) nur AV-frei + Freibetrag, RV bleibt. `is_sv_exempt` (Alt-Spalte) bleibt unverdrahtet — zu grob (RV ≠ AV). Mini-Rest DEAU: KV +7,29 = ermäßigter Satz 14,0 % (Rentnerin ohne Krankengeld) → späterer Bool `kv_ermaessigt`.

### Lektionen (teuer gelernt)

- **Neue Spalte ⇒ Select-Liste** (s. Abschnitt 3). Ursache der Aktivrente-Phantomsuche.
- **Green CI ≠ live.** Produktion braucht ggf. expliziten Publish/Redeploy in Lovable; neuer Commit triggert frischen Cloudflare-Build (~5–8 Min, nicht zu früh exportieren).
- **Export nur aus eigenständigem `…lovable.app`-Tab** — der eingebettete Preview-iframe blockiert CSV-Downloads (Sandbox).

## 12. Modul M4 — Hebel-Fortschritt, Forts. (26.06.2026)

Setzt §11 fort. Der Hebel-Status **hier** ist maßgeblich.

### Aktueller Hebel-Status

| Hebel                                    | MA                        | Status                                              |
| ---------------------------------------- | ------------------------- | --------------------------------------------------- |
| StKl 6                                   | 11                        | ✅                                                  |
| Pauschal-Minijob                         | 12, 20                    | ✅                                                  |
| Aktivrente                               | 100, 331                  | ✅                                                  |
| Midijob/Übergangsbereich                 | 358; RV-Teil 17           | ✅                                                  |
| Werkstudent-SV                           | 17                        | ✅                                                  |
| Privat-KV/GF — SV (Phase 1)              | 1, 109, 309               | ✅                                                  |
| St/SV-Brutto-Split + Lohnarten (Phase 3) | 1, 109                    | ✅                                                  |
| SUMITR komplett cent-genau               | 109                       | ✅                                                  |
| Vorsorgepauschale (Phase 2)              | 1, 309, 17                | ⏸️ blockiert — braucht KV/PV-Beiträge + AG-Zuschuss |
| Brutto-Overshoot (3M-Ø Zuschlag)         | 6, 23, 117, 129, 334, 504 | offen, eigenes Thema                                |
| Doppelsatz                               | 320, 352                  | zurückgestellt                                      |
| KV ermäßigt (DEAU)                       | 100                       | Mini-Rest +7,29                                     |

### Neue Mechaniken

**Midijob / Übergangsbereich** (358; RV-Teil von PIM 17): AN-beitragspflichtige Einnahme = `OG/(OG−UG) × (AE−UG)`, UG=603 (Minijob-Grenze 2026), OG=2000, nur wenn `is_midijob` UND UG<AE≤OG. Konstante `UEBERGANGSBEREICH_2026` (config-2026), Helper `midijobBemessungCent` + Schalter in `svBeitraege`. MA mit AE>2000 (23/117/334) bekommen keine Reduktion → ihr Rest ist Brutto-Overshoot, kein SV-Thema. Faktor F nicht nötig (nur AG-Seite).

**Werkstudent** (PIM 17, BGR 0-1-0-0): KV/AV/PV-AN = 0 über `kv_frei`/`av_frei`/`pv_frei`, RV bleibt (auf Übergangsbereich-Basis). Die vier Branchen-Befreiungs-Flags `rv_frei`/`av_frei`/`kv_frei`/`pv_frei` decken Aktivrente, Werkstudent UND Privat-KV-SV ab — ein gemeinsames Muster. `is_sv_exempt` bleibt unverdrahtet (zu grob).

**Privat-KV/GF SV (Phase 1):** GF (1 CHEFIN, 309 Peter) BGR 0-0-0-0 → alle vier `*_frei`=true (SV komplett 0). SUMITR (109) BGR 9-1-1-1, freiwillig GKV → nur `kv_frei`/`pv_frei` (RV/AV bleiben). Reine Daten, größter €-Posten je Kopf (~1.300–1.460 €).

**St/SV-Brutto-Split + Lohnarten (Phase 3):** `lohn-core` trennt `stBruttoCent` (LSt-Basis) von `svBruttoCent` (SV-Basis). Vier neue Kategorien: `bav_frei` (st+sv-frei), `bav_sv` (st-FREI/sv-PFLICHTIG — der Grund für den Split), `sachbezug_pflichtig` (st+sv-pflichtig, Auszahlung −), `entgeltumwandlung` (negativ, mindert beide Brutto). Wiederkehrende MA-Lohnarten in neuer Tabelle `lohn_recurring_zeilen` (staff_id, organization_id, bezeichnung, betrag_cent, kategorie, sort_order), geladen in `computeLohnForStaff`. Bildet Direktversicherung (stsv-frei / stfr-svpfl) + Dienstrad (1 % gwV + Entgeltverzicht) ab. SUMITR damit komplett cent-genau.

### Offen — Phase 2 (LSt-Vorsorgepauschale), blockiert

CHEFIN (1), Peter (309), PIM (17): COCO gewährt die GKV-Vorsorgepauschale, obwohl GF ohne GRV bzw. privat bzw. Werkstudent → LSt zu niedrig (CHEFIN −560, Peter −482). PAP-Pfad steht: `KRV=1` nullt den RV-Teilbetrag (`pap2026` Z. ~962), `PKV>0` bildet den KV/PV-Teilbetrag aus `PKPV−PKPVAGZ` mit Günstigerprüfung gg. Mindestvorsorge. **Der Wrapper `lohnsteuer-2026.ts` verdrahtet aktuell `KRV:0`/`PKV:0` hart** — das ist die Lücke. Cent-genaue Reproduktion braucht je MA die **monatlichen KV/PV-Beiträge + AG-Zuschuss** (lokale PAP-Probe ohne diese: ±15–250 € daneben). PIM = Mindestvorsorgepauschale (kein PKV-Beitrag). Wartet auf die Beitragszahlen aus den edlohn-Stammdaten.

### Lektionen

- **St-Brutto ≠ SV-Brutto** sobald bAV-Entgeltumwandlung im Spiel ist (steuerfrei, aber oberhalb 4 % BBG sv-pflichtig). Das gemeinsame `stSvBrutto` der Stufe 1 trug nur, weil die Referenzfälle es nie auseinandertrieben.
- **Vorsorgepauschale ≠ tatsächliche SV.** Auch wer KV-frei ist (Werkstudent, GF, freiwillig GKV Firmenzahler), braucht für die LSt den korrekten `kk_zusatzbeitrag` bzw. PKV-Beitrag — die Pauschale rechnet unabhängig vom tatsächlichen Beitragsabzug. SUMITRs LSt-Rest war allein ihr fehlender `kk_zusatzbeitrag`.

## 13. Modul M4 — Brutto-Overshoot (3M-Ø-Zuschlag): Methoden-Rest (26.06.2026)

Betrifft die saubere 3M-Ø-Gruppe **23 Andre (+81,36)**, **117 APPEL (+69,32)**, **334 PON (+16,07)** — Δ jeweils **rein im Zuschlag „Urlaubsentgelt/Krank (3M-Ø)"**, Urlaubsstunden/Zeitlohn cent-genau gegen edlohn. edlohn baut die Zeile identisch (`Tage × Tagessatz`), nur der **Tagessatz** weicht ab.

### Befund

COCO: `avgSfnTagCent = round(refSFN(91 Tage) / scheduledDays)`, `scheduledDays = distinct Arbeitstage + Urlaub/Krank-Tage` im Fenster `[fromDate−91 .. fromDate−1]` (`urlaub-krank-diagnose.ts`). Diagnose-SQL (2026-02-24..2026-05-25) ergab `scheduled_days` = 64 / 56 / 57. Zurückgerechnet:

| MA  | COCO Tagessatz | scheduled_days | COCO refSFN ≈ | edlohn Tagessatz | edlohn Divisor |
| --- | -------------- | -------------- | ------------- | ---------------- | -------------- |
| 23  | 36,50          | 64             | 2336 €        | 27,46            | 85             |
| 117 | 22,48          | 56             | 1259 €        | 19,18            | 66             |
| 334 | 20,05          | 57             | 1143 €        | 18,04            | 63             |

**Divisoren 63 / 66 / 85 — keine ableitbare Regel** (kein „×65", kein Soll-Tage-Muster); Andre (16 Referenz-Urlaubstage) sprengt jedes Schema. Andersrum gelesen (gleicher Nenner): COCOs **SFN-Summe** wäre um 11 % / 17 % / 33 % zu hoch. Aus den vorliegenden Daten **nicht entscheidbar**, ob die Differenz im Zähler (SFN-Arten / Referenzfenster) oder Nenner (gezählte Tage) sitzt.

### Entscheidung

**Methoden-Rest, kein Hebel.** Cent-genaue Reproduktion bräuchte edlohns **Durchschnitts-Berechnungsbeleg SFN** (Referenz-SFN-Summe + Tagezahl je MA) — steht **nicht** auf der Juni-Abrechnung (0 Treffer). Fester Nenner (z. B. 65) als „Pfusch-Fix" würde APPEL/PON näherbringen, Andre verschlechtern → verworfen. Abgehakt, bis (falls) der edlohn-Durchschnittsbeleg vorliegt; dann saubere Nenner-/Zähler-Korrektur in `urlaub-krank-diagnose.ts`.

### Abgrenzung (kein Teil dieses Rests)

- **6 ANDI (+120) / 129 GERARD (−220):** echte Stundenzahl-Differenz → Zeitdaten-Abgleich, kein Rechen-Hebel.
- **504 TIP:** Austritt/Teilmonat (Steuer-Tage) → eigenes Feature.
- **320 / 352:** Doppelsatz (rate-1/rate-2), zurückgestellt (COCO hat keine Satz-Attribution; künftige `lohn_second_rate_hours`).

## 14. Modul M4 — GF/PKV-Vorsorgepauschale: Phase-2-Blocker gelöst (27.06.2026)

Voll sozialversicherungsfreie, privat krankenversicherte Geschäftsführer (CHEFIN/perso 1, Peter/perso 309) wichen in der **Lohnsteuer** ab (Brutto/SV identisch). Ursache war **nicht** ein fehlender KV/PV-Beitrag (so war Phase 2 bisher blockiert), sondern drei **fälschlich gewährte Vorsorgepauschale-Teilbeträge**.

### Bug im PAP-Wrapper

`lohnsteuer-2026.ts` verdrahtete `KRV=0` und `ALV=0` hart und speiste `PKV` nie. Für einen SV-freien GF erzeugt das:

- **RV-Teilbetrag** (KRV=0 statt 1) — er zahlt keine GRV.
- **GKV-KV/PV-Teilbetrag** (PKV ungesetzt → GKV-Pauschalweg) — er ist PKV.
- **AV-Teilbetrag** (ALV=0 → `MVSPHB` läuft, `0,013 × BBGRVALV`) — er zahlt keine AV.

Mechanik (verifiziert via PAP-Probe gegen die Engine): `MVSPHB` (AV-/Höchstbetrag) wird in `UPEVP` genau dann ausgeführt, wenn **`ALV !== 1`**. `KRV=1` nullt den RV-Teil, `PKV=1`+`PKPV=0` nullt den KV/PV-Teil, `ALV=1` überspringt den AV-Teil ⇒ Vorsorgepauschale = 0.

### Fix (Commits 6d21b18 + f81d9c6)

Drei optionale PapEingabe-Felder (`krvKeinRv`, `alvKeinAv`, `pkpvCent`), in `lohn-core` **ausschließlich für `is_pkv`-MA** gesetzt:

```
pkv: person.istPkv,
krvKeinRv: person.istPkv && person.rvFrei,
alvKeinAv: person.istPkv && person.avFrei,
pkpvCent: person.pkvBasisBeitragMonatCent,
```

Neue Spalten `is_pkv` (default false), `pkv_basis_beitrag_monat_cent` (default 0). **SELECT-Liste erweitert** (§3). Defaults erhalten Altverhalten bit-identisch → das `is_pkv`-Gate garantiert null Regression (nur 1 & 309 geflaggt; Diff-Export bestätigt: je genau eine Zeile bewegt).

### Ergebnis cent-genau

- **CHEFIN (1):** StKl 1, St-Brutto 10.918,76. edlohn gewährt **VSP = 0** → `is_pkv=true`, `pkpv=0`. LSt 3.054,00 → **3.613,58**, Auszahlung 10.288,14 → **9.691,44**. Zerlegung der 559,58 LSt: RV 330,09 + KV/PV 168,66 + AV 46,17 + kvz 14,66.
- **Peter (309):** StKl 4, St-Brutto 7.084,00, Basisabsicherung 981,00. edlohn gewährt **VSP ≈ 683 €/Jahr** (nicht 0, nicht der volle Beitrag) → `pkv_basis_beitrag_monat_cent=5692` (netto 56,92/Monat). LSt 1.496,83 → **1.979,00**, Auszahlung 6.926,97 → **6.411,11**.

### Offener Faden (Peter)

Die **56,92 sind rückgerechnet, nicht erklärt**: voller 981er-Beitrag gäbe LSt 1.590,91, halber AG-Zuschuss 1.796,91 — beide verfehlen edlohns 1.979,00. edlohn setzt deutlich **weniger** an, als der Basisbeitrag hergäbe. Wert ist beitragsbasiert/monatsstabil, aber ETL-Beleg („welcher PKV-Basisbeitrag fließt in Peters Vorsorgepauschale?") steht aus.

### Lektion

SV-Befreiung ist eine **Lohnsteuer**-Frage (Vorsorgepauschale), nicht SV: SV-frei ⇒ keine/kaum Vorsorgepauschale ⇒ **höhere** LSt. Der vermeintliche Phase-2-Blocker („wir brauchen die Beiträge") löste sich auf — flag-getrieben, ohne Beitragszahl (CHEFIN) bzw. nur netto-effektiver PKPV (Peter). Tarif selbst war korrekt (UPTAB26 Zone 4 `0,42×X − 11.135,63`).

### Phase-2-Status

| MA          | Status                                               |
| ----------- | ---------------------------------------------------- |
| CHEFIN (1)  | ✅ cent-genau (VSP = 0)                              |
| Peter (309) | ✅ cent-genau (PKPV 5692; ETL-Beleg offen)           |
| PIM (17)    | offen — Werkstudent-Mindestvorsorge, Mini-Rest ~33 € |

## 15. Modul D3 — Dienstplan-Display: Einstellungen, Bereichs-Freigabe, Geburtstags-Banner (27.06.2026)

Drei Features, alle CI-grün (tsc / eslint-Prettier-3.7.3 / 787 Tests) + live.

### 15a. Display-Einstellungen (Voll-Port aus thaitime)

- `display_settings` (je Standort) erweitert: `rotation_enabled` (bool, def false), `rotation_interval_seconds` (int, def 30), `show_areas` (text[], **null = alle**; Werte `kitchen|service|gl`), `show_header` (bool, def true), `show_footer` (bool, def true = **Legende**), `custom_message` (text). Dependency `qrcode.react`.
- Server: `src/lib/display/display.functions.ts` (Validator + Persist); Public-API `src/routes/api/public/display.$locationId.ts` exponiert alle Felder (camelCase).
- UI: `src/routes/_authenticated/admin/locations.tsx` (Display-Sektion) — Display-URL (origin-basiert) + Kopieren/Öffnen + **QR** (`QRCodeSVG`), Rotation-Switch+Intervall, Bereichs-Checkboxen (alle angehakt ⇒ `show_areas=null`), Header-/Legende-Switch, Nachricht-Textarea.
- Display `src/routes/display.$locationId.tsx`: `showHeader` blendet Kopf, `customMessage` als Banner, `showFooter` = Legende-Footer, `showAreas` filtert Spalten, **Rotation** mit Fortschrittsbalken + Punkt-Indikatoren (aus thaitime `ScheduleDisplay.tsx` portiert; rotierbare Gruppen = sichtbare nicht-leere Bereiche; Hooks **vor** den Early-Returns). Merke: in thaitime ist `show_footer` = die Legende.

### 15b. Bereichs-Freigabe (Küche/Service getrennt), Modell B

- `roster_releases` + Spalte `area` (NOT NULL); alte Unique `(location_id,period_id)` **ersetzt** durch `(location_id,period_id,area)`; Backfill je (Standort, Periode, Bereich) für `area IN ('kitchen','service')` aus `roster_shifts` → bestehende Displays bleiben sichtbar.
- Server `src/lib/roster/roster.functions.ts`: `getRosterRelease → {kitchen,service}`; `setRosterRelease({locationId,periodId,area,released})` (Upsert `onConflict location_id,period_id,area` / Delete je area); Audit `roster.release`.
- Public-API liefert `releasedAreas: string[]` und **filtert Schichten serverseitig**: unfreigegebene Küche/Service gehen **nicht** an den Client; `gl` immer. Display zeigt „Bereich – noch nicht freigegeben" je Bereich.
- Grid `src/routes/_authenticated/admin/dienstplan.tsx`: zwei Buttons (Küche/Service), `kitchenReleased`/`serviceReleased`, `handleToggleArea`. Freigabe = **expliziter Button** (Modell B), pro (Standort, Periode, **Bereich**).

### 15c. Geburtstags-Banner

- Public-API: `staff_locations` (Team des Standorts) → `staff` (`is_active=true`) → `staff_personal_details.date_of_birth`; Abgleich **Tag+Monat** (`date.slice(5)` vs. `date_of_birth.slice(5,10)`). Liefert `birthdays: string[]` (Anzeigename; ganzes aktives Team, nicht nur heute Eingeteilte).
- Display: festliches Banner oben (🎂), eigenständig (unabhängig von `showHeader`), nur wenn `birthdays.length > 0`.

### 15d. Domain-Wechsel → cocoplatform.online

- Alle App-URLs **origin-basiert** (`window.location.origin`): Display-Link, QR, Passwort-Reset → **domain-agnostisch**, kein Repo-Change. Keine hartkodierte App-Domain (das `lovable.dev` in den Security-Headers ist nur CSP fürs Editor-Preview).
- **Aktion (Dashboard, nicht Repo):** Supabase → Authentication → URL Configuration: Site-URL + Redirect-Allowlist müssen `https://cocoplatform.online` enthalten, sonst brechen Login-/Reset-Redirects.
- **Geofencing domain-unabhängig:** Fence (`latitude`/`longitude`/`geofence_radius_m`) in `locations`, Distanz-Check serverseitig (`assertWithinFence`); `Permissions-Policy: geolocation=(self)` ist origin-relativ → greift automatisch. Einzige Folge: Browser-Standortfreigabe ist **pro Origin** → MA werden auf neuer Domain einmal neu gefragt (erwartet).

### 15e. Lektionen (teuer gelernt)

1. **`.in([viele IDs])` sprengt die PostgREST-URL-Länge → HTTP 400.** Bei großen Mengen (z. B. alle Artikel-IDs) stattdessen **Inner-Join** (`tabelle!inner(spalte)` + `.eq(...)`) oder org-weit laden + im Speicher filtern. Kleine Mengen (≤ ~50, z. B. Team eines Standorts) sind mit `.in` ok.
2. **Neue Tabellen/Spalten brauchen `notify pgrst, 'reload schema';` in der Migration.** Raw-SQL-Editor umgeht PostgREST (sieht Änderungen sofort), die App geht **durch** PostgREST (Schema-Cache) → ohne Reload „column/table not found".
3. **Prettier exakt `3.7.3`** (package.json + bun.lock, **kein** Caret). Lokal **vor** `eslint`/`format:check`: `npm i prettier@3.7.3` (sonst löst node_modules evtl. 3.8.5 auf → falsch grün/rot). Lovable committet gelegentlich nicht-3.7.3-formatiert → CI `check` rot → Fix: `prettier --write <Datei>`. Der `db-integration`-Job ist `continue-on-error` → sein rotes ❌ ist normal, blockiert nichts.

## 16. Kasse, Portal-Architektur, EasyOrder-Optik & Lohnabrechnungs-Verteilung (27.06.2026)

### 16a. Kasse — Vortagsdefizit / Auto-Abschöpfung Wechselgeldbestand

**Entscheidung:** Wechselgeldbestand wird **auto-berechnet** (Auto-Abschöpfung), das manuelle „Ist gezählt"-Feld ist aus der Anzeige raus. Vortagsdefizit wird mitgeschleppt (wie Alt-System), 90 Tage rollierend.

- **Modell:** `diff = Tages-Bargeld + min(0, Vortagsdefizit)` · `Tresor = max(0, diff)` · `Wechselgeld = Soll + min(0, diff)`. Rollierend: `bal += rawBargeld; bal -= max(0, bal)` → Ergebnis ≤ 0.
- **Reine Helfer** in `src/lib/cash/cash-summary.ts`: `rollOperativeDeficitCents(rawBargeldByDayCents[])` + `computeWechselgeld({ tagesBargeldCents, previousDeficitCents, cashTargetCents })`. Getestet in `cash-summary.test.ts`.
- **Server-Fn** `getPreviousOperativeDeficit`/`…Core` in `src/lib/cash/cash.functions.ts`: 90-Tage-Fenster (org-/standort-gescoped, `business_date ≥ datum−90 ∧ < datum`, asc). **Bit-genau:** baut den `DayInput` über das kanonische `sessionToDayInput` + `computeDailyCash` (KEINE Re-Implementierung). Inputs 1:1 wie die Tagesabrechnung: `cardTotal = Σ session_terminal_amounts`; `delivery_souse`/`delivery_wolt` aus `session_channel_amounts` nach `revenue_channels.kind`; offene Rechnungen = `waiter_settlements` **ohne `superseded`**; Ausgaben/Vorschüsse als Listen; Skalare (vectron, Gutscheine, einladung, sonstige, vorschuss) aus der gespeicherten Session. Roll inline identisch zum Helfer. Rückgabe `{ deficitCents, sourceDate }`.
- **UI:** `CashSummaryBlock.tsx` ohne manuelles Feld, nutzt `computeWechselgeld`, zeigt „Fehlbetrag Vortag" bei `previousDeficitCents < 0`. `kasse.tsx` lädt den Defizit (90 d) und reicht `previousDeficitCents`/`SourceDate` an Block + PDF.
- **PDF** (`src/lib/cash/pdfExport.ts`): `computeWechselgeld` an Highlight + Footer; zusätzlich **Vorschuss-Quittungsblätter** — je Vorschuss eine separate, signierbare Seite (addPage: Header, „Vorschussquittung", Mitarbeiter, Betrag, Bestätigungstext, „Datum, Unterschrift").
- **Rest:** Spalte `cash_actual_cents` + ihr Form-State in `SessionFieldsCard.tsx` sind tot (kein sichtbares Feld mehr) — bei Gelegenheit entfernbar, kein Blocker.

### 16b. Abrechnung — Session-Eröffnen-Karte + Kasse-Sprung

- `src/routes/_authenticated/zeit/abrechnung.tsx`: ist keine Session offen, sehen **admin/manager** (`canOpenSession`) eine Karte „Session für heute eröffnen" (`LocationPills` + `getOrCreateOpenSession`). **Kein Auto-Redirect** (bewusst zurückgenommen) — nach Anlegen bleibt man auf der Seite (Toast + `["cash"]`-Invalidierung → Formular erscheint); stattdessen „Zur Kassenübersicht"-Link im Header (nur admin/manager).
- `src/routes/_authenticated/admin/kasse.tsx`: `validateSearch` (`locationId`, `businessDate`, beide optional) → `KassePage` initialisiert Standort/Datum aus den Search-Params (Vorauswahl).

### 16c. Portal-Architektur — Capability-Quelle + PortalShell

Eine Quelle (Rolle + Freischaltungen) treibt **Navigation UND Erreichbarkeit** → „sichtbar = erreichbar", verhindert strukturell ANDI-artige Bugs.

- `src/lib/nav/portal-nav.ts` — `usePortalNav()`: leitet `PortalNavItem[]` aus `identity.role` + EasyOrder-Zugriff ab. Items: Start (`/`), Stempeln (`/zeit`), Abrechnung (`/zeit/abrechnung`), **Lohn (`/lohn`)** für staff/manager/admin; Bestellung (`/easyorder`) bei `hasEasyOrder`; Backoffice (`/admin`) für admin/manager.
- `src/components/portal/PortalShell.tsx` — responsive: Desktop sticky Top-Bar (`hidden sm:flex`), Mobile Bottom-Tabs (`fixed inset-x-0 bottom-0 sm:hidden`, Content `pb-24`).
- `src/routes/_authenticated/route.tsx` — `inAdmin = pathname === "/admin" || startsWith("/admin/")`; `{inAdmin ? <Outlet/> : <PortalShell><Outlet/></PortalShell>}`. /admin behält eigene Shell. **Neue Portal-Routen daher NICHT selbst in PortalShell wrappen.**
- **EasyOrder-Bestellseite liegt unter `/easyorder`** (aus `/admin` rausgezogen, damit staff-Rolle Zugriff hat — das `/admin`-Layout leitet nicht-(admin/manager/payroll) auf `/` um). EasyOrder-**Verwaltung** bleibt unter `/admin` (manager+).

### 16d. EasyOrder — Admin-Bestelloptik (Accordion + Warenkorb-Icon)

`src/routes/_authenticated/easyorder.tsx`, angeglichen an die Admin-Ansicht `bestellung.lieferanten.tsx`:

- Lieferanten-Gruppen per Default **eingeklappt** (`collapsed[name] ?? true`); bei aktiver Suche (`search.trim() !== ""`) Auto-Expand. Header = Chevron `▸/▾` + runde Zähler-Badge (`rounded-full bg-muted`) + Name; `border-b/bg-muted` nur im aufgeklappten Zustand.
- Mengen-Interaktion: **Warenkorb-Icon statt Stepper** — `🛒` = +1, ab Menge > 0 Anzahl + „−" = −1. Verdrahtet an lokalem `qty`/`setItemQty` (clamp 0..9999, bei 0 `delete copy[id]`); Absende-RPC + Submit-Filter (`q > 0`) unverändert. **Stepper-Import bleibt** (Free-Text „Sonstiger Artikel" nutzt ihn weiter).

### 16e. Modul — Lohnabrechnungs-Verteilung (payslips, privater Storage-Bucket)

Admin lädt PDF je Mitarbeiter hoch → Mitarbeiter sieht/öffnet die eigene Abrechnung. Erster produktive Supabase-**Storage**-Nutzung im Repo. (Die edlohn-PDF-Split-Automatik — Sammel-PDF je Mandant/Personalnummer auftrennen — bleibt davon getrennt offen.)

- **Bucket** `payslips` (privat, im Dashboard angelegt — **NICHT** per Migration). Pfad-Konvention `{organization_id}/{staff_id}/<datei>`.
- **RLS** (`storage.objects`, zwei Migrationen): SELECT = eigene (`foldername[1]=org ∧ [2]=staff`) **oder Admin der Org**; INSERT/UPDATE/DELETE = **nur Admin** der Org (`ra.role = 'admin'`). Manager bewusst draußen.
- **Reines Modul** `src/lib/payslips/payslip-path.ts` (+ Test): `payslipFolder`, `sanitizePayslipFileName` (lehnt `/`, `\`, `..`, führenden Punkt, leer, Fremdzeichen ab), `isPayslipPathAllowed` (eigener Pfad mit Trailing-Slash gegen ID-Prefix-Kollision; Admin org-weit).
- **Server-Fns** `src/lib/payslips/payslips.functions.ts` (Muster `cash.functions.ts`, Storage über `supabaseAdmin`): `listMyPayslips` (staff), `getPayslipSignedUrl` (staff, `isPayslipPathAllowed`-Gate), `listStaffPayslips`/`uploadPayslip`/`deletePayslip` (admin). Runtime = Cloudflare Workers → base64 via `Uint8Array.from(atob(...), c => c.charCodeAt(0))`, **kein `Buffer`**.
- **UI:** `/lohn` (`src/routes/_authenticated/lohn.tsx`, Self-Download, PortalShell-konform) + Portal-Nav „Lohn" (staff/manager/admin) + Admin-Karte als Tab „Lohn" in `staff.$staffId.tsx`, **doppelt `isAdmin`-gated** (Tab-Liste + Render).

### 16f. Lektionen (teuer gelernt)

1. **Roll-Logik nicht aus dem Bauch testen.** Mein Prompt-Erwartungswert `rollOperativeDeficitCents([5000, -2000]) === 0` war **falsch** — korrekt `-2000`: der Tag-1-Überschuss wird sofort abgeschöpft (bal → 0), das Tag-2-Defizit läuft **neu** auf, der alte Überschuss deckt nichts mehr. Impl/Test stimmten; mein Wert nicht. → Erwartungswerte gegen den Algorithmus rechnen, nicht gegen die Intuition.
2. **Supabase-Storage-Gotchas (erstmals genutzt):** `createSignedUrl` liefert **`data.signedUrl`** (nicht `data.url`). `.list()`-Felder: `created_at` (nicht camelCase) + Größe unter **`metadata.size`** (nicht Top-Level). Bucket-Anlage passiert im Dashboard, nicht per Migration — RLS-Policies referenzieren nur `bucket_id`.
3. **Lovable baut große Pläne teilweise.** Beim Payslip-Plan kamen zuerst nur das reine Modul + Migration; Server-Fns + UI (Schritt 3–6) fehlten komplett → separater Nachzieh-Prompt nötig. Nach jedem Lauf gegen die **Dateiliste** prüfen (`git diff --stat`), nicht nur Gates.
4. **Newline-Pflicht weiterhin Lovables Schwachstelle:** trotz expliziter Prompt-Anweisung fehlte neuen Dateien der Schluss-Zeilenumbruch → `format:check`/`eslint` rot. Standard-Fix `prettier --write <datei>`.

## 17. Modul Welle D — Lohnabrechnungs-Verteilung: Auto-Matcher + Sammel-PDF-Splitter (28.06.2026)

Aufbauend auf 16e (manueller Einzel-Upload). Beide Schritte abgenommen (tsc/eslint/vitest grün, Diff-Review). Der manuelle Einzel-Upload aus 16e bleibt unverändert bestehen.

### 17a. Auto-Matcher für Einzeldateien (HEAD a55d892)

Admin lädt mehrere bereits gesplittete edlohn-PDFs auf einmal in `/admin/lohn-verteilung`. Zuordnung über die **Personal-Nr im Dateinamen**, nicht über manuelle Auswahl.

- **Reine Module:** `src/lib/payslips/payslip-filename.ts` (`parsePayslipName`, Regex `-(\d{6})-(\d{4})-(0[1-9]|1[0-2])\.pdf$`) + `payslip-assign-core.ts` (`classifyAssignment` → Status `matched`/`matched_inactive`/`unknown_perso`/`ambiguous`/`unparsable`).
- **Server-Fns** `payslip-assign.functions.ts`, beide admin-gated via `loadAdminCaller(…, "admin")`: `planPayslipAssignment` (Dry-Run, nur Dateinamen) + `assignPayslips` (lädt nur eindeutige Treffer). **Auflösung rein server-seitig** über `staff.perso_nr` (org-scoped); Client liefert nie eine `staffId`. base64 via `atob` (kein Buffer). Konsistent mit `uploadPayslip`: kein `audit_log`.
- **Zwei-Schritt:** Vorschau-Tabelle (perso · Mitarbeiter · Status) → bestätigen → Upload. Nur `matched`/`matched_inactive` werden hochgeladen.
- **`ambiguous`-Sicherheitsnetz:** >1 `staff` zur perso → kein Upload, Meldung. Der Matcher verweigert im Zweifel, statt je falsch zuzuordnen.

### 17b. Sammel-PDF-Splitter (HEAD 11b9488)

Ein edlohn-Monatsexport je Mandant (alle Mitarbeiter hintereinander) wird **im Browser** in Einzel-PDFs zerlegt und in denselben Matcher (17a) gespeist. **Server-Matcher unverändert** — der Splitter erzeugt nur dessen Eingaben.

- **Dependency neu:** `pdf-lib` (`^1.17.1`). `pdfjs-dist` (`^6`) war bereits da (Worker-Setup wie `PdfCanvasPreview.tsx`).
- **Reines Modul** `src/lib/payslips/split-combined-core.ts` (+ Golden-Master-Test): `parsePersoFromPageText`, `parseRunMonth` (Korrektur-Seiten liefern den Lauf-Monat via „Korrektur in MM.YYYY"), `groupPagesByPerso` → gruppiert nach perso (Reihenfolge erhalten), Lauf-Monat per Mehrheit, Dateiname `Lohn-NNNNNN-YYYY-MM.pdf` (matcher-kompatibel). Seiten ohne perso → `unparsablePages`, **nie** an Nachbarn gehängt.
- **Browser-Harness** `split-combined.ts`: `extractPageTexts` (pdfjs), `splitCombinedPdf` (pdf-lib `copyPages` je Gruppe), `bytesToBase64` (chunked, kein Buffer). PDF-Inhalt wird nicht geloggt.
- **Golden Master** aus echtem Mai-2026-Export (YUM GmbH): 49 Seiten → 39 Mitarbeiter; Seitenzahl pro Person **variabel** (Korrektur-Monate hängen an derselben perso: perso 000001 = 5 Seiten, 000109 = 5, 000011/000027 = je 2).

### 17c. Mandanten / TSB — dokumentierte Wiedervorlage (zurückgestellt)

Lohn läuft über **zwei GmbHs / edlohn-Mandanten**: **GmbH A = YUM + Spicery**, **GmbH B = TSB**. edlohn-Personal-Nrn sind nur **je Mandant** eindeutig. COCO modelliert die GmbH aktuell **nicht** (kein Feld an `staff`/`locations`, kein Unique-Index auf `perso_nr`).

- **Aktuelle Annahme (per Live-CSV bestätigt):** `perso_nr` ist heute org-weit eindeutig (0 Doppelungen). **TSB ist lohnseitig ausgeklammert** → Matcher löst org-weit auf. Das `ambiguous`-Netz (17a) fängt künftige perso-Kollisionen ab (verweigert, statt fehlzuzuordnen).
- **Offene Frage vor TSB-Aktivierung:** Es arbeitet jemand über die GmbH-Grenze. Zu klären: **eine** Lohnabrechnung (eine GmbH zahlt, hilft nur aus) **oder zwei** (je GmbH eine Personal-Nr)? Bei „zwei" reicht ein einzelnes `staff.mandant_id` nicht → Zuordnungstabelle `staff_payroll_identities (staff_id, mandant_id, perso_nr)` nötig.
- **Zurückgestellter Prompt „Mandanten-Fundament"** (`mandanten`-Tabelle + `staff.mandant_id` + partieller Unique-Index `(mandant_id, perso_nr)` + GmbH-Dropdown in der Mitarbeiter-Anlage): erst bauen, wenn TSB in den Lohnlauf kommt und die Ein/Zwei-Abrechnungs-Frage entschieden ist. Bis dahin keine Mandanten-Logik im Code.

### 17d. Lektionen (teuer gelernt)

1. **Sammel-PDF: nach perso gruppieren, nicht nach Seitenzahl.** Korrektur-Monate erzeugen variable Seitenzahlen pro Person. Annahme „2 Seiten pro Person" wäre falsch gewesen.
2. **Nur `perso_nr` ist der Schlüssel, nie der Name.** Im echten Export: zwei verschiedene „Schumann" (perso 1 ≠ 109), zwei „Robkla" (perso 6 ≠ 12). `display_name` ist ohnehin nur ein Spitzname/Rolle (perso 1 = „CHEFIN" = Frank Schumann).
3. **PDF-Text muss im Browser gelesen werden** (`pdfjs-dist`), nicht auf Cloudflare Workers. `pdf-lib` kann zerlegen, aber keinen Text extrahieren.
4. **Unparsable-Seiten nie automatisch zuordnen** — melden und den Menschen prüfen lassen.

### 17e. Zurückgestellt — Payslip-Auslieferung (Ad-Blocker-Block)

Die hochgeladene Lohnabrechnung wird in `lohn.tsx` und `staff.$staffId.tsx` per `window.open(res.url, "_blank", "noopener")` geöffnet — also als neuer Tab direkt auf die rohe `*.supabase.co`-Signed-URL (`getPayslipSignedUrl` → `createSignedUrl`).

- **Symptom:** Clientseitige Ad-/Tracking-Blocker (uBlock Origin, Brave-Shields, In-App-Blocker auf Mobilgeräten) können diesen Tab blockieren → Chrome zeigt `ERR_BLOCKED_BY_CLIENT`. **Kein** Server-/RLS-/Code-Fehler — die Anfrage erreicht Supabase gar nicht erst.
- **Sofort-Workaround:** Inkognito-Fenster (Erweiterungen aus) oder im Blocker `cocoplatform.online` + `*.supabase.co` whitelisten.
- **Robuste Lösung (zurückgestellt):** Payslip-Bytes über COCOs **eigene Domain** ausliefern — Server-Fn streamt die Datei server-seitig aus dem Storage (`supabaseAdmin`), der Browser trifft nur noch `cocoplatform.online/...` (auf keiner Blockliste). Löst zugleich den dokumentierten Safari-`blob:`-Stolperstein (Vorschau via pdfjs-Canvas statt Roh-URL).
- **Auslöser zum Bauen:** sobald relevant — z. B. Mitarbeiter-Beschwerden, dass die eigene Abrechnung nicht öffnet. Bis dahin keine Änderung am Auslieferungspfad.

### 17f. Admin-Payslip-Sicht — Auflösung (29.06.2026)

Symptom war: Admin-Lohn-Tab und `/lohn`-Selbstansicht blieben leer, obwohl die Dateien im Storage lagen. Drei Ursachen lagen übereinander; alle behoben:

1. **Auflistung über RPC statt `storage.list()`** (HEAD `dd8a1ff`). `supabaseAdmin.storage.from("payslips").list("{org}/{staffId}")` liefert bei **zweistufig verschachteltem Präfix leer** zurück — auch mit Service-Role (RLS umgangen), auch mit Limit/Sortierung. Lösung: `listFolder` in `payslips.functions.ts` ruft die neue SECURITY-DEFINER-RPC `public.list_payslip_objects(p_prefix)` (Migration `20260628191912_*.sql`), die `storage.objects` direkt nach Präfix liest (`name like prefix||'/%' and not like prefix||'/%/%'`). EXECUTE nur `service_role`, `search_path=''`. Per direktem RPC-Aufruf an echten Daten verifiziert (liefert die Dateien).

2. **Fehleranzeige statt maskiertem „leer"** (HEAD `16c52d3`, Prettier-Nachzug `8992644`). `PayslipsTab` (in `staff.$staffId.tsx`) und `lohn.tsx` trennen jetzt Laden / Fehler (`q.error.message`, rot) / Leer / Liste. Vorher erschien **jeder geworfene Fehler identisch als „Noch keine Lohnabrechnungen"** — die eigentliche Ursache blieb unsichtbar.

3. **Account-Verknüpfung korrigiert (eigentliche Wurzel).** `frank.schumann@me.com` war in `user_links` an **ANDIs** Datensatz gehängt (`6dfb47b9-…`, perso 6, Rolle **staff**) statt an Franks eigenen (`ce04575a-…`, perso 1, CHEFIN, **admin**). Beim E-Mail-Login war Frank im Selbst-Kontext also ANDI. Korrigiert per SQL (Option A): Schatten-Link auf `ce04575a` gelöst → E-Mail-Login von `6dfb47b9` auf `ce04575a` umgehängt. Verifiziert: `frank.schumann@me.com → ce04575a, perso 1, CHEFIN, admin`.

Lektionen (teuer gelernt):

- **`storage.list()` ist bei verschachteltem Präfix unzuverlässig** — Listen über RPC auf `storage.objects` lesen, nicht über die Storage-List-API.
- **UI darf einen Fehler nie als „leer" maskieren** — sonst debuggt man die falsche Ebene (hier zweimal).
- **`user_links` hat `user_id` UND `staff_id` je UNIQUE** — ein Datensatz hat genau einen Login und umgekehrt. Ein Login umhängen heißt: erst den belegenden Link am Ziel-Datensatz lösen, dann umhängen (sonst Unique-Verletzung). Vor jeder solchen Änderung Rolle am Ziel prüfen (Lockout-Schutz: `ce04575a` hatte bereits `admin`).
- **Nur `perso_nr`/`staff_id` sind verlässlich, nie der Anzeigename** — `display_name` ist Spitzname/Rolle (perso 1 = „CHEFIN" = Frank Schumann).

## 18. Modul M-Statistik — Backend (29.06.2026)

Quelle der Wahrheit: Analyse der `tagesabrechnung`-Statistikseite (Auswertungs-Fehler kartiert), Neubau in COCO als reine, getestete Funktionen + dünne Read-Server-Fns. Alle cent-basiert, gated `["manager","admin","payroll"]`, org-/standort-scoped.

**Designentscheidungen (verbindlich):**

- **Kalendermonat NUR für die Statistik** (1.–Monatsende). Lohn/Zeit bleiben bei 26.–25. (`periods`-Tabelle). Selektor `month: "YYYY-MM"`; Vergleich = echter Vormonat (variable Länge); Custom-Range möglich (Vorperiode = gleich langes Fenster davor); ohne Argumente = aktueller Monat. Geteilte UTC-sichere Helfer in `src/lib/statistics/period-window.ts` (`monthRange`/`previousMonthRange`/`previousRangeForDates`) — Umsatz und Trinkgeld nutzen dasselbe Fenster.
- **Umsatz doppelzählungsfrei:** `Gesamtumsatz = vectron_daily_total_cents + Σ(is_takeaway-Kanäle)`. YUM/Spicery sind Takeaway-only (`pos`-Kanal = 0) → Haus = vectron, Takeaway additiv/disjunkt. TSB hat zusätzlich einen `Kasse`/pos-Kanal (is_takeaway=false) → Haus-Umsatz-Verifikation offen, sobald TSB-Sessions finalisiert sind.
- **Alle Sessions zählen** (S-6): Team finalisiert nicht, daher kein Status-Filter; gezählt wird, sobald Umsatz vorhanden ist.
- **Ein Trinkgeld-Begriff** (S-7): ausschließlich `computeSessionTipPoolCore` (M2) wiederverwendet — keine zweite Formel. perStaff = Summe der `TipPoolShare` über die Sessions. Second-Waiter wie der Kern es heute liefert (zurückgestellt).
- **Personalquote = Basis-Brutto (B2):** Netto-Stunden × gültigkeitsdatiertem `hourly_rate` (EUR, `numeric(10,2)`). OHNE AG-SV, SFN, `hourly_rate_2`. Quote (Kosten/Umsatz) in der UI via `personnelRatioPct`. `staffWithoutRate` als Diagnose, damit fehlende Sätze die Quote nicht stillschweigend untertreiben.

**Vermiedene tagesabrechnung-Fehler:** Doppelzählung Lieferumsatz; KPI-Wert vs. Trend über verschiedene Fenster; zwei parallele Trinkgeld-Formeln; verworfener Umsatz schichtloser Sessions; „Alle"-Tagesverlauf nicht nach Datum aggregiert.

**Dateien (`src/lib/statistics/`):** `revenue-core.ts`, `revenue-map.ts`, `revenue-stats.functions.ts`, `period-window.ts`, `tip-aggregate.ts`, `tip-stats.functions.ts`, `personnel-core.ts`, `personnel-stats.functions.ts` (je mit Tests). In `cash.functions.ts` wurden `computeSessionTipPoolCore`, `loadOrgSettings` (+ zwei Typen) nur `export`-sichtbar gemacht — keine Logikänderung.

**Server-Fns:** `getRevenueStats`, `getTipStats`, `getPersonnelStats` — gleiches Input-/Perioden-Modell (`month`/Custom/Default), Trend gegen Vorperiode.

**Offen:** TSB-Haus-Umsatz-Verifikation. (UI ist umgesetzt — siehe Abschnitt 19.)

**Verifizierter Stand:** HEAD `f0ba414` — `tsc`/`eslint --max-warnings=5`/`vitest` (870) grün.

## 19. Modul M-Statistik — UI (29.06.2026)

Route `/admin/statistik` (gated `["manager","admin","payroll"]`), konsumiert die drei Read-Fns aus Abschnitt 18 + `personnelRatioPct`. Drei Bauschritte, alle abgenommen.

### Tabs gegen Endlos-Scroll (HEAD 862568a)

Vier Tabs (`Umsatz` · `Trinkgeld` · `Personalquote` · `Standortvergleich`, shadcn `ui/tabs`). Die Filterleiste (Monat/Standort/PDF) bleibt **global oberhalb** der Tabs. **Wichtig:** alle Query-Hooks (`statsQ`/`tipsQ`/`personnelQ` + die drei Compare-`useQueries`) bleiben **eager** oben in `StatistikPage` — Tabs steuern nur Sichtbarkeit, weil der PDF-Export alle Daten gleichzeitig braucht. Nicht in Tabs verschieben/konditionalisieren.

### Chart-Lückenfüllung (HEAD 862568a)

Reine, getestete Funktion `fillDailyGaps` in `src/lib/statistics/chart-fill.ts`: erzeugt aus den vorhandenen Tagen eine **lückenlose** Folge von min..max `businessDate`, fehlende Kalendertage als Null-Balken (`houseCents/takeawayCents/totalCents = 0`). UTC-Millisekunden-Schritte (kein DST-/Zeitzonen-Drift, Monatsgrenzen korrekt), nur Innen-Lücken (keine führenden/nachfolgenden Leertage). `RevenueChart` schickt `daily` vor dem Mapping durch diese Funktion → lineare X-Achse.

### Freier Zeitraum (HEAD db13823)

Modus-Umschalter `Monat ⇄ Zeitraum` (Segmented aus zwei Buttons). Im Zeitraum-Modus zwei `type=date`-Felder (Von/Bis), beim Umschalten mit den Grenzen des aktuellen Monats (`monthRange`) vorbelegt. Eine Quelle der Wahrheit (`periodArgs` = `{month}` bzw. `{startDate,endDate}`, plus `periodValid`) speist **alle vier** Query-Gruppen inkl. Compare; `queryKey`s tragen `mode + month + startDate + endDate + locationFilter`; `enabled: periodValid` blockt ungültige/leere Bereiche (`endDate ≥ startDate`).

**Backend war bereits range-fähig** (`startDate/endDate`, Vorperiode = gleich langes Vorfenster via `previousRangeForDates`, Trend wird auch im Range-Modus berechnet). **Merker:** im Range-Modus liefert das Backend `range.label = null` — UI **und** PDF bauen das Label selbst aus `startDate–endDate`. `periodLabel` (Monat „LLLL yyyy" bzw. „TT.MM.JJJJ – TT.MM.JJJJ") fließt in PDF-Kopf + Dateiname; `exportDisabled` schließt `!periodValid` ein. `MonthNav` und die „· unvollständig (Stand …)"-Anzeige bleiben **monatsspezifisch** (Coverage-Klemmung U5a gilt nur im Monatsmodus).

**Offen (M-Statistik gesamt):** nur noch TSB-Haus-Umsatz-Verifikation; größere Charts könnten später `recharts` lazy laden (separater Schritt, vgl. Abschnitt 18-Umfeld).

## 20. Dienstplan-Abwesenheiten — Korrektur `staff_absences` + Krank in `roster_absence` (29.06.2026)

**Ausgangslage / Fehler:** Für die geplante Display-Overlay-Anzeige (Urlaub / Krank / Verfügbar / Wunsch-frei) wurde zunächst eine **neue Tabelle `staff_absences`** (+ Enum `absence_type`) gebaut und mit 550 Zeilen (117 Krank + 433 Urlaub aus thaitime) befüllt. **Das war redundant:** COCO führt Abwesenheiten längst in der `roster_*`-Familie (siehe Abschnitt 6) — `roster_absence` (per-Tag, gelesen von Grid `dienstplan.tsx`, `roster.functions.ts`, `urlaub-krank-diagnose.ts`), `roster_availability`, `day_off_wishes`, sowie `leave_requests` → expandiert per SECURITY-DEFINER-RPC `approve_leave_request` nach `roster_absence`. Der Anwendungscode unterstützte `type: "urlaub" | "krank"` bereits durchgängig (zod-Enum in `roster.functions.ts`, Grid-Label „Krank", `urlaub-krank-diagnose.ts` filtert `.in("type", ["urlaub","krank"])`) — **nur die DB-CHECK-Constraint blockierte `krank`.**

**Korrektur (Migration `20260629160444`):** `drop table staff_absences` + `drop type absence_type`; `roster_absence`-CHECK von `('urlaub')` auf `('urlaub','krank')` erweitert. Keine Code-Verweise auf `staff_absences` mehr.

**Krank-Quelle + Import:** thaitime `absence_entries` (Krank) — 117 Zeiträume → **119 per-Tag-Zeilen** nach `roster_absence`, `type='krank'`, idempotent `ON CONFLICT (staff_id, date) DO NOTHING` (rohes SQL, kein Audit). Endstand Krank in `roster_absence`: **120** (119 Import + 1 manuell via App-`set_range`). Urlaub bleibt unverändert die Quelle `leave_requests` / `approve_leave_request` — **kein Urlaub-Re-Import nötig.**

**Datenstand Urlaub (geklärt, kein Schaden):** Während der Arbeit fiel `roster_absence`-Urlaub von 951 auf 835. **Durch keine unserer Operationen verursachbar** — Krank-Import = nur Insert, Korrektur-Migration = nur CHECK (beide ohne Delete/Update von Urlaub); `audit_log` (`entity='roster_absence'`) zeigte im Fenster **kein `clear`**, nur 1 `set_range`. Die Urlaub-Quelle (433 genehmigte thaitime-Anträge → **849 Tage**, exakt gleiche Datumsspanne 2025-12-02…2027-01-17) liegt dicht an 835; die ursprünglichen 951 enthielten ~100 Tage aus Nicht-Antrags-Quellen (Grid-Direkteinträge), die außerhalb der Session weggefallen sein können. **835 ist plausibel korrekt.** Ein gefahrloser additiver Abgleich (849 Antrags-Tage, `ON CONFLICT DO NOTHING`, ändert/löscht nichts) liegt bereit, ist aber nicht erforderlich.

**Lektion (teuer gelernt):** **Vor jedem neuen Tabellen-/Enum-Bau erst bestehenden Schema-Stand UND diese Doku prüfen** — `roster_absence` / `leave_requests` standen längst in Abschnitt 6, die Antwort lag im Dokument. Direkt im Editor angelegte Tabellen sind Repo-Drift → immer per idempotenter Migration über Lovable nachziehen (so geschehen) statt nur im SQL-Editor. `roster_absence` hat `UNIQUE (staff_id, date)`; `setAbsenceRange` upsertet (kann Urlaub↔Krank umflaggen) und löscht überlappende `roster_shifts`. Idempotenz für Daten-Importe immer über `ON CONFLICT DO NOTHING`.

## 21. Trinkgeld-Pool — manuelle Küchen-Verteilung, Plan-Snapshot, GL-Sicht, Teilnahme-Override (30.06.2026)

Verifizierter Stand HEAD `c9c35f1` (tsc 0, eslint 0, vitest 911, prettier sauber). In vier Schritten gebaut; Geld-Logik durchgehend gegen `computeTipPool` (unverändert) abgesichert.

### 21a. Küche manuell (Schalter)

- Org-Einstellung `organization_settings.kitchen_manual_only` (bool, default false). Aktiv → für die **Küche** werden Stempelstunden ignoriert; die Stundenbasis kommt ausschließlich aus manuell erfassten Schichten. **Service unverändert** auf Stempelstunden.
- Eingabe per **Start/Ende-Zeit**: `session_tip_pool_entries.shift_start/shift_end` (time). Reine Fn `kitchenShiftMinutes(start,end)` (`src/lib/cash/`), Mitternachts-Wrap `end<start → +1440`, `start==end → 0` (bewusste Abweichung vom Legacy-„=24h"). `hours_minutes` bleibt die von der Verteilung konsumierte Größe.
- Stunden-Auflösung als reine Fn `resolvePoolTimeEntries` (kitchenManualOnly verwirft Küchen-Stempel, auch ohne manuellen Eintrag).

### 21b. Plan-Snapshot bei Session-Eröffnung

- `getOrCreateOpenSession` legt **nur im Create-Zweig** je bestätigter (`status='confirmed'`) `roster_shifts`-Schicht des Tages/Standorts eine `session_tip_pool_entries`-Zeile an (idempotent `on conflict do nothing`); Snapshot-Fehler eröffnen die Session trotzdem (Komfort, kein Blocker). Reine Fn `buildRosterPoolSnapshot` (`src/lib/cash/roster-pool-snapshot.ts`).
- **Snapshot-Semantik:** Zusammensetzung wird bei Eröffnung eingefroren — spätere Plan-Änderungen wirken nicht zurück. Card-Button „Aus Dienstplan ergänzen" fügt nachträglich Bestätigte hinzu (überschreibt nichts).
- **Standardzeiten** in `location_department_defaults` (bestehend): `default_checkin` + neue Spalte **`default_checkout`**, je Standort × Bereich. Stammdaten-UI: `src/routes/_authenticated/admin/standortzeiten.tsx`. Küche z. B. 15:00–23:30, Service 16:00–23:00 (Service-Ende ist vorläufiger Fallback).
- **Service-Ende-Nachzug:** bei der Kellnerabrechnung (`submitWaiterSettlementCore`) wird das Service-Pool-Ende auf den echten Auto-ClockOut (`time_entries.ended_at`) gesetzt — **nur, wenn `shift_end` noch exakt dem Service-`default_checkout` entspricht** (= seit Eröffnung unverändert). Kein Extra-Flag; manuell geändertes Ende bleibt. `time_entries` wird dabei **nur gelesen**.

### 21c. GL-Sichtbarkeit (ohne Trinkgeld)

- GL wird beim Snapshot mit angelegt: `department='gl'`, `shift_start/end=null`, `hours_minutes=0` (**keine** Standardzeit). Eigene Card-Sektion „Geschäftsleitung — Arbeitszeit (keine Trinkgeld-Beteiligung)", erfassbar, **ohne** Anteil-Spalte.
- **Doppelte Geld-Sicherheit:** (a) `computeTipPool` schließt über `staffDepartments` alles außer kitchen/service aus; (b) GL liegt in getrennter Anzeige-Liste (`glEntries`). `session_tip_pool_entries` trägt damit bewusst auch Nicht-Trinkgeld-Arbeitszeit.
- Bereichs-Priorität bei Mehrfach-Einteilung: **kitchen > service > gl** (eine Zeile je MA; Mehrfach-Einteilung bleibt architektonisch erlaubt, D-3/D-6 unverändert).

### 21d. Teilnahme-Übersteuerung pro Session

- Spalte `session_tip_pool_entries.participates` (bool **nullable**): NULL = Stammdaten-Default (`staff.participates_in_pool`), true/false = Session-Override. **Entkoppelt von den Stunden** — löst den Fall „früher heimgeschickt" (echte Stunden bleiben, MA trotzdem ganz aus dem Pool).
- Reine Fn **`effectiveParticipation(override, staffDefault) = override ?? staffDefault`** (`tip-pool.ts`), ersetzt die frühere `hours_minutes>0`-Heuristik. Verdrahtet in `computeSessionTipPoolCore`; `computeTipPool` unverändert.
- Card: Teilnahme-Toggle je kitchen/service-Zeile, vorbelegt mit effektivem Status; **abgewählte bleiben sichtbar** (0 Anteil) über die vollständige `poolEntries`-Liste; live-Recompute. GL ohne Toggle.

### Ausgeführte Migrationen (COCO-DB, Frank)

`organization_settings.kitchen_manual_only`; `session_tip_pool_entries.shift_start/shift_end`; `location_department_defaults.default_checkout`; `session_tip_pool_entries.participates`. Alle additiv (`add column if not exists`), keine neuen Policies.

### Offen / bewusst vertagt

- **Fähigkeit B (an M4): ✅ umgesetzt am 30.06.2026 — siehe §23.** (Realisiert als `source='pool'`, nicht `'manual'`.)
- Teilnahme-Override greift nur für MA **mit** `session_tip_pool_entry`; reine Stempel-MA ohne Eintrag erst nach Aufnahme in der Card übersteuerbar.

### Lektionen (teuer gelernt)

- **Feature war großteils schon da:** Küchentrinkgeld rechnete COCO bereits (`kitchen_tip_cents`, `kitchenPool`, Verteilung). Vor Neubau erst Bestand prüfen.
- **Geld-Regel blockierend testbar machen:** inline-Logik in async-Fns ist nur über den flaky `db-integration`-Job prüfbar → als reine Fn extrahieren (`effectiveParticipation`, Muster `resolvePoolTimeEntries`) und im `check`-Gate unit-testen.
- **Snapshot nur im Create-Zweig:** sonst legt jeder Session-Get doppelt an.

## 22. Dienstplan-Display — Farbschema an Grid angeglichen, geteilte `pill-style.ts` (30.06.2026)

Verifizierter Stand HEAD `406010a` (tsc 0, eslint 0, vitest 918, prettier sauber). Das öffentliche Display (`display.$locationId.tsx`, `CellView`) sieht jetzt farblich genauso aus wie der Dienstplan (`ShiftPill` + Grid-Zelle).

### Befund (Drift durch Duplizierung)

Grid und Display rendern Schicht-Pillen unabhängig voneinander → auseinandergelaufen: Grid dunkelte die Skill-Farbe ab (`color-mix(in oklab, color 85/92%, black)`) + weißer Text + Abkürzung; Display nahm die **rohe** `cell.color` + dunklen Text + vollen Skill-Namen. Abwesenheiten zusätzlich mit abweichendem Icon (Krank: Display `Thermometer` vs. Grid `HeartPulse`).

### Lösung — geteilte Quelle (Muster wie `service-marker.ts`)

- Neue Datei **`src/lib/roster/pill-style.ts`**: reine Fns `pillStyle({ skillColor, area, label, status }) → { backgroundColor, textClass }` und `abbr(skillName)`, aus `ShiftPill` extrahiert.
- **`ShiftPill` UND Display-`CellView` rufen jetzt dieselbe Funktion** — kein Copy-Paste mehr, kein erneuter Drift. (Genau dieselbe Philosophie, mit der schon `serviceMarker` zwischen Grid und Display geteilt wird.)
- Charakterisierungstest `pill-style.test.ts` (7 Tests) nagelt `backgroundColor`/`textClass` fest → der Refactor kann die Grid-Optik nicht still verschieben.

### Theme-Entscheidung (bewusst)

- **Skill-Pillen exakt gleich:** abgedunkelte Farbe + weißer Text + Abkürzung (`abbr`) — hintergrund-unabhängig, da die Pille eigenen Hintergrund mitbringt.
- **Display bleibt dunkel** (`bg-slate-950`). Abwesenheiten daher **nicht** 1:1 farbgleich, sondern **gleiche Icons + gleiche Farb-Familie, aufgehellt** (400er statt 600er): Urlaub `Umbrella` grün, Krank **`HeartPulse`** (nicht mehr `Thermometer`) rot, Wunsch `Heart` lila — lesbar auf dunklem Grund.

### Lektion

Darstellungs-Logik, die an zwei Orten gleich aussehen soll, gehört in **eine** geteilte Funktion (`service-marker.ts`, jetzt `pill-style.ts`). Dupliziert man sie, driftet sie garantiert auseinander — der hier behobene Fall.

## 23. Fähigkeit B — Pool-Zeiten → `time_entries` für den Lohn (30.06.2026)

Verifizierter Stand HEAD `33cdd1e` (tsc 0, eslint 0, vitest 936, prettier sauber). Migration in COCO-DB ausgeführt (ENUM-Wert `pool` + Index `time_entries_pool_key_unique`). Damit rechnet M4 die Arbeitszeit der **Nicht-Stempler** (Küche bei `kitchen_manual_only`, GL) mit: ihre `session_tip_pool_entries`-Zeiten (`shift_start/shift_end`, §21a) werden bei der Kellnerabrechnungs-Abgabe als `time_entries (source='pool')` geschrieben.

### Entscheidungen (Frank)

- **`source='pool'`** (neuer ENUM-Wert, nicht `'manual'`) — sauber separierbar, eigener Idempotenz-Index.
- **`break_minutes=0`** — volle Pool-Zeit zählt als Arbeitszeit.
- **Auslöser: bei Abrechnungs-Abgabe** (neben A's `performClockOut`), best-effort.
- **GL mit erfasster Zeit kommt mit** (Arbeitszeit für Lohn, nicht Trinkgeld); GL ohne Zeit nicht.

### Abgrenzung zu A

A (Service-Ende-Nachzug) **updated** existierende **clock**-Einträge der Stempler (`auto_clockout_time_entry_id`). B **inserted** neue Einträge nur für **Nicht-Stempler**. Keine Überschneidung.

### B-1 — Schema + reines Modul (`src/lib/cash/pool-time-writeback.ts`)

- Migration (getrennt): `ALTER TYPE … ADD VALUE 'pool'` (eigene Transaktion, vor Nutzung committet), dann partieller Unique-Index `time_entries_pool_key_unique (organization_id, import_key) WHERE source='pool'`.
- Reine Fn `buildPoolTimeEntryRows`: je Pool-Eintrag mit gesetztem `shift_start`+`shift_end`, **Kollisionsregel** (staff mit clock/manual am `business_date` → überspringen → kein Doppel), `crossesMidnight = end<start`, `start==end` → keine Row, `import_key='pool:<id>'`. Department egal (GL kommt mit).

### B-2 — Verdrahtung + TZ + Lohn-Nachrangigkeit

- **TZ:** `berlinOffsetMinutes`/`offsetString` aus `shift-hours.ts` exportiert + wiederverwendet; reine Fn `poolLocalTimeToIso(businessDate, "HH:MM", dayOffset)` baut den Berlin-korrekten ISO-Timestamp. **DST-getestet** (Winter/Sommer + beide Umstellungstage 29.03./26.10.) — bestimmt die SFN-Stunden, cent-relevant.
- **Verdrahtung** in `submitWaiterSettlementCore`: `assertBusinessDateUnlocked` (Wasserlinie → bei Sperre skip, kein Audit) → `buildPoolTimeEntryRows` → Insert mit `onConflict: organization_id,import_key, ignoreDuplicates` (idempotent) → Audit `pool_time.writeback {sessionId, businessDate, inserted}`. Best-effort: Writeback-Fehler kippt die Abrechnung **nicht**.
- **Lohn-Nachrangigkeit:** `lohn-period.functions.ts` lädt jetzt `source`; reine Fn `dropPoolWhenRealEntryExists` verwirft **vor** der Aggregation alle `pool`-Zeilen eines Tages, an dem ein `clock`/`manual`/`import`-Eintrag existiert.

### Doppelzählungs-Schutz (zwei Ebenen)

1. **Schreibseite:** `buildPoolTimeEntryRows` überspringt Stempler.
2. **Leseseite:** `dropPoolWhenRealEntryExists` lässt echte Zeit `pool` schlagen — robust auch gegen späteres Stempeln nach der Abgabe.

### Lektionen

- `ALTER TYPE … ADD VALUE` muss in **eigener** Transaktion committet sein, bevor ein Index/Code den Wert nutzt (sonst „invalid enum value").
- Geld-/zeit-kritische TZ-Konstruktion gehört in eine reine Fn **mit DST-Charakterisierung** (`poolLocalTimeToIso`) — nicht inline im I/O-Pfad.

## 24. Dienstplan & Display — Spalten-Feinschliff (30.06.2026)

Rein visuelle Angleichungen an Grid (`RosterGrid.tsx`) und öffentlichem Display (`display.$locationId.tsx`); keine Logikänderung.

- **Zweite Mitarbeiter-Spalte rechts:** Sowohl Grid als auch Display zeigen den Mitarbeiternamen jetzt links **und** rechts (vor der Σ-Spalte) — bei breiten Zeiträumen bleibt der Name am rechten Rand ablesbar.
- **Sticky-Spalten:** Linke Namensspalte, rechte Namensspalte und Σ-Spalte sind beim horizontalen Scrollen fixiert (solide Hintergründe, kein Durchscheinen).
- **Namen zentriert** in beiden Namensspalten (Grid + Display).
- **Zebra-Streifen im Display** (`even:bg-slate-900/40`); die sticky-Zellen führen den Streifen mit, damit die Zeile durchgängig wirkt.

## 25. Rolle „Planer" — eingeschränkter Dienstplan-Zugang (30.06.2026)

Verifizierter Endstand HEAD `e85943f` (tsc 0, eslint 0, vitest 943, prettier sauber). Neue **Seitenrolle** `planer`: darf Dienstpläne machen, aber nur in freigegebenen `(Standort, Bereich)`-Kombinationen. Sieht den ganzen Plan, ändert nur den eigenen Scope. SUMITR ist der erste Planer (Küche Spicery + YUM).

### P-1 — Schema + Rolle

- Migration (in COCO-DB ausgeführt): `app_role` um `'planer'` erweitert; `permission_overrides` um Spalte `area staff_department` (kitchen/service/gl), Unique-Indizes neu mit `area`.
- **`has_permission`**: neue 3-arg-Variante `has_permission(_perm, _location, _area)` (volle area-Logik: `location IS NULL` = global, `area IS NULL` = alle Bereiche; DENY > ALLOW > Default). Die bestehende 2-arg-Signatur **bleibt** und delegiert auf die 3-arg mit `_area := NULL` → RLS-Policies bit-identisch gültig, keine Ambiguität.
- `planer` trägt **Lese**-Defaults (ganzen Plan sehen), **kein** `roster.shift.manage` im Default. Schreibrecht gibt es ausschließlich als scoped ALLOW-Override (Standort + Bereich).
- `role-guard.ts`: `planer` ist **Seitenrolle** (RANK 0 wie `payroll`, **nicht** in der Hierarchie `admin > manager > staff`) → erbt keine Manager-Rechte.

### P-2 — Schreibpfad-Durchsetzung

Alle fünf Roster-Schreib-Functions prüfen `roster.shift.manage` gegen die **echte** `(location, area)` der Schicht, nie gegen `null`:

- `createRosterShift` → Input-Scope `(data.locationId, data.area)`.
- `delete`/`updateStatus`/`updateSkill` → Schicht **vor** dem Permission-Check laden (Pre-Load), dann gegen `(snap.location_id, snap.area)`.
- `moveRosterShift` → Quelle **und** Ziel: bei Bereichswechsel zusätzlich `assertPermission(snap.location_id, data.area)`.

DB-Test `roster-scope-p2.db.test.ts` deckt die Matrix ab (Planer create scoped ok/abgelehnt; „ohne area" abgelehnt = kein globaler Default; move kitchen→service Ziel abgelehnt; Manager-Regression).

### P-3a — Verwaltung + Zugang

- Rolle `planer` in der Rollen-Auswahl des Mitarbeiter-Stammblatts.
- area-Dimension im Berechtigungen-Tab (`PermissionsTab` + `setPermissionOverride`/`getStaffPermissions`): Standort **und** Bereich frei kombinierbar. **Kritisch:** das delete+insert-Upsert trifft area-genau (`data.area ? .eq("area") : .is("area", null)`) — ein (Standort, Küche)-Override reißt den (Standort, Service)-Override nicht mehr mit. DB-Test `permission-override-area.db.test.ts` beweist die Koexistenz.
- `admin/route.tsx`: `planer` darf ins Admin-Layout, aber **nur** `/admin/dienstplan` (Vorbild: `payroll` → `/admin/zeit-uebersicht`); Nav zeigt dem Planer nur den Dienstplan.

### P-3b — Fundament (UI-Spiegelung der Durchsetzung)

- Server-Fn **`getMyRosterScopes`**: prüft pro `(Standort × {kitchen,service})` via `has_permission` (mit dem **Caller**-Client, nicht `supabaseAdmin`) und liefert die schreibbaren Kombis. Für Admin/Manager automatisch alle, für Planer nur die Freigaben — das Frontend braucht **keine** Rollen-Sonderfälle.
- Reine Fns `allowedLocations`/`canEditScope` (`scope-util.ts`, unit-getestet).
- `dienstplan.tsx`: Standort-Auswahl auf erlaubte Standorte gefiltert (LocationPills + Default-Standort lösen sich automatisch); `canEdit = canEditScope(scopes, effectiveLocationId, activeArea)` — weil das Grid tab-/einzelstandort-basiert ist, greift damit jeder bestehende `if (!canEdit …)`-Gate korrekt: **sieht alles, malt nur den freigegebenen Bereich**.
- Login-Redirect: `planer` landet direkt auf `/admin/dienstplan` (kein Hub-Umweg).

### P-3c (Mehr-Standort-Ansicht) — bewusst **verworfen**

Eine gestapelte „beide Küchen auf einen Blick"-Ansicht (Multiblock) wurde geplant (P-3c-1 Vorbereitung gebaut), dann **zurückgebaut** (`e85943f` = bit-identisch zum P-3b-Zustand): zu verschachtelt (Cross-Block-Move, Freigabe pro Block). SUMITR nutzt die bestehende Umschalter-/Tab-Ansicht aus P-3b (Standortwechsel per Klick, nur erlaubte Standorte).

### Seitenrollen-Fixes (Folge von „Planer erbt keine staff-Rechte")

Functions mit `loadAdminCaller(…, "staff")` (String = `assertMinRole`, „mindestens staff-Rang") schließen `planer` (RANK 0) aus. An den Self-Service-Stellen, die ein Planer nutzen können soll, auf Array-Form `["admin","manager","staff","planer"]` umgestellt: **EasyOrder** (`getMyEasyOrderContext`/`getEasyOrderCatalog`/`placeEasyOrder`), **payslips** (`listMyPayslips` + Signed-URL), **wine-quiz** (Score speichern/lesen). Verwaltungs-Functions (`loadAdminCaller(…, "admin")`) bleiben für `planer` gesperrt. Zentrale Staff-Functions (Stempeln, Self-Service, Kasse) nutzen `loadStaffCaller` (rollen-agnostisch) — dort war nichts zu ändern.

### Auth-Feinschliff (Nebenarbeit)

`auth-attacher.ts`: abgelaufene/geleerte Session ohne Token leitet hart auf `/auth` (statt unverständlichem 401). Greift nicht im PIN-Login (läuft auf `/auth`, dort vom Redirect ausgenommen).

### Lektionen

- **Seitenrolle ⇒ keine `staff`-Vererbung.** Eine neue Seitenrolle (RANK 0) bricht jede Function, die per `loadAdminCaller(…, "staff")` (= `assertMinRole`) gated ist. Beim Einführen einer Seitenrolle für eine bisherige `staff`-Person systematisch alle solchen Gates prüfen. `loadStaffCaller` (kein Rollen-Filter) ist davon nicht betroffen.
- **Scope-Check immer gegen DB-Werte der Schicht** (Pre-Load), nie gegen `null`, nie gegen Client-Input.
- **`has_permission` 2-arg/3-arg-Koexistenz** via Delegation hält bestehende RLS-Policies gültig — neue Signatur additiv, alte delegiert.

## 26. Rolle „Planer" — Nachträge nach Live-Test (30.06.2026)

Befunde und Erweiterungen aus dem ersten Live-Test von SUMITR (erster Planer, Küche Spicery + YUM). Ergänzt §25. Verifizierter Stand HEAD `0824bcd` (tsc 0, eslint 0, vitest 943).

### a) Stammdaten-Lese-Functions für `planer` nachgezogen

§25/P-3b gab `planer` Zugriff auf `getMyRosterScopes` und die Roster-Daten-Functions (`READ_ROLES`), übersah aber die **generischen** Lese-Functions, die die Dienstplan-Seite zum **Initialladen** braucht. Folge: SUMITRs Dienstplan brach mit „Keine Periode angelegt", „(Read-only)" und App-Fehler.

Behoben — `planer` zu drei Functions ergänzt (reine Lesezugriffe): `listLocations`, `listPeriods` (je `"planer"` in die Rollen-Liste), `listSkills` (String-Gate `"manager"` → Array `["manager", "admin", "planer"]`).

**Lektion (zu §25):** Eine neue Seitenrolle braucht nicht nur die **fachspezifischen** Functions (roster), sondern auch die **generischen Stammdaten-Lese-Functions**, die die Seite beim Laden aufruft (Standorte, Perioden, Skills). Beim Freischalten einer Rolle die **komplette** Query-Liste der Seite durchgehen.

### b) „Vorschau als" (Impersonation) spiegelt Seitenrollen nicht sauber

Der Live-Test über **„Vorschau als SUMITR"** (Admin-Impersonation, `admin_impersonations`) schlug fehl, obwohl der Planer-Code korrekt ist. Über **echten PIN-Login** funktioniert alles.

Ursache: Während einer Impersonation lösen die DB-Helfer (`current_role`, `_effective_user_id`, RLS) die Identität über `admin_impersonations` auf den **Mitarbeiter** auf — `loadAdminCaller` nimmt aber weiter `context.userId` = **echter Admin**. `getMyIdentity` ist impersonation-bewusst, `loadAdminCaller` nicht → bei einer scoped Seitenrolle laufen die Ebenen auseinander.

**Merkpunkt:** Seitenrollen (planer, payroll) über **echten Login** verifizieren, nicht über „Vorschau als". Kein Produktions-Blocker. **Offen (zurückgestellt):** `loadAdminCaller` impersonation-bewusst machen (analog `getMyIdentity`).

### c) Abwesenheits-Durchsetzung scoped (P-2-Lücke geschlossen)

P-2 hatte nur `roster.shift.manage` für die fünf Schicht-Functions scoped; die **Abwesenheits**-Functions blieben offen. Nachgezogen: `setAbsence`, `clearAbsence`, `setAbsenceRange` setzen jetzt `roster.absence.manage` scoped durch.

Mechanik: Eine Abwesenheit gilt einem **Mitarbeiter** (nicht einer Schicht), hat also keinen eigenen (Standort, Bereich). Neue Helfer-Fn `resolveAllowedStaffScope(staffId, perm)` lädt die `staff_locations` des betroffenen Mitarbeiters und gibt den ersten `(location, area)` zurück, in dem der **Caller** das Recht hat (`has_permission` im Caller-Client, `staff_locations` RLS-frei via `supabaseAdmin`). Dieser Scope geht in `runWithPermission` — findet sich keiner (`{null, null}`), wirft es für den Planer (Admin/Manager bleiben global true).

**Praxis-Hinweis:** `planer` hat per Default **nur** `view`-Rechte für Abwesenheiten, **kein** `roster.absence.manage`. Soll ein Planer Abwesenheiten verwalten, braucht er dafür **eigene Overrides** (Standort+Bereich), analog zum `roster.shift.manage`-Setup. Ohne diese Overrides plant er nur Schichten — Abwesenheiten werden serverseitig abgelehnt (gewolltes Verhalten, sofern keine Override gesetzt).

### d) Bereich-Tabs auf erlaubte Bereiche beschränkt (`visibleAreas`)

Statt dem Planer beide Tabs (Küche/Service) zu zeigen und Service nur read-only zu halten (P-3b), zeigt der Dienstplan jetzt **nur die Bereiche, in denen der Planer am aktuellen Standort einen Scope hat**. `dienstplan.tsx` leitet `visibleAreas` aus `scopes` (für `effectiveLocationId`) ab; `RosterGrid` rendert nur die zugehörigen `TabsTrigger`. Ein `useEffect` schaltet `activeArea` auf den ersten sichtbaren Bereich um, falls der aktive ausgeblendet wird. Für Admin/Manager (keine spezifischen Scopes, globaler Default) bleiben beide Tabs sichtbar.

### e) Bereich-Freigabe: optimistisches Cache-Update

Der Freigabe-Toggle (`AreaReleaseControl`, „Plan freigeben") aktualisiert den `roster-release`-Cache jetzt optimistisch via `setQueryData` (vorher nur `invalidateQueries`) und invalidiert danach. Das korrigiert einen Anzeige-Abbruch beim Umschalten der Freigabe.

### f) Ist-Zustand SUMITR (Live, 30.06.2026)

SUMITR ist als erster (und bislang einziger) `planer` produktiv. Setup per SQL in der **COCO-DB**: Rolle `planer` (`role_assignments`) + vier `permission_overrides`, alle `effect='allow'`:

- `roster.shift.manage` — Spicery/Küche, YUM/Küche
- `roster.absence.manage` — Spicery/Küche, YUM/Küche

Damit plant SUMITR Schichten **und** verwaltet Abwesenheiten für Küchen-Mitarbeiter in Spicery + YUM. Die Bereich-Tabs zeigen ihm nur „Küche" (§26.d); andere Standorte/Bereiche bleiben read-only. **Verifiziert über echten PIN-Login** (nicht „Vorschau als" — §26.b). Soll ein weiterer Bereich/Standort dazukommen, je ein zusätzliches `allow`-Override pro `(Standort, Bereich)` und Permission setzen.

## 27. Trinkgeld-Pool — Arbeitszeit-Herleitung: Küche fest, Service aus Abgabe („Ablauf B") (01.07.2026)

Präzisiert §21 (Plan-Snapshot) und §23 (Pool-Zeiten → `time_entries`). Die Pool-Stunden je Mitarbeiter stammen aus einer von drei Quellen: (a) Ist-Stempelzeiten (`time_entries`), (b) manuelle Einträge, (c) Dienstplan-Snapshot mit **festen Abteilungs-Zeiten** aus `location_department_defaults` (`default_checkin`/`default_checkout` je Standort + Abteilung). „Aus Dienstplan ergänzen" nutzt (c).

### Live-Befund (30.06./01.07.): alle 0,00 Stunden

Ursache: Die Spalte `default_checkout` wurde erst am 30.06. neu angelegt und war für die Standorte leer (NULL). Der Snapshot verlangte pro Abteilung **beide** Zeiten — fehlte checkout, wurden `shift_start` **und** `shift_end` auf NULL gesetzt, und der B-2-Writeback (§23, `buildPoolTimeEntryRows`, Regel 1 „beides nötig") übersprang die Zeile. Ergebnis: 0,00, „manuell".

### Küche — feste Zeiten

Die Küche läuft über feste Defaults: `default_checkin` 15:00 (geseedet), `default_checkout` **23:30** ist unter `/admin/standortzeiten` (admin) je Standort einzutragen. Der Modus „Küchentrinkgeld manuell verteilen" (`kitchenManualOnly`, §21) ignoriert die Küchen-**Stempel** — die Zeiten kommen dann synthetisch aus den Defaults, nicht aus der Stempeluhr.

### Service — variables Ende aus der Abrechnungsabgabe („Ablauf B")

Kellner stempeln **nicht** ein. Der Snapshot setzt für `department='service'` nur noch `shift_start` = `default_checkin` (16:00); `shift_end` bleibt **offen** (checkout wird für Service NICHT benötigt). Küche/GL unverändert (Küche braucht beide, GL manuell/0).

Bei der Abrechnungsabgabe (`submitWaiterSettlement`) setzt `applyServicePoolEnd` das `shift_end` des abgebenden Service-Kellners aus dem **Abgabezeitpunkt**:

- **Stempler** (offener Eintrag vorhanden): Ende = tatsächliche Ausstempelzeit (`performClockOut`).
- **Nicht-Stempler**: Ende = Zeitpunkt der Abgabe.
- Nur wenn `shift_end` noch NULL ist (manuell gesetzte Enden bleiben).

Die reine Fn `resolveServicePoolEnd` (`src/lib/cash/service-pool-end.ts`, getestet) rechnet Berlin-lokal mit 3-Uhr-Geschäftstag-Cutoff: Ende ≥ Start → `dayOffset 0`; Ende < Start und < 03:00 → `dayOffset 1` (Wrap über Mitternacht); Ende < Start und ≥ 03:00 → `null` (Abgabe vor Schichtbeginn, kein Eintrag). Danach greift der bestehende B-2-Writeback (§23) und erzeugt den `time_entry (source='pool')` mit 16:00–Abgabe.

**Ehrlichkeitsregel:** `resolveServicePoolEnd`/`applyServicePoolEnd` **ersetzen** die frühere `syncServicePoolEndFromAutoClockout`, die an ein festes `default_checkout` gebunden war. Für Service gibt es kein festes Ende mehr.

### Verwaltung

`/admin/standortzeiten` (admin-only) pflegt `default_checkin`/`default_checkout` je Standort + Abteilung. Für Küche beide setzen (15:00/23:30); für Service reicht `default_checkin` (16:00).

### Zeiten korrigieren (Pool-Ansicht)

Die Pool-Tabelle (`TipPoolCard`, Zeilen-Komponente `PoolRow`) zeigt pro Mitarbeiter **Anfang** und **Ende** und lässt sie direkt korrigieren. Zeit-Felder sind editierbar bei Service-Zeilen (immer) und Küchen-Zeilen im Manuell-Modus (`kitchenManualOnly`); im Küchen-Stempel-Modus sind Anfang/Ende read-only. Die Stunden aktualisieren sich live aus Anfang/Ende (`kitchenShiftMinutes`); gespeichert wird pro Zeile per Button über `upsertSessionTipPoolEntry` (manager+, `assertCashWritable`, Audit). Gesperrte/finalisierte Tage bleiben schreibgeschützt. GL behält seinen eigenen Abschnitt (`GlRow`); die Anteils-/Geldberechnung ist unberührt.

### Übertrag in die Zeiterfassung (laufender Sync)

Jede Änderung einer Pool-Zeit hält den zugehörigen `time_entries`-Eintrag (`source='pool'`, `import_key = pool:<entryId>`) synchron — Grundlage für die spätere Lohnauswertung. `syncPoolTimeEntry` läuft an **beiden** Stellen: beim manuellen Speichern (`upsertSessionTipPoolEntryCore`) und bei der Abrechnungsabgabe (`submitWaiterSettlement` — ersetzt den früheren nur-erzeugenden Writeback aus §23).

Die reine Fn `resolvePoolTimeEntrySync` entscheidet: echter Stempel (`clock`/`manual`/`import`) am Tag → **delete** (Stempel gewinnt, keine Doppelzählung); Zeit unvollständig oder zurückgenommen → **delete**; sonst **upsert** — **aktualisierend** (kein `ignoreDuplicates`), mit `crossesMidnight` für Schichten über Mitternacht. Das Löschen ist dreifach gescoped (`organization_id` + `import_key` + `source='pool'`); echte Stempel werden nie angetastet. Best-effort: ein Sync-Fehler kippt weder Abgabe noch Korrektur (nur Log). Getestet inkl. Mitternachts-Wrap und DST-Wechsel (26.10.).

**Praxis:** Für bereits abgerechnete Tage ohne übertragene Zeiten (z. B. YUM vor dem Ablauf-B-Stand) die Zeiten einmal neu speichern — das löst den Sync aus.

## 28. Session wieder öffnen + Datumswähler (01.07.2026)

**`reopenSession`** (`cash.functions.ts`, admin-only via `loadAdminCaller(…, "admin")` + `runGuarded(…, "admin")`): öffnet eine **abgeschlossene** Session wieder (`status='open'`, `finalized_at`/`finalized_by` → NULL). Guards: nur `finalized` (offene und `locked` werden abgelehnt); Wasserlinie via `assertCashWritable` (`cashLockedThroughDate`) — ein gesperrter Geschäftstag bleibt gesperrt, auch für Admins. Audit-Action `cash.session.reopened`.

**Datumswähler** in `kasse.tsx`: vergangene Geschäftstage ansehen (Grundlage für Korrekturen via `reopenSession`).

## 29. Kalender-Abo für Dienstplan-Schichten (Schritt 1: Backend, 01.07.2026)

Mitarbeiter können ihre eingeteilten Schichten (`roster_shifts`) als iCalendar-Feed im Handy-Kalender abonnieren — iPhone **und** Android/Google (`.ics` ist ein universeller Standard). Persönliche, widerrufbare Abo-URL; der Kalender pollt periodisch und aktualisiert die Schichten selbst.

### Token

Über das bestehende `access_tokens`-System: neuer `token_type`-Enum-Wert `calendar_feed` (`ALTER TYPE … ADD VALUE IF NOT EXISTS`). Ein Abo-Token = Zeile mit `staff_id`, `expires_at=NULL` (dauerhaft), `used_at=NULL` (aktiv; Widerruf setzt `used_at`). Erzeugt per `generateBadgeToken` (32 Byte CSPRNG, base64url).

### Öffentliche Feed-Route

`src/routes/api/public/calendar.$token.ts` → `/api/public/calendar/<token>[.ics]` (der `/api/public/*`-Präfix bypasst die Publishing-Auth; Muster: Display-Route). Sicherheit: timing-sichere Token-Prüfung (`safeCompare` + `used_at IS NULL` + `expires_at`), generisches `404` bei jedem Fehler, Datenzugriff **doppelt gescoped** (`organization_id` + `staff_id` → nur die eigenen Schichten, kein Fremd-Leck), Token nie geloggt. Antwort `Content-Type: text/calendar`. Fenster: `heute-30 … heute+120`.

### Zeit-Modell

`roster_shifts` haben keine Uhrzeiten — die Zeiten kommen aus `location_department_defaults` je `(location, area)`: `default_checkin` **und** `default_checkout` gesetzt → zeitliches Event (`checkout < checkin` → Ende Folgetag, Mitternachts-Wrap); sonst Ganztags-Event. Für Service ist `default_checkout` eine reine **Kalender-Anzeige** (die echte Arbeitszeit bleibt via Ablauf B unberührt, §27). Lokale Zeit → UTC via `poolLocalTimeToIso` (DST-korrekt). Titel = Bereich-Label + ggf. `· <Skill>`, Ort = Standortname.

### Reine Fn + Self-Service

`buildRosterIcs` (`src/lib/calendar/roster-ics.ts`, getestet): RFC-5545-Escaping, stabile `UID` (`roster-<shiftId>@coco` → Updates/Löschungen ziehen mit), UTC-Basic / `VALUE=DATE`-Fallback. Server-Fns `getOrCreateMyCalendarToken`/`revokeMyCalendarToken` (`loadCallerLink` → `staffId` aus `auth.uid`).

### Schritt 2 (UI, umgesetzt)

Seite `/zeit/kalender` (Kachel „Kalender-Abo" im `/zeit`-Hub): holt den Token via `getOrCreateMyCalendarToken`, baut `httpsUrl = window.location.origin + feedPath` und `webcalUrl` (Schema `https`→`webcal`). „Im Kalender öffnen" (`<a href={webcalUrl}>`, öffnet den iPhone-Abo-Dialog), Kopierfeld mit der https-URL (für Android/Google Kalender), Klapp-Anleitung iPhone/Android, Geheim-Hinweis, Widerruf („Link zurückziehen & neuen erstellen" → `revokeMyCalendarToken` + `invalidateQueries`/`refetch` → neuer Token, neue URL). Kein `localStorage`.

### Betrieb

Voraussetzung für zeitliche Service-Events: `default_checkout` für Service unter `/admin/standortzeiten` eintragen (sonst ganztägig; Küche zeigt 15:00–23:30, sobald die Auscheckzeit dort steht). Android: URL-Abo geht bei Google nur am Computer (calendar.google.com → „Per URL"), nicht in der Handy-App — daher der Kopier-Weg auf der Seite.

## 30. Session-Eröffnung: ausschließlich durch Manager/Admin (02.07.2026)

Kassen-Sessions werden **nur** von Manager/Admin eröffnet — über den „Session anlegen"-Button in `/admin/kasse` (Fn `getOrCreateOpenSession`, `manager`-gated via `loadAdminCaller` + `runGuarded`; legt die Session an und erzeugt den Trinkgeld-Pool-Snapshot über `ensureOpenSessionRaw`). Kellner öffnen nichts selbst: `/zeit/abrechnung` zeigt bei fehlender Session eine read-only Hinweiskarte („… für den Geschäftstag wurde noch keine Session eröffnet, bitte an Manager/Admin wenden"). Sobald die Session existiert, rechnen die Kellner normal ab.

**Betriebsablauf:** Manager/Admin öffnet je Standort einmal pro Geschäftstag die Session in `/admin/kasse` → „Session anlegen". Danach rechnen die Kellner dort ab.

**Bewusst verworfene Alternativen (nicht wieder einbauen):**

- **Kellner-Auto-Open** (`ensureMyOpenSession` + Auto-Retry-Loop in `abrechnung.tsx`): an „wer zuerst kommt" gekoppelt, fragil — entfernt.
- **Einteilungs-Regel** „nur wer als Service im Dienstplan steht, darf eröffnen" (`resolveSessionLocation` / `resolveMySessionLocation`, Service-Schicht-Pflicht): sperrte real arbeitende Kellner aus, wenn der Dienstplan nicht tagesaktuell gepflegt war, und verursachte Session-Filter-Kollisionen bei mehreren offenen Standort-Sessions — komplett zurückgebaut.
- **Täglicher Cron-Automatismus** (`ensureDailySessions` + Route `/api/public/cron-ensure-sessions` + Supabase `pg_cron`/`pg_net`): zu komplex und fragil (URL-/Secret-/Deploy-Abhängigkeiten) — Route und Fn gelöscht, `pg_cron`-Job entfernt (`cron.job` leer).

Grundsatz für die Zukunft: bewusster, sichtbarer Handgriff (Manager öffnet) vor implizitem Automatismus — bei Geld-/Zeit-Daten ist Nachvollziehbarkeit wichtiger als Bequemlichkeit.

## 31. Kassen-Abrechnung: Fixes + Partner-Verknüpfung (02.07.2026)

Drei Fehler in der Kassen-/Kellner-Abrechnung behoben (alle Gates grün, vitest 970).

### Abgleich zählt korrigierte Abrechnungen nicht mehr doppelt

`SettlementWarningsBanner.tsx` summierte für POS-/Terminal-Differenz **alle** `overview.settlements` — auch `superseded`-Zeilen. Nach einer Kellner-Korrektur wurde dadurch jeder Betrag doppelt gezählt (Original + Korrektur). Fix: nur `activeSettlements` (`status !== "superseded"`) fließen in die Warnung. Das Backend filterte superseded bereits überall; nur dieser Frontend-Banner nicht.

### Mehrere Kellner pro Abrechnung — Verknüpfungstabelle `settlement_partners`

Die Kellner-Abgabe speicherte mitarbeitende Kellner ursprünglich nur als Text (`second_waiter_name`) — sie erschienen nicht als Paar und mussten manuell nachkorrigiert werden. Nach einem Zwischenschritt (einzelnes `partner_staff_id`) gilt jetzt das finale Modell, weil im Betrieb auch **alle** Kellner zusammen abrechnen können: **ein** Kellner gibt für die ganze Gruppe ab (Gesamt-Umsatz) und wählt **beliebig viele** Beteiligte.

- **Datenmodell:** Tabelle `settlement_partners` (`settlement_id` ↔ `staff_id`, unique, FK cascade; RLS: org-scoped SELECT, Schreiben nur serverseitig/`service_role`). Backfill hat bestehende `partner_staff_id`-Paare übernommen. Die Alt-Spalten `partner_staff_id`/`second_waiter_name`/`additional_waiters` bleiben für Alt-Daten, werden **nicht mehr geschrieben**.
- **Backend:** `submitWaiterSettlementCore`/`correctWaiterSettlement` nehmen `partnerStaffIds: string[]`; je ID validiert (≠ Haupt-Kellner, `assertStaffBoundToLocation`, Kollisions-Check `assertPartnersFree` über **beide** Quellen: `waiter_settlements` und `settlement_partners` aktiver Abrechnungen, `excludeSettlementId` für den Korrektur-Pfad). Anzeige `staffName` = „A + B + C" aus `settlement_partners`, `partnerStaffNames: string[]`.
- **UI:** dynamische Liste von `SecondWaiterSelect` („+ weiterer Kellner", Entfernen je Zeile), jede Auswahl schließt Haupt-Kellner und bereits gewählte aus. Badge: 1 Partner = „Paar", mehrere = „Gruppe".
- **Zweck der Verknüpfung:** Anzeige + Schutz vor Doppel-Abrechnung. Die **Trinkgeld-Verteilung ist unabhängig davon** — sie läuft über Arbeitszeit/`session_tip_pool_entries` (§27).

### Kassen-Eingabefelder springen nicht mehr

`SessionFieldsCard.tsx`: Der Reset-`useEffect` hing an `[overview]` und überschrieb bei **jedem** Auto-Save-Refetch die laufende Eingabe (Terminal-Beträge u. a. „sprangen" beim Tippen). Fix: Dependency `[overview.session?.id]` — Reset nur bei echtem Session-Wechsel (Standort/Tag/neu geöffnete Session), nicht bei Refetch derselben Session. Betrifft alle Felder der Karte.

### Offen / bekannt: Kellner tragen „Karte" ≈ Umsatz statt Kartenanteil

Live-Befund YUM 01.07.: Beide Kellner hatten den Kartenbetrag ≈ Gesamtumsatz eingetragen (Karte teils > Umsatz), statt nur den tatsächlichen Kartenanteil. Echte Kartensumme = Terminals (2.107,79 €); Differenz war reine Fehleingabe, kein Code-Fehler (die Korrektur übernahm die Werte 1:1). To-do Frank: betroffene Abrechnungen per Korrektur anpassen (Karte runter, Bargeld rauf, Summe bleibt). Prävention (offen, optional): klarerer Hinweis am „Karte"-Feld („nur Kartenanteil") + Warnung bei Karte > Umsatz.

Ferner: Auth-Redirect-Flow direkt in Lovable gefixt (`f8d41ad`).

## 32. D3-Display: Zebra, Legende, Symbol-Vereinheitlichung (02.07.2026)

- **Zebra im Grid:** Grid-Zellen tragen jetzt `bg-slate-950` + `group-even/row:bg-slate-800/70` — der Zeilenwechsel ist so deutlich wie in den Namensspalten. Wochenend- und Heute-Markierung sind als `ring-inset` (Rahmen) statt konkurrierender `bg`-Klasse umgesetzt, damit sie den Zebra nicht überdecken (Tailwind-`bg`-Klassen gleicher Spezifität verdrängen sich sonst gegenseitig).
- **Legende = echte Symbole:** Footer in drei Gruppen — Küche (`VS` Vorspeise · `PA` Pass · `SP` Spülen · `CO` Kochen), Service (`X` Service · `GL` Geschäftsleitung · `B` Bar · `19h` · `H` Hausmeister), Status (`−` Frei · Umbrella grün Urlaub · HeartPulse rot Krank · Heart lila Wunsch-frei). Die Status-Einträge nutzen die **echten Lucide-Icons in den Grid-Farben** (green-/red-/purple-400), kein Unicode.
- **„Verfügbar" zusammengelegt:** Der Zell-Zustand `available` rendert nicht mehr `○`, sondern `−` wie „Frei" — ein Symbol für beides; „Verfügbar" ist aus Grid und Legende entfernt (Darstellung; Datenmodell unverändert).
- Randnotiz: Spicery-Display-Settings per Direkt-Migration an YUM angeglichen (`custom_message`, `rotation_interval_seconds`).

## 33. Geld-Regel: GL-Kartenzahlungen mindern das Tages-Bargeld NICHT (02.07.2026)

**Live-Befund (Parallelbetrieb, 01.07.):** COCO und die produktive tagesabrechnung zeigten für denselben Tag abweichende Ergebnisse — Tages-Bargeld −409,03 € vs. −384,23 €, Wechselgeldbestand 675,56 € vs. 700,36 €. Differenz exakt 24,80 € = „Kredit Karten GL". Alle übrigen Eingaben und der Vortags-Fehlbetrag waren identisch; die Formeln (`computeDailyCash`, `computeWechselgeld` — Golden-Master-Portierung) korrekt.

**Regel (Referenz Legacy-tagesabrechnung):** In den Kartenabzug des Tages-Bargelds fließen **nur physische Terminals** (Terminal 1 + 2). GL-Kartenzahlungen (`payment_terminals.is_gl = true`) sind ein **Kontrollposten** — sie gehören in den Terminal-Abgleich („Σ Terminals = Kellner-Karten + GL", §31), mindern aber das Bargeld nicht.

**Umsetzung:** Beide Ladestellen der Aggregation joinen `payment_terminals!inner(is_gl)` und überspringen GL-Zeilen beim Summieren; reine, getestete Helper-Fn `sumNonGlTerminalCents` (`session-channels.ts`). **Verifikation:** COCO zeigt für 01.07. exakt die tagesabrechnung-Werte (Tages-Bargeld −384,23 €, Wechselgeldbestand 700,36 €).

**Lektion:** Der Parallelbetrieb gegen die Legacy-Referenz ist der wirksamste Abgleich — Cent-Differenzen dort sofort ausermitteln, nicht wegerklären.

**Nachzug 03.07.:** Dritter Pfad gefunden (Live-Differenz 27,80 € Spicery) — der client-seitige KONTROLLE-Block der Kassen-Eingabeseite (`CashSummaryBlock` via `SessionFieldsCard`) summierte ALLE Terminal-Formularzeilen inkl. GL; der `isGl`-Marker fehlte schon im Props-Typ. Fix: `cardDeductionFromTerminalRows` (pure, getestet) + `isGl` durch die Props-Kette. Server-Pfade (PDF/Verlauf/Tresor) waren korrekt — reiner Anzeige-Fehler, DB-Daten sauber. **Lektion:** Eine Geld-Regel hat so viele Fix-Stellen, wie es Rechenpfade gibt — bei Regel-Fixes IMMER alle Aufrufer der Größe suchen (grep nach dem Feldnamen), nicht nur die gemeldete Stelle.

## 34. Code-Audit Phase 1: toter Code & Dependencies (02.07.2026)

Werkzeuggestütztes Audit (knip 5, Entry-korrigiert für TanStack Start; npm audit; grep-Inventuren) über 431 Dateien / ~76k Zeilen. Gesamtbild: sehr sauber (0 `console.log`, 2 dokumentierte TODOs, keine Rollback-Reste).

### Behoben

- **`@dnd-kit/utilities`** stand nicht in `package.json`, wurde aber importiert (Dienstplan-Drag&Drop) — lief nur als transitive Dependency. Explizit aufgenommen (`^3.2.2`).
- **Toter Code entfernt:** `order-units.functions.ts` (M5-Rest, 0 Aufrufer) und der komplette **Badge-/QR-Login-Rest** aus B1c (`badges.functions.ts`, `resolveBadgeToken`, `activeBadges`-Zählung im Mitarbeiter-Index — nie mit UI verdrahtet; Entscheidung: Feature wird nicht weiterverfolgt). `@types/bcryptjs` entfernt (bcryptjs v3 bringt eigene Typen; `bcryptjs` selbst bleibt — PIN-Hashing).

### Bewusste Behalten-Entscheidungen (bei künftigen Audits NICHT erneut aufwerfen)

- **shadcn/ui-Vorrat** (`src/components/ui/*`, ~25 ungenutzte Komponenten + zugehörige Radix-Pakete): Standard-Lovable-Setup, Lovable greift beim UI-Bau darauf zu — bleibt.
- **`*Core`-/Helper-Export-Breite** (~50 „unused exports"): bewusste Konvention (reine/Core-Fns exportiert für Testbarkeit) — Feature, kein Schmutz.
- **knip-False-Positives:** `src/start.ts` (TanStack-Framework-Einstieg, lädt `auth-attacher` + `server-fn-error-logger` — alle lebendig), `tailwindcss`/`tw-animate-css` (via `src/styles.css` `@import`), `@tanstack/router-plugin` (Build-Kette).
- **`token-generator.ts` (`generateBadgeToken`)**: trotz Namens KEIN Badge-Rest — generischer CSPRNG-Generator, vom Kalender-Feed (§29) genutzt.
- **DB unangetastet:** Enum-Wert `token_type='badge_login'` und Alt-`access_tokens` bleiben (Enum-Rückbau riskant, ohne Nutzen).

### Offen / beobachten

- **npm audit:** 2× moderate via `exceljs`→`uuid` (GHSA-w5hq-g745-h8pq). Auto-Fix wäre Breaking-Downgrade → nicht angewendet; beobachten bis exceljs upstream fixt (Alternative: npm-`overrides`).
- Die 5 tolerierten `exhaustive-deps`-Warnings: weiterhin §8-Merkposten.
- **Phase 2 (DB-Audit):** RLS-Inventur + verwaiste Tabellen/Spalten per Diagnose-SQL. **Phase 3:** manuelles Review Geld-/Auth-Pfad. Beide ausstehend.

## 35. Code-Audit Phase 2: Live-DB-Inventur (02.07.2026)

Live-Inventur der COCO-DB (5 Diagnose-SQLs, CSV-verifiziert): Policies, Tabellen-Status, Referenzen, Trigger, Enums — abgeglichen gegen den Code.

### Ergebnis: DB in ausgezeichnetem Zustand

**0 anon-Policies · 0 Tabellen ohne RLS · 0 DB-Drift** (63 Live-Tabellen = exakt die 63 code-bekannten, trotz monatelanger Direkt-SQL-Arbeit) · 33 Trigger ausnahmslos Standard-Muster (updated_at/Seeds), keine Rollback-Reste · Enums decken sich mit dem Code. Die RLS-Helper sind quicklebendig: `has_min_permission` (30 Policies), `is_admin` (22), `current_staff_id` (13), `is_real_admin` (4), `_effective_user_id` (5 Function-Bodies).

### Zurückgebaut (Migration `20260702152005`)

- **Bestelleinheiten-Anschluss komplett entfernt** (Entscheidung Frank): `articles.order_unit_id` (Spalte + FK), Tabelle `order_units` (leer, count=0 live geprüft; ihre 4 Policies fielen mit) sowie `orderUnitId` aus `articles.functions.ts`/`bestellung.wein.tsx`. Begründung: nie fertiggestellt (Verwaltungs-Code war der Phase-1-Fund ohne Aufrufer), seit M5-Go-live mit 1.335 Artikeln nie befüllt; `articles.unit` + `articles.packaging_unit` sind die gelebten Einheiten-Felder.
- **Zwei referenzlose DB-Functions gedropt:** `effective_permissions(uuid)`, `has_role(app_role)`.

### Bewusste RLS-Ausnahmen (bei künftigen Audits NICHT erneut aufwerfen)

- **`permission_role_defaults` mit `USING (true)` für `authenticated`** — das einzige Flag der Inventur: globaler Berechtigungs-Katalog (nur `role`/`permission`/effect, keine `organization_id`, keine Personen-/Org-Daten) → Lesen für alle Angemeldeten ist korrekt. Dies ist die dokumentierte Ausnahme zum §7-Gesetz.
- **Sechs gewollte deny-all-Tabellen** (0 Client-Policies, Zugriff nur serverseitig/service_role): `access_tokens`, `audit_log`, `pin_attempts`, `staff_pins`, `roster_releases`, `article_locations`.
- **`generate_order_number` LEBT** — Spalten-DEFAULT von `orders.order_number` (Bestellnummern ORD-JJJJ-MM-nnnn). Nie droppen.

### Audit-Lektion (Methodik)

Der Referenz-Check prüfte Policies, Function-Bodies und Trigger — aber **nicht Spalten-DEFAULTs**: `generate_order_number` war dadurch fälschlich als referenzlos eingestuft; der DROP scheiterte sauber (transaktionaler Rollback, Lovable stoppte korrekt ohne CASCADE). **Regel: DB-Referenz-Checks müssen auch `pg_attrdef` (Spalten-DEFAULTs), Views und Constraints einschließen.** Und: `drop function` bei Überladungen immer mit expliziter Signatur.

### Offen

Phase 3 (manuelles Review Geld-/Auth-Pfad) — letzter Audit-Teil.

## 36. Code-Audit Phase 3: manuelles Review Geld-/Auth-Pfad (02.07.2026)

Abschluss des dreiteiligen Audits (§34 Code, §35 DB). Geprüft: Auth-Kern (PIN-/Passwort-Login,
Shadow-User, requireSupabaseAuth, loadAdminCaller/runGuarded/runWithPermission, Impersonation,
Kalender-Token + öffentliche Feed-Route, Payslip-Storage) und Geld-Pfad (alle Kassen-ServerFns,
Settlement-Rechenkern, Trinkgeld-Pool, Superseded-Logik, EasyOrder/Orders, Lohn-Functions).

### Bestätigt

- Genau EINE ServerFn ohne Auth-Middleware im gesamten Repo: `validatePin` (dokumentiert öffentlich).
- Alle Geld-Schreibpfade: loadAdminCaller → runGuarded → loadSessionWithLock → assertCashWritable,
  Org-Scope auf jedem Query. staffId in Staff-Flows nie vom Client.
- Geld durchgängig Integer-Cents (Zod `.int()` + `Number.isInteger`-Härtung im Rechenkern),
  Rundung Half-Away-From-Zero, getestet. `superseded` an allen Lesestellen ausgeschlossen.
- Impersonation über `is_real_admin` (nicht `is_admin`), org-gescoped, auditiert.
- Kalender-Feed: timing-safe Vergleich, generisch 404.

### Behoben

- Passwort-Fallback in `validatePin` hatte KEIN App-Rate-Limit (nur der PIN-Zweig): jetzt gleiches
  5-in-15-Min-Fenster + `pin_attempts`-Logging für beide Credential-Typen
  (`isCredentialAttemptAllowed` in pin-validation.ts).
- `isPayslipPathAllowed` weist jetzt `..`/`\` ab (Defense-in-Depth; Storage-Keys sind literal,
  praktisch war es nicht ausnutzbar).

### Bewusste Akzeptanz (bei künftigen Audits NICHT erneut aufwerfen)

- **Klartext-Tokens in `access_tokens`** (calendar_feed, display): Tabelle ist deny-all/
  service-role-only; Hashing brächte nur bei einem DB-Dump-Leak Schutz. §29-Designentscheidung.
- **`listStaffForImpersonation` listet auch inaktive Mitarbeiter** — reines UX-Thema, der Start
  blockt Accountlose; keine Sicherheitsrelevanz.

## 37. Kassen-Reset + Re-Import „Cleaning Cut" (02.07.2026)

Kompletter Reset aller COCO-Kassen-/Abrechnungs-/Trinkgelddaten inkl. Tresor und
Neuimport aus tagesabrechnung (LIVE-Quelle). Grund: Test-Abrechnungen mit falschen
Zahlen (Experimente ab 16.05.) hatten die Kassendaten verunreinigt. Zugleich war
dies die Generalprobe für den Go-live-Re-Import nach der §5-Methode.

### Ablauf (wiederverwendbar für den Go-live-Import)

1. **Export zuerst** (tagesabrechnung, nur SELECT): sessions, waiter_shifts,
   kitchen_shifts komplett als CSV — Sicherung VOR jeder Löschung.
2. **Diagnose** (COCO): Bestand aller Kassen-Tabellen, time_entries nach source,
   Wasserlinie. Ergebnis: keine `pool`-/`manual`-Einträge vorhanden → Löschung
   lohnseitig unkritisch (edlohn-abgeglichene Perioden Mai/Juni unberührt).
3. **Löschen** (COCO): FK-geordnet in einer Transaktion (settlement_partners →
   waiter_settlements → session\_\* -Kinder → sessions → time_entries source='pool'),
   org-gescoped, Rest-Check im SELBEN Editor-Lauf (alle 12 Tabellen = 0).
4. **Import** (COCO, §5-Methode): Mapping-Check als Pflicht-Gate (Q1 muss leer
   sein) → Sessions → Kanäle/Terminals → Settlements → Tip-Pool in Batches →
   Abschluss-Abgleich mit eingebetteten Soll-Zahlen je Monat × Standort.

### Endstand (verifiziert, Ist = Soll)

sessions 271 · waiter_settlements 872 · session_tip_pool_entries 2363 ·
session_channel_amounts 646 · session_terminal_amounts 592.
Zeitraum: 16.02.–01.07.2026 (YUM + Spicery).

### Lektionen / Regeln für den Go-live-Re-Import

- **Laufenden Geschäftstag NIE importieren** (Stichtag = gestern): der offene Tag
  der Quelle würde als leere Hülle landen und wäre durch `WHERE NOT EXISTS` beim
  nächsten Import blockiert (§5-Hüllen-Falle).
- **Namens-Overrides Kasse** (Quelle → COCO display_name): GUNC→GUNG,
  PAE→SUMITR, jirawut.saechiang→COCO, **KRIS→KRISS** (Quelle schrieb dieselbe
  Person in zwei Schreibweisen; 47 Zeilen fielen erst im Abgleich auf).
- **Der Abschluss-Abgleich ist Pflicht**, nicht Kür: der Namens-Join lässt
  unaufgelöste Zeilen STILL fallen — nur der Soll/Ist-Vergleich je Monat ×
  Standort fängt das (hat KRIS und eine FRANK-Zeile gefunden).
- **Mitternachts-Wrap der Quelle:** kitchen_shifts mit shift_end=00:00 haben
  negative hours_worked (end−start ohne Wrap). Fix: bei h<0 → h+24.
- **Bewusst ausgelassen:** 1 Zusatzkellner-Eintrag „FRANK" (17.02., Spicery,
  0 Minuten, kein staff-Datensatz) — kein Pool-Beitrag, kein Nachtrag nötig.
- **Tresor startet bei null:** die Quelle führt kein cash_actual/opening_balance —
  die Tresor-Kette ist aus tagesabrechnung nicht rekonstruierbar und beginnt
  erst mit dem COCO-Echtbetrieb. Historie bleibt in tagesabrechnung nachschlagbar.
- `time_entries` mit source='pool' sind vollständig abgeleitete Daten: bei einem
  Kassen-Reset immer mitlöschen; echte Stempel (clock/manual/import) nie anfassen.

## 38. Kasse: Ein-Session-Garantie + Kellner-Session-Status (02.07.2026, abends)

Direkt-Commits (Frank + Lovable, ohne Claude): Fortsetzung von §30/§31.

- **Partieller Unique-Index `sessions_one_open_per_location`** (Migration
  `20260702213152`): pro `(organization_id, location_id, business_date)` höchstens
  EINE Session mit `status='open'`. Geschlossene/gesperrte Alt-Sessions unberührt.
- **Kellner-Session-Lookup gefixt** (`cash.functions.ts`) und **Kellner-UI zeigt
  Session-Status** (`zeit/abrechnung.tsx`): Kellner sehen vor der Abgabe, ob für
  ihren Standort eine offene Session existiert.
- Abgenommen im E1-Review-Lauf vom 03.07. (tsc/eslint/vitest grün über den
  Gesamtbereich).

## 39. M5 Welle E1 — Einheitenmodell Bestellung/Inventur (03.07.2026)

Artikel haben jetzt getrennte **Bestelleinheit** (Kiste/Sack/kg …) und
**Inventureinheit** (Flasche/kg/Liter …) mit Umrechnungsfaktor. Kernfall:
Coca-Cola 18,90 €/Kiste, 1 Kiste = 24 Flaschen → Inventurwert rechnet mit
78,75 Cent/Flasche (vorher fälschlich mit dem Kistenpreis).

### Designentscheidungen

- **Kein gespeicherter Normalpreis auf `articles`** — abgeleiteter Wert
  (`price_cents / order_to_inventory_factor`), berechnet ausschließlich im reinen
  Modul `src/lib/bestellung/unit-conversion.ts` (getestet, inkl.
  Coca-Cola-Abnahmefall 93 Fl. → 7324 Cent). Persistiert wird der Normalpreis nur
  in **Snapshots** (`order_items`, `inventory_items`) als `numeric(14,4)` **Cents**.
- **Neue `articles`-Felder:** `order_unit`, `inventory_unit`,
  `order_to_inventory_factor`, `quantity_step`, `allow_decimal_order_quantity`,
  `min_order_quantity`, `target_stock_total`, `target_stock_bar` (Zielbestände =
  reine Datenfelder, keine Automatik). `unit`/`packaging_unit` bleiben Legacy.
- **Snapshots:** `order_items` +3 Felder (Inventureinheit, Faktor, Normalpreis;
  `unit` trägt jetzt die Bestelleinheit — RPC `create_order_from_cart` befüllt
  alles, Freitext-Positionen → NULL). `inventory_items` +5 Felder; abgeschlossene
  Inventuren rendern aus Snapshots, nicht aus aktuellen Artikeldaten.
- **FK-Härtung:** `inventory_items.article_id` von CASCADE auf **RESTRICT** —
  Artikel-Löschung kann keine Inventurhistorie mehr wegwischen (Fehlermeldung
  verweist auf Deaktivieren). Integritätsloch im Review gefunden.
- **Read-only auf DB-Ebene:** RLS-Policy `inv_items_write_mgr` verlangt
  `status='in_progress'` + Zeilen-Trigger `tg_inventory_items_assert_open`
  (bindet auch service_role). Trigger blockt NUR `status='completed'` —
  `v_status IS NULL` (Session per CASCADE bereits gelöscht) muss durchgehen,
  sonst bricht `deleteInventorySession` (im ersten Wurf so passiert, korrigiert).
- **UI:** Lagerbereiche heißen jetzt **Bar** / **Trockenlager** (nur Labels;
  Spalten `storage_1`/`storage_2` unverändert). Inventurzeile:
  Artikel | Inventureinheit | Bar | Trockenlager | Gesamt | Gesamtwert.
  Katalog: „18,90 € / Kiste · 1 Kiste = 24 Flaschen · 0,7875 € / Flasche".
  EasyOrder: Mengen-Buttons respektieren `min_order_quantity`/`quantity_step`.
- **Bewusst NICHT gebaut:** Wareneingang, Lagerbewegungen, Bestandswirkung von
  Bestellungen (Bestellungen bleiben reine Dokumente; Inventur = einzige gezählte
  Bestandsquelle), Bestellvorschläge, Umlagerungs-Automatik, neue Order-Status.
- **Vertagt → Welle E2:** echte Dezimal-Bestellmengen (`quantity integer → numeric`
  in `cart_items`/`cart_draft_items`/`order_items` + RPC + Zod + EasyOrder +
  E-Mail-Rendering). In E1 validiert `validateOrderQuantity` serverseitig
  min/Raster, Mengen bleiben ganzzahlig.

### Live-Status

Migration `20260702233456` (+ Trigger-Korrektur) am 03.07. auf der COCO-DB
ausgeführt; Verifikations-CSV: 8 articles-Spalten / 3 + 5 Snapshots / FK=RESTRICT /
Trigger 1 / RPC-4arg 1 / 0 Altzeilen ohne Snapshot-Backfill.

### Lektion

Vorab-SQL-Skizzen aus Prompts sind NICHT die ausführbare Migration (Skizzen-§6 war
Kommentar → RPC fehlte nach dem Skizzen-Lauf in der DB; Trigger-CREATE ohne
DROP IF EXISTS brach den zweiten Lauf ab). Für die Live-DB immer die committete
Migrationsdatei bzw. das von Claude gelieferte idempotente Ausführungs-SQL nehmen.

## 40. M4 Stufe 3a — edlohn-Abgleich Härtung (03.07.2026)

Maschineller Vergleich von 166 edlohn-Entgeltabrechnungen (Feb–Mai 2026) gegen
`berechneLohn` (edlohn-eigene Entgeltzeilen als Input, Cent-Diff auf
LSt/Soli/KiSt/KV/RV/AV/PV/Netto/Auszahlung). Ergebnis: 95 cent-exakt, Rest in
sechs klar identifizierten Klassen — fünf davon jetzt gefixt, eine sauber
dokumentiert offen. Jede Änderung ist durch einen echten edlohn-Fall belegt
(Golden Master `edlohn-faelle.json`, Fälle 4–8).

### Fixes

1. **bAV-Beiträge im Auszahlungs-Abzug** (`lohn-core.ts`, Schritt F): `bav_frei`
   - `bav_sv` werden nach dem Netto ebenfalls abgezogen — edlohn bucht die
     Direktversicherung ins Gesamtbrutto (steuerfrei) und zieht sie später als
     „Beitrag / Direktvers − mtl" wieder ab. Vorher lief die Auszahlung real
     ~569 €/Monat zu hoch (belegt: Fall 4).
2. **Minijob-RV-Mindestbemessung 175 €/Monat** (`svBeitraegeMinijob`, §163 Abs. 8
   SGB VI): Gesamtbeitrag (18,6 %) auf `max(AE, 175 €)`, AG-Pauschale (15 %)
   weiterhin auf tatsächlichem AE — der AN trägt die Differenz. Guard: AE = 0
   → RV bleibt 0 (nicht auf 175 € hochziehen). Belegt: Fall 6 (AE 115,50 € →
   RV 1522 = edlohn).
3. **Minijob-Invariante**: `berechneLohn` wirft, wenn eine Minijob-Person eine
   `zeitlohn`- oder `einmalbezug`-Zeile bekommt — sonst liefen die Beträge
   still an der Minijob-SV vorbei. `buildUrlaubKrankZeilen` nimmt jetzt die
   Beschäftigungsart und bucht Urlaub/Krank bei Minijob als `aushilfe_paust`.
4. **Midijob PV-Kinderlosen-Zuschlag auf BE-Gesamt** (`sv-2026.ts`): der
   Grundanteil (1,8 % ± Kind-Abschläge) bleibt auf der reduzierten AN-Basis
   (BE_AN), der Kinderlosen-Zuschlag (0,6 PP) läuft aber auf der beitrags-
   pflichtigen Gesamt-Einnahme BE_G (Formel mit Faktor F 0,6603). EINE
   Rundung am Ende. Belegt: Fall 7 (AE 1.648,50 € → PV 3652 = edlohn).
5. **Werkstudenten mit Mindestvorsorgepauschale**: neues Personen-Flag
   `istWerkstudent` (DB-Spalte `staff_personal_details.ist_werkstudent`) →
   PAP mit `PKV=1`, `PKPV=0`. NICHT an `kvFrei` gekoppelt (freiwillig
   gesetzlich Versicherte sind ebenfalls kvFrei, bekommen aber die volle
   Vorsorgepauschale — belegt an echten Payslips). Belegt: Fall 5 (LSt 5791).
6. **Aktivrente — St-Brutto-Ausweis um Freibetrag mindern**: neues Ausgabe-
   Feld `stBruttoAusweisCent = max(0, stBruttoCent − lstFreibetragMonatCent)`
   für CSV-/Excel-Export und Lohnrechner-UI. `stBruttoCent` bleibt unverändert
   (RE4 für den PAP; LSt-Rechnung wirkt weiterhin über LZZFREIB). Belegt:
   Fall 8 (Ausweis 80.280 Cent bei 200.000 Cent Freibetrag).

### Offen (kein Blindfix)

- **KV-AN-Rundung**: in ~38 Abrechnungen weicht die KV genau ±1 Cent von
  edlohn ab; das edlohn-Rundungsverfahren ist nicht eindeutig rekonstruiert
  (Differenzmethode Gesamt − AG löst nur einen Teil der Fälle). Beim
  Lohnbüro / in der edlohn-Doku klären, bevor ein Fix eingebaut wird.
- **Sonstige Bezüge** (Tantieme, Urlaubsabgeltung) und **PKV-Vorsorge-
  pauschale** (PKPV-Beitrag als Personen-Stammdatum pflegen) bleiben
  unsupported. Für PKV-Fälle liefert der PAP heute die Mindestvorsorge-
  pauschale, solange `pkvBasisBeitragMonatCent = 0` — bei realen PKV-
  Mitarbeitern zuerst den Beitrag pflegen.

### Golden Master

`golden-master/edlohn-faelle.json` enthält jetzt 8 Fälle (1–3 unverändert,
4/5/6/8 vollassert, 7 als Teilassert pv/rv/av wegen offenem KV-Punkt). Der
Test-Loop nutzt `toMatchObject` — additive Ergebnis-Felder (z. B.
`stBruttoAusweisCent`) brechen die Altfälle damit nicht.

### Abnahme 03.07.2026

Erneuter Vollvergleich gegen alle 166 edlohn-Abrechnungen nach den Fixes:
118 cent-exakt (vorher 95). Verbleibend ausschließlich: KV-AN-Rundung ±1 Cent
(40, offener Befund — Rundungsverfahren beim Lohnbüro erfragen), PKV-Fälle (4,
`pkv_basis_beitrag_monat_cent` pflegen), 1× KiSt ±1 Cent (gleiche Rundungs-
familie), 3× sonstige Bezüge (dokumentiert nicht unterstützt). Offene
Stammdaten-Aktionen: `ist_werkstudent = true` für den betroffenen
Werkstudenten setzen; PKV-Basisbeitrag für den PKV-Mitarbeiter pflegen.

## 41. Modul M-BWA — Steuerberater-BWA in COCO: F1 Fundament + F2a Dashboard (03.07.2026)

Monatliche Steuerberater-BWA (ETL ADHOGA / eurodata, je Gesellschaft) wird in
COCO gespeichert, quersummen-geprüft und als interaktives Dashboard
ausgewertet. F1 abgenommen bei HEAD `1a9f0f4`, F2a bei HEAD `274e2b8`
(tsc/eslint/prettier/vitest 1018 grün).

### Designentscheidungen (F1 — Fundament)

- **entity-Ebene über den Kostenstellen:** BWA hängt an der Gesellschaft
  (`entity` text, z. B. 'YUM Gastronomie GmbH' mit Kostenstellen YUM +
  Spicery), NICHT an `locations`. TSB = eigene Gesellschaft mit eigener BWA,
  kommt als zweite entity dazu (genauer Name + Kostenstellen bei der ersten
  TSB-BWA klären).
- **Tabelle `bwa_monthly`** (Migration `20260703073048`): BIGINT cents,
  Unique-Key `(organization_id, entity, cost_center, month)`, `month` =
  Monatserster (Check-Constraint), `sachkosten_detail` jsonb, `source
manual|pdf|import`. Abgeleitete Werte (Gesamtleistung, Rohertrag I/II,
  Ergebnis op.) werden NICHT gespeichert — Berechnung nur in
  `src/lib/bwa/bwa-core.ts` (E1-Normalpreis-Regel).
- **RLS:** SELECT admin-only, KEINE Client-Schreib-Policies — Schreiben nur
  über Server-Fns (service_role). payroll-Lesezugriff bewusst NICHT gewährt.
- **Quersummen-Gate serverseitig:** `validateBwaMonth`
  (`BWA_TOLERANCE_CENTS = 300`, BWA-Blätter sind auf ganze Euro gerundet)
  prüft Betriebsergebnis gegen die GuV-Kaskade und Umsatz gegen die
  Erlös-Summanden; `upsertBwaMonth` lehnt bei Verletzung ab — Tippfehler
  kommen nicht in die DB. Dialog zeigt dieselbe Validierung live.
- **Server-Fns** (`bwa.functions.ts`): `listBwaMonths` / `upsertBwaMonth` /
  `deleteBwaMonth`, alle `loadAdminCaller(["admin"])`, org-Scope aus dem
  Caller, `source` bleibt bei Updates erhalten, Audit `bwa.upsert` /
  `bwa.delete` (Voll-Snapshot in `meta.snapshot`).

### Historie-Import (verifiziert)

48 Zeilen (YUM + Spicery × 24 Monate, Mai 2023 – April 2025) aus den
BWA-PDFs 04/2024 + 04/2025 („Entwicklungsübersicht der letzten 12 Monate"),
vorab gegen alle BWA-Quersummen validiert (0 Abweichungen), per idempotentem
Daten-SQL (`ON CONFLICT DO NOTHING`) eingespielt. Rest-Check-CSV Ist=Soll:
Spicery 24 Monate / 3.425.983 € Umsatz / +418.056 € Betrieb; YUM 24 /
3.007.327 € / −213.145 €. Enthält Speisen-Haus/Außer-Haus-Split;
`sachkosten_detail`: 7 große Positionen exakt, Kleinposten als Restzeile
„Übrige" (Monatssumme exakt); `source='import'`.

### F2a — Dashboard (`/admin/bwa`, Tab „Dashboard")

Recherche-basiert (moderne Finanz-Dashboards + Gastro-Benchmarks):
KPI-Karten mit doppeltem Delta (Vormonat UND Vorjahresmonat), Prime Cost
(WES + Personal, Warnschwelle 65 %; Personalquote-Warnung > 40 %),
GuV-Wasserfall MIT exakter Wertetabelle daneben (Wasserfälle werden nur
ungefähr gelesen), Zeitreihe mit Benchmark-Bändern (WES 28–32 %, Personal
30–35 %), Break-even-Karte. Bewusst KEINE Tacho-/Ampel-Diagramme.

- **Reines Modul `bwa-analytics.ts`** (getestet, UI rechnet nichts selbst):
  `aggregateGroup` (virtuelle Kostenstelle „Gruppe" = Summe je entity+Monat),
  `deriveKpis` (nutzt `deriveBwa`, keine Formel-Duplizierung), `deltas`,
  `buildWaterfall` (Recharts-Stacked-Bar-Sockel-Technik, Invariante
  getestet), `computeBreakEven`.
- **Break-even rollierend** über die letzten bis zu 12 verfügbaren Monate:
  variabel = Wareneinsatz, fix = Personal + Sach + Anlage + AfA − sonst.
  Erträge (konservativ); `OPEN_DAYS_PER_MONTH = 30` (Annahme; echte
  Öffnungstage bräuchten ein Kostenstelle→location-Mapping — bewusst
  vertagt). **Brutto-BE aus dem ECHTEN USt-Mix** (19 % auf
  Getränke/Sonstige/Speisen-Haus, 7 % auf Außer-Haus) statt Schätzung —
  möglich durch den importierten Speisen-Split.
- Tabs nach dem M-Statistik-Muster (§19); F1-Erfassung unverändert im
  Tab „Erfassung".

### Offen / Auflagen

- ~~E2E durch Frank~~ **bestanden (03.07.2026):** Kern-Beweis über den
  PDF-Import — echte BWA 04/2025 hochgeladen, der Duplikat-Vergleich im
  Review zeigte für YUM + Spicery IDENTISCHE Werte zu den per SQL
  importierten Monaten (Parser gegen den verifizierten Import bewiesen);
  Übernahme durchgeführt, Quelle der Zeilen wechselte auf `pdf`.
- ~~Auflage für F2b~~ **erledigt (F2b):** `computeBreakEven` sortiert intern
  defensiv absteigend (Kopie + `localeCompare` desc); Test verankert, dass
  asc/gemischt dasselbe Ergebnis liefern wie desc.
- ~~Welle F2b~~ **umgesetzt (03.07.2026, abgenommen bei HEAD `5a55875`,
  vitest 1062 grün):** Neue reine Funktionen `sumSachkostenDetail`
  (label-weise Summe über Roh-Zeilen; `missingMonths` +
  `coveredSachkostenCents` für den ehrlichen Abdeckungs-Hinweis — manuell
  erfasste Monate haben kein Detail, das kommt erst mit F3) und
  `compareCostCenters` (nur echte Kostenstellen, KEINE „Gruppe";
  best/worst je Quote, bei `betriebsQuote` gilt höher = besser). UI:
  Drilldown-Karte im Dashboard-Tab (Balkenliste absteigend, negative rot,
  Abdeckungs-Hinweis); dritter Tab „Vergleich" mit Kennzahl-Tabelle
  (beste Quote grün / schlechteste rot je Zeile) und Small Multiples je
  Kostenstelle mit **gemeinsamen Y-Domains über alle Spalten** (sonst ist
  der optische Vergleich wertlos). Kein Schema-/Server-Fn-Eingriff —
  `sachkostenDetail` war im `BwaRow`-Typ bereits gemappt. Der Gruppe-
  Drilldown läuft bewusst über die Roh-Zeilen (`aggregateGroup` ignoriert
  das jsonb weiterhin).
- ~~Welle F3~~ **umgesetzt (03.07.2026, abgenommen bei HEAD `cc50cb3`,
  vitest 1079 grün):** PDF wird NUR client-seitig geparst (pdfjs-dist nach
  dem split-combined-Muster, **legacy-Build** für Safari-Kompat — der
  Haupt-Build v6 nutzt `for await` auf `ReadableStream`, was WebKit nicht
  kennt; kein Storage, keine Migration). Reines Modul
  `bwa-pdf-parser.ts`: Mapping strikt über Zeilennummer PLUS
  Label-Substring — passt das Label nicht, wird das Feld als
  `missingFields` markiert statt still die nächstbeste Zahl zu nehmen
  (Negativ-Fixture getestet); kanonischer Testfall = echter YUM April 2025,
  besteht `validateBwaMonth`. Sachkosten-Detail (Hauptzeilen 30–46, ohne
  „davon") wird mitgeparst und speist den F2b-Drilldown. Review-Screen mit
  editierbaren Werten, Live-Quersummen (bwa-core), Duplikat-Vergleich
  alt/neu; Übernahme NUR per Klick, `source: "pdf"`.
  Verhaltens-Delta `upsertBwaMonth` (ehrlich benannt): `source` wird beim
  Speichern gesetzt statt erhalten (`import` bleibt SQL-exklusiv, vom
  Client nicht wählbar); `sachkostenDetail` wird nur geschrieben, wenn
  explizit übergeben — der Erfassungs-Dialog plättet vorhandenes
  PDF-Detail NICHT.
  F3-Parser-Fix (03.07.): eurodata-BWAKORE schreibt die Kostenstelle OHNE
  Label als eigene Zeile zwischen Entity und Monat (Kopf: BeraterNr /
  Report-Typ / Entity / KSt / Monat); `findCostCenter` positionsbasiert
  erweitert (Label-Variante als Fallback erhalten). Seiten-Gate hart auf
  `isBwaPage` — Übertrag-Seiten von Vorjahresvergleich/Jahresübersicht
  flossen sonst ein (Jahresübersicht hätte Januar-Werte geliefert).
  Verifiziert gegen das echte PDF BWAKORE-01290-205-0426 (17 Seiten,
  2 KSt: YUM + Spicery, 0 Warnungen). Lektion (Familie „Vorab-Skizze ≠
  Realität", vgl. §39): Parser-Fixtures NIE synthetisch erfinden — Golden
  Master kommt aus dem echten Dokument, Beträge im Repo-Fixture
  verfremdet (§6: keine Geschäftsdaten im Repo).
  F3-Fix Teil 2 (03.07.): (1) Zeilen-Assemblierung von exaktem Math.round
  auf Toleranz-Clustering (±2,5 pt) umgestellt — eurodata setzt
  Zeilennummern mit Baseline-Versatz, exaktes Runden zerriss „47" von
  „Summe Sachkosten …" (pures Modul `src/lib/bwa/pdf-lines.ts`, getestet).
  (2) Gesehene Zeile mit leerer Monatsspalte ⇒ 0 mit transparenter
  Warnung (eurodata druckt dann nur kumulierte Werte; die 4-Token-Regel
  in `extractDataRow` bleibt — kumulierte Werte nie als Monatswert raten).
  (3) `normLabel` kollabiert Bindestrich-Spaces, Label-Vergleich
  symmetrisch. Verifiziert am echten PDF: 12/12 Felder je KSt, Quersumme
  und Sachkosten-Detail innerhalb der 3-€-Toleranz (Rundung ganzer Euro
  je Zeile).
  F3-E2E bestanden (03.07.): BWAKORE-01290-205-0426.pdf → beide KSt (YUM,
  Spicery) April 2026 ohne fehlende Felder übernommen; Quersumme grün
  (1-€-eurodata-Rundung innerhalb 3-€-Toleranz), Sachkosten-Detail
  mitgespeichert. Hinweis-UX: „Überschreibt vorhandene Werte"-Banner erscheint
  auch bei identischen Werten (rot, obwohl No-Op) — Kosmetik-Merkposten,
  ebenso Button-Plural „Block/-öcke".

  Lücken-Import Mai 2025 – März 2026 (03.07.): Der Historie-Import (s. o.)
  reichte nur bis April 2025; mit dem ersten PDF-Upload (April 2026) zeigte
  das Dashboard (12-neueste-Monate-Fenster) fast nur Leere — Historie war
  NICHT gelöscht, nur außerhalb des Fensters. 22 Zeilen (11 Monate × 2 KSt)
  aus der Entwicklungsübersicht (S. 7 + 13) desselben PDFs importiert:
  X-Koordinaten-spaltengenau extrahiert (wichtig: „Speisen außer Haus"
  existiert erst ab Jan 2026 — sparse Spalten!), Goldkontrolle April-Spalte ==
  gespeicherte PDF-Blöcke exakt, alle Monatsspalten quersummen-konsistent,
  ON CONFLICT DO NOTHING, source='import', Sachkosten-Detail „Übrige".
  Verifiziert per CSV: beide KSt 36 Monate lückenlos (2023-05 – 2026-04),
  35× import + 1× pdf. Zukunfts-Merkposten (optional): Parser könnte
  Entwicklungsübersicht-Seiten automatisch mitlesen und Lücken selbst heilen.
  **M-BWA damit funktional komplett.** Monatlicher Ablauf: BWA-PDF vom
  Steuerberater in den Import-Tab laden → Review prüfen → übernehmen.
  TSB folgt als zweite entity, sobald die erste TSB-BWA vorliegt (Name +
  Kostenstellen klären — siehe Designentscheidungen oben).

- Später optional: `bwa_plan` (Soll/Ist-Vergleich, Budget-Wasserfall);
  BWA-Umsatz vs. COCO-Kassenumsatz-Abgleich (M-Statistik hat die Zahlen).

## 42. Lohn-RLS-Härtung: SELECT manager+ auf lohn_absence_days / lohn_recurring_zeilen (03.07.2026)

Finding: Beide Tabellen hatten SELECT „own-org für alle authenticated" —
jeder MA mit Login konnte per PostgREST die wiederkehrenden Lohnarten
(`betrag_cent`, Bezeichnung: Direktversicherung, Dienstrad …) und
Urlaub/Krank-Tage ALLER Kollegen lesen. Fix: SELECT auf
`has_min_permission('manager')` gehärtet — zuerst als Direkt-SQL auf der
Live-DB (Emergency-Pfad), per pg_policies-CSV verifiziert, anschließend mit
Migration `20260703083757_3f3abd12-6bd9-49b0-a15c-493d5e2bdc34.sql`
idempotent im Repo nachgezogen (Repo = DB wieder synchron). Write-Policies
waren bereits manager+. `staff_personal_details`/`staff_compensation` waren
nicht betroffen (Permission-Muster `payroll.*.view` aus committeten
Migrationen).

**Lektion:** Ein Emergency-Fix per Direkt-SQL auf der Live-DB ist ohne
sofortige Nachzieh-Migration ein stiller Drift — der nächste DB-Neuaufbau
aus den Migrationen stellt das Sicherheitsloch wieder her. Regel: Direkt-SQL
an Policies/Schema IMMER noch am selben Tag als idempotente Migration
committen; die pg_policies-Verify-Query gehört zum Abschluss beider Schritte.

## 43. Welle SP — Self-Service Stammdaten & Dokumente (03.07.2026)

Mitarbeiter pflegen Stammdaten im Portal. Zweistufiges Modell: Kontaktdaten
(Adresse/Telefon/E-Mail) direkt editierbar mit Audit; alles Lohnrelevante
(Name, Bank/IBAN, SV-Nr, Steuer-ID, Steuerklasse, Kirche/Konfession, Kinder,
Krankenkasse, Geburtsdaten, Nationalität, Anrede) nur per Änderungsantrag mit
Admin-Freigabe (`staff_data_change_requests`, EIN offener Antrag pro
Mitarbeiter via partiellem Unique-Index). Freigabe re-validiert die Payload
und schreibt nur `staff_personal_details`-Felder; Namensfelder werden NIE
automatisch auf `staff` angewendet (display_name-Mappings!) — Anzeige
„manuell übernehmen" im Admin-Review.

Dokumente (Pass, Visum, Arbeitserlaubnis, Gesundheitszeugnis) nach
Payslip-Muster: privater Bucket `staff-documents` — DENY-ALL für Clients
(Zugriff nur über Server-Functions mit Signed URLs; die zwischenzeitlichen
READ-Policies aus Migration `20260703112045` wurden nach Security-Review per
Rückbau-Migration entfernt, Entscheidung Frank 03.07.: ungenutzt +
Manager-Read war Rechteausweitung über den admin-only Server-Layer) —,
Pfad-Guard mit Traversal-Tests, base64-Upload über Server-Fn (Mime-Whitelist
JPG/PNG/PDF, 10 MB, Größe aus dekodierten Bytes), Signed URLs 60 s,
`valid_until` für die Ablauf-Ampel (SP3), Sichtvermerk `verified_by/at`.

Datenschutz: Konfession als optionales Freitextfeld (Art.-9-Datum, nur
Mitarbeiter selbst + Admin/Payroll). Audit-Verhalten zweistufig: bei
Antrag-ERSTELLUNG enthält das Audit-Meta nur Feldnamen, nie Werte (sensible
Daten). Bei der FREIGABE schreibt `profile-admin` bewusst den before/after-
Diff der angewendeten Felder ins Audit-Meta — gewollte Nachvollziehbarkeit
für den Fraud-kritischen Fall IBAN-Änderung (Konto-Umleitung); das
Audit-Log ist nur für Admins sichtbar. Feldkataloge
(`SELF_VIEW`/`DIRECT_EDIT`/`REQUEST`) sind reine, getestete Module in
`src/lib/profile/profile-fields.ts`.

SP1 (Schema + Server-Layer) abgenommen 03.07., Migration `20260703084105` +
Bucket live (Verifikation 1/2/0/1/1/2). Lektion: Bucket-Insert fehlte in der
committeten Migration — Storage-Objekte gehören mit in die Vorab-SQL-Prüfung.
Nachzieh-Versuch als Migration wurde vom Tool-Guard blockiert
(`bucket_sql_blocked`); der Bucket bleibt via Storage-Tool angelegt, die
Migrations-Datei entfällt daher bewusst. SP2 = Mitarbeiter-UI `/profil`
(Kontaktdaten direkt, Änderungsantrag mit Vorvalidierung via
`profile-fields.ts`, Antragsliste, Dokumenten-Upload/Ansicht). Offen: SP3
Admin-Review (Anträge freigeben, Dokumenten-Übersicht mit Ablauf-Ampel,
„manuell übernehmen"-Hinweis für Namensfelder).

**§3-Merkposten Konfession:** Die Spalte `konfession` ist bewusst NICHT an
den Lohnrechner angebunden (KiSt läuft weiter über `church_tax_liable`).
Falls sie je die Kirchensteuer speisen soll: Select-Liste in
`computeLohnForStaff` UND `person-mapping` zwingend mitziehen
(Phantom-Deploy-Falle, §3 / Aktivrente-Lektion).

**SP3 abgenommen (03.07.2026):** SP2 (Mitarbeiter-UI `/profil`) und SP3
(Admin-Review `/admin/personal-antraege`: Antrags-Freigabe mit Ist/Neu-
Vergleich und „manuell übernehmen"-Hinweis für Namensfelder; Dokumenten-
Übersicht mit Ablauf-Ampel rot/gelb 60 Tage/grün, Sichtvermerk, Fehlend-
Liste Gesundheitszeugnis) abgenommen. Welle SP damit komplett.
Bucket-Verankerung im Repo: NICHT als Migration (Guard-Block, siehe §3),
sondern in docs/seed-storage.sql (beide Buckets, idempotent).

## 44. Z1 „Meine Stunden" — Ist-Zeiten-Self-Service (03.07.2026)

Mitarbeiter sehen unter /zeit/stunden ihre gearbeiteten Schichten der
Abrechnungsperiode (26.–25., Navigation in frühere Perioden): pro Tag
Start/Ende/Pause/Netto, Periodensumme. Reines Lese-Feature: neue Server-Fn
`getMyPeriodEntries` (staff_id aus Caller, Perioden aus `periods`-Tabelle),
Summen im getesteten puren Modul `src/lib/time/my-period-hours.ts`
(Netto = grossMinutesBetween − break_minutes, identisch zur
Admin-Zeitübersicht; offene Einträge zählen nicht in Summen). Keine
Migration, keine Schreibpfade. Ergänzt „Meine Schichten" (Plan) um die
Ist-Sicht.

## 45. SM1 Sofortmeldung-Cockpit (§28a SGB IV) (03.07.2026)

Melde-Cockpit, KEINE elektronische Meldung (nur ITSG-zertifizierte Software
darf melden — die Meldung selbst läuft in sv.net/Lohnbüro). COCO prüft
Vollständigkeit (SV-Nr ODER Geburtsort+Nationalität als Alternative), zeigt
den sv.net-Datenblock kopierfertig und dokumentiert die erfolgte Meldung
(reported_at/by, Audit). Status wird BERECHNET (nicht_erforderlich /
unvollstaendig / bereit / gemeldet) aus required + missingFields + reported_at
— pures Modul src/lib/sofortmeldung/sofortmeldung-rules.ts, getestet.
Tabelle `sofortmeldung` (DENY-ALL, staff_id UNIQUE), Betriebsnummer in
organization_settings. Fachliche Vorlage tagesabrechnung; bewusst NICHT
übernommen: eigene Log-Tabelle (zentrales audit_log), gespeicherter Status,
USING(true)-Policies. Banner im Stammblatt + Badge-Spalte in der
Mitarbeiterliste. Onboarding-Reihenfolge: Mitarbeiter füllt /profil aus →
Antrag freigeben → Sofortmeldung „bereit" → sv.net → „gemeldet" markieren.

## 46. V1 Dokumentengenerierung — Server-Layer (03.07.2026)

M4-Restposten aus thaitime portiert, bewusst vereinfacht: EIN Template-Modell
(Volltext mit {{platzhaltern}}, mehrere benannte Templates je Typ) statt des
thaitime-Textbaustein-Systems; keine Signaturen, kein Mailversand, keine
Server-PDF-Erzeugung (Druck client-seitig in V2, Cloudflare-kompatibel).
Tabellen document_templates + generated_documents (beide DENY-ALL; der
gespeicherte TEXT ist das Dokument der Wahrheit, template_id ON DELETE SET
NULL, Templates werden deaktiviert statt gelöscht). Platzhalter-Engine als
pures, getestetes Modul src/lib/dokumente/document-placeholders.ts (fehlende
Daten ⇒ unresolved-Liste statt leerer Strings; heute injizierbar).
Arbeitgeber-Stammdaten (Name/Adresse/Vertreter) in organization_settings.
staff_documents.doc_type um 'contract' erweitert (unterschriebener Scan wird
als normales Mitarbeiter-Dokument hochgeladen).
(Restfehler: die V1-Migration erweiterte nur den DB-Check; der
TS-Path-Guard `DOC_TYPES` kannte 'contract' nicht — Phantom-Zustand, in
V2/§48 geschlossen. Lektion: DB-Check-Erweiterungen immer zusammen mit
der Client-Whitelist ausliefern.)
Audit ohne Dokumentinhalte
(SV-Nr/IBAN gehören nicht ins Log-Meta). Offen: V2 UI (Template-Editor,
Generierungs-Assistent im Stammblatt-Tab „Dokumente", Druckansicht,
Scan-Upload-Verknüpfung).

## 47. Fallstudie: POS-Differenz-Warnung 27,90 € (YUM, 02.07.2026) — Diagnose, Fix, Lektionen

COCO zeigte am 02.07. für YUM eine POS-Differenz von +27,90 €
(`settlement-warnings.ts`: `pos_diff = POS-Brutto − Σ Kellner −
(Vectron-Takeaway + Souse)`); die tagesabrechnung war für denselben Tag
glatt. Diagnose-Verlauf und Ergebnis:

- **Ursache (per Legacy-DB bewiesen):** In COCO waren die Tagesbeträge von
  Wolt und Vectron-Takeaway über Kreuz erfasst (Wolt 477,60 / TA 449,70
  statt Wolt 449,70 / TA 477,60). Die Legacy-DB (`sessions.takeaway_total`
  = 477,60, `wolt_revenue` = 449,70, `adjusted_pos_diff` = 0,00) war die
  Referenz. Einmaliger Eingabefehler — die Kanal-Maske rendert dynamisch
  aus `revenue_channels`, kein System-Bug.
- **Fix:** Daten-SQL auf der COCO-DB (Absolutwerte statt Tausch-CASE —
  dadurch idempotent), Rest-Check im selben Lauf: `pos_diff = 0` ✓.
- **Formel-Verifikation über die Historie:** Bevor irgendetwas geändert
  wurde, wurde die Warnformel über alle 271 importierten Sessions mit
  Settlements getestet: aktuelle Formel (TA + Souse) trifft bei YUM an
  132/135 Tagen exakt 0 (mittl. Abw. 16 €); die Gegen-Hypothese
  (Wolt + Souse) wäre an >80 % der Tage falsch gewesen. Die Formel ist
  korrekt und bleibt unverändert; Wolt (Drittplattform) ist nicht im
  Vectron-Total enthalten.
- **Legacy-Flag geklärt:** `restaurants.ordersmart_in_takeaway` steht in
  der Legacy-DB für BEIDE Restaurants auf `false` (per CSV verifiziert).
  COCOs feste Formel (Souse wird immer abgezogen) ist damit für beide
  Standorte korrekt — das Flag wird bewusst NICHT nachgebaut. Sollte sich
  das Legacy-Setting je ändern, muss COCO eine Kanal-Konfiguration
  nachziehen.
- **Beobachtung Spicery:** In der importierten Historie geht die
  POS-Zerlegung bei Spicery nur an 76/136 Tagen exakt auf (mittl. Abw.
  ~59 €) — echte historische Tages-Fehlbeträge (Abrechnungsdisziplin),
  kein Systemfehler. Die Warnung macht genau das sichtbar.

**Lektionen (verbindlich):**

1. **Keine Formel- oder Datenkorrektur aus n=1.** Bei Soll/Ist-Abweichungen
   zuerst die Rechenregel über die gesamte importierte Historie
   verifizieren (Aggregat-Query: an wie vielen Tagen trifft welche
   Variante exakt 0?). Im Fall hier hat genau diese Query zwei falsche
   Fixes verhindert — erst einen Daten-Tausch auf Basis einer widerlegten
   Ablesung, dann einen Formel-Umbau auf Basis eines einzelnen Tages.
2. **Feld-Abgleiche nur gegen DB-Werte, nie gegen abgelesene UI-Werte.**
   Die mündliche Ablesung „Wolt 477,60 / Takeaway 449,70 im Altsystem"
   war vertauscht; erst der SQL-Export aus der Legacy-DB war belastbar.
3. **Bei System-Vergleichen die Ziel-DB doppelt prüfen:** Legacy-Queries
   gehören ins tagesabrechnung-Supabase-Projekt (`sessions.session_date`,
   `restaurants`, `waiter_shifts`, Euro-Dezimalwerte), COCO-Queries ins
   COCO-Projekt (`sessions.business_date`, `locations`, BIGINT cents).
   Ein `42P01 relation does not exist` ist das typische Symptom der
   falschen DB.

**E2E-Bestätigungen (03./04.07.):** Der GL-Terminal-Filter im
KONTROLLE-Block ist live verifiziert — Kasse Spicery zeigt −210,34 € /
490,02 €, cent-identisch zur Legacy-Tagesabrechnung; die §33-Regel gilt
damit nachweislich auf allen drei Rechenpfaden (Server-Aggregation, PDF,
Live-KONTROLLE). Anschließend wurde der KONTROLLE-Block optisch an das
Legacy-Summary-Layout angeglichen (Reihenfolge Fehlbetrag Vortag →
Ausgaben → Tages-Bargeld → NEU „Differenz zum Wechselgeldbestand"
[= Wechselgeld-Ist − Soll, reine Anzeige-Subtraktion] →
Wechselgeldbestand; Golden-Master-Formeln unangetastet). Nebenbefund
GIG: „fehlt in Kellnerabrechnung/Zeiterfassung" war kein Bug — die
Mitarbeiterin hatte sich schlicht noch nie angemeldet (kein
Shadow-User, keine Einträge).

## 48. V2 Dokumentengenerierung — UI + Konflikt-Auflösung (03.07.2026)

Abgenommen bei HEAD `d29dab0` (tsc/eslint/prettier/vitest 1131 grün, keine
Migration). UI-Welle über dem V1-Server-Layer (§46):

- **Einstellungen:** Sektion „Arbeitgeber-Stammdaten" (Name/Adresse/
  Vertreter → `organization_settings`), org-settings-Fn nach dem
  Betriebsnummer-Muster erweitert.
- **`/admin/dokumente` (Template-Verwaltung):** Liste je doc_type,
  Editor mit Platzhalter-Referenz aus `PLACEHOLDER_CATALOG`
  (Klick-Einfügen) und Live-Analyse — Platzhalter außerhalb des Katalogs
  werden rot als „unbekannt — wird nie befüllt" markiert. Deaktivieren
  statt Löschen (V1-Design, kein Delete).
- **Stammblatt-Bereich „Dokumente"** (`DokumenteTab`, section-Muster):
  Generierungs-Assistent mit Vorschau; **unresolved-Gate** — Speichern
  ist bei fehlenden Platzhaltern blockiert, bis die Checkbox „Trotz
  fehlender Angaben speichern" gesetzt ist. Dokumentenliste + Ansicht;
  **Druckansicht client-seitig** über isolierten A4-Print-Stylesheet
  (Serifen, `pre-wrap`, nur Dokumentinhalt — kein Server-PDF,
  Cloudflare-konform).
- **Konflikt-Auflösung (Lovable-Stopp, Option B):** Der V2-Prompt nahm
  fälschlich einen bestehenden Admin-Upload-Flow an. Statt Verschieben:
  (B1) `DOC_TYPES` additiv um `'contract'` erweitert + Guard-Tests in
  beide Richtungen — schließt den §46-Phantom-Restfehler; (B2) neue
  Server-Fn `adminUploadStaffDocument` exakt nach dem
  `uploadMyDocument`-Muster: admin-Gate, MIME/Größen-Checks,
  `sanitizeDocumentFileName` + `isStaffDocumentPathAllowed` vor jedem
  Storage-Zugriff, org-geprüfter Ziel-Staff (staffId vom Client, nie
  org-übergreifend), Waisen-Cleanup (Storage-remove bei Insert-Fehler),
  `uploaded_by` = Admin, KEIN automatisches `verified_by` (Sichtvermerk
  bleibt `verifyDocument`), Audit `staff_document.admin_upload` ohne
  Inhalte. Wiederverwendbare Komponente `AdminDocumentUpload`, in dieser
  Welle nur im Stammblatt eingebunden (Scan-Button, `doc_type:
'contract'` vorbelegt); Einbindung in personal-antraege bewusst
  vertagt.
- **Akzeptierte Mini-Abweichung:** je 1 Zeile in `personal-antraege.tsx`
  und `profil.tsx` (`contract: "Vertrag"` in den Label-Maps) — zwingende
  Folge von B1, keine Funktionsänderung.
- Offen: manueller E2E durch Frank (inkl. Owner-Read-Beleg: Admin-Upload
  erscheint im `/profil` des MA).

## 49. M-BWA Welle F4a — Jahresabschluss (Bilanzbericht): Parser + Server-Layer + Gate-Härtung (03.07.2026)

Ziel: ETL-ADHOGA-Bilanzberichte (PDF, je Gesellschaft) in COCO importieren
— Handelsbilanz, GuV und der Kontennachweis, der jede Position bis auf
das einzelne DATEV-Konto auflöst. Entity-Modell wie bei der Monats-BWA
(entity = 'YUM Gastronomie GmbH' etc.); Cent-Beträge, BIGINT.

**Reines Parser-Modul (`bilanz-pdf-parser.ts`):** Deterministische
Spaltenzuordnung über x-Schwellen (nicht über Token-Anzahl je Zeile),
strikter Betrags-Regex (verhindert Verwechslung von Hierarchie-Prefixen
oder 4-stelligen Kontonummern mit Beträgen), Anti-Halluzinations-Regel:
Positionen nur mit Prefix + nicht-leerem Label; Konten nur mit
Kontonummer + Label + GJ-Betrag im Geschäftsjahr-Band. Fehlt etwas →
Warnung, nie „nächstbeste Zahl".

**Konsistenz-Gates (shared Parser ↔ Server):** Damit derselbe
Wahrheitsstand geprüft wird, sind Gates 1–3 als exportierte reine
Funktionen implementiert; Parser (`computeChecks`) UND Server
(`validateReplacePayload`) rufen dieselben Funktionen.

- **Gate 1 GJ + VJ (`checkKontenSumForYear`):** Σ Konten je Blatt-Position
  = Positionsbetrag, für Geschäfts- und Vorjahr getrennt. VJ-Check wird
  übersprungen, wenn Position oder ein zugehöriges Konto keinen VJ-Wert
  trägt (mehrere PDF-Vintages ohne Vorjahresspalte).
- **Gate 2:** Σ Top-Level Aktiva = Σ Top-Level Passiva (unverändert).
- **Gate 3 staffelbewusst (`checkGuvStaffel`):** Anker-Labels
  „Ergebnis nach Steuern", „Jahresüberschuss/-fehlbetrag",
  „Gewinn-/Verlustvortrag", „Bilanzgewinn/-verlust". Bei erkannten
  Ankern werden Segmente einzeln geprüft: Σ operative = Ergebnis n. St.,
  Σ (Erg. n. St. … vor Jahresüberschuss) = Jahresüberschuss,
  Σ (Jahresüberschuss … vor Bilanzgewinn) = Bilanzgewinn. Kein Anker
  erkannt → Fallback auf die ursprüngliche „letzter Posten = Σ Rest"-Regel
  (Rückwärtskompatibilität mit älteren Fixtures). Teil-Anker → Warnung,
  keine Blockade.
- **Gate 4 rein parser-seitig (`findAnlageAnchors` +
  `checkAnlageAnchors`):** Aus den Anlage-Seiten (Handelsbilanz-Deckblatt
  bzw. GuV-Anlage) werden „Summe Aktiva", „Summe Passiva" und
  „Bilanzgewinn/-verlust" extrahiert und gegen die parsed Top-Level-
  Summen bzw. den GuV-Bilanzgewinn-Anker verglichen. Die Anlage-Anker
  gehen bewusst NICHT durchs Replace-Payload — sie bleiben in
  `checks[]` und werden nicht in `validateReplacePayload` gespiegelt;
  der Server prüft weiterhin Gates 1–3.

**Server-Fns (`bilanz.functions.ts`, Muster wie `bwa.functions.ts`):**
`listBilanzYears`, `getBilanzYear`, `replaceBilanzYear`,
`deleteBilanzYear` — alle admin-gated via `loadAdminCaller(["admin"])`,
org-Scope aus Caller-Kontext, Audit nur bei Erfolg. Schreiben
ausschließlich über die RPC `replace_bilanz_year` (delete +
bulk-insert in EINER Transaktion). `validateReplacePayload` liefert
zusätzlich `warnings[]` (Teil-Anker Gate 3), die den Server nicht
blockieren, aber der UI in F4b als Hinweis dienen können.

**Ehrlichkeits-Merkposten:**

- **Migrations-Nachzug F4a ✅ (03.07.2026):** Frank hat das SQL aus
  `docs/bilanz-schema-draft.sql` am 03.07. manuell auf der Live-DB
  ausgeführt; die zugehörige Migrationsdatei
  (`20260703…_bilanz_f4a_nachzug.sql`) ist im Repo idempotent
  (`IF NOT EXISTS` / `DROP POLICY IF EXISTS` / `CREATE OR REPLACE`) —
  läuft in CI-Fresh-Stacks, ist auf der Live-DB ein No-Op. Draft-Datei
  `docs/bilanz-schema-draft.sql` bleibt als Design-Referenz erhalten.
  Die lokale Bilanz-DB-Signatur in `bilanz.functions.ts` bleibt bis zur
  nächsten `supabase gen types`-Runde stehen.
- MCP-Server-Welle wurde in `083965a8` revertiert (rote CI);
  Wiederaufbau als eigene Welle geplant, kein Vorgriff (kein
  `.prettierignore`-Eintrag, kein `get-bilanz-year`-Tool in dieser Welle).

**Welle F4b — Jahresabschluss-UI (Frontend, 03.07.2026):**
Neue Route `/admin/bilanz` (admin-gated) mit drei Tabs:

- **Jahres-Ansicht:** KPI-Karten mit VJ-Delta (Bilanzsumme,
  Eigenkapitalquote, Liquide Mittel, Jahresüberschuss); Drill-Down
  Bilanz/GuV inkl. Kontennachweis; GuV-Wasserfall (recharts, gleiche
  Chart-Bibliothek wie F2a). KPI-Ableitung im reinen Modul
  `src/lib/bwa/bilanz-kpis.ts` (Label-Anker analog zum Parser,
  Anker fehlt → „—", nie Halluzination).
- **Mehrjahresvergleich:** Top-Level-Positionen über alle Jahre einer
  Gesellschaft; VJ-Konsistenz-Warnung, wenn die VJ-Spalte des
  N-Berichts vom GJ-Wert des N-1-Berichts abweicht (reine
  Anzeige-Warnung, keine Blockade).
- **Import:** PDF-Auswahl (client-seitig extrahiert via
  `extractTokenLines` — neue Funktion in `pdf-lines.ts`, F3-Extraktion
  unverändert) → Review-Screen (Kopf editierbar, Checks-Tabelle mit
  ok/fail, Warnungen, Zähler, Hinweis auf bereits vorhandenen Stand) →
  `replaceBilanzYear` (Server prüft Gates 1–3 erneut).

Verwaltung: Lösch-Button pro Jahr mit Bestätigungsdialog →
`deleteBilanzYear`. Verändert wurden **nicht** die Parser- oder
Server-Fn-Module aus F4a; die UI ruft ausschließlich exportierte
Funktionen.

**Erfolgs-Gate erreicht (03.07.2026):** `prettier --check .` sauber;
`vitest run` 1170 Tests grün (Bilanz-Parser 20 + Bilanz-Server 14 neu);
`tsgo --noEmit` fehlerfrei; `parseGermanAmountToCents` nicht dupliziert
(einmal in `bwa-pdf-parser.ts`, Bilanz-Parser importiert). RLS-Inventur
unverändert (Bilanz-Tabellen kommen mit der Migration).

**F4b-Fix — Parser-Geometrie (03.07.2026):** Erster echter Import ist an
drei Struktur-Eigenschaften des ETL-ADHOGA-Drucks gescheitert, die die
synthetische Fixture nicht abbildete. Nachgezogen:

- **Rechtsbündige Spalten (stabile rechte Kante!):** Die Beträge werden
  jetzt über `xEnd` gebandet (Konto-GJ im inneren Band, Positions- und
  Summenzeilen im äußeren `gjRight`, VJ auf `vjRight`). `TextItem` trägt
  jetzt die pdfjs-`width`, `LineToken` liefert `xEnd`. Vorher wurde die
  linke Kante (`x`) verglichen; das zerriss die meisten Beträge im echten
  Bericht, weil `x` mit der Zahlenlänge um bis zu 80 pt schwankt.
- **Umgebrochene Konto-Labels + separate Innere-/Äußere-Betragszeilen:**
  Ein Konto ohne Beträge bleibt „offen", Fortsetzungszeilen ohne Prefix
  werden ans Label angehängt; die erste innere Betragszeile schließt es.
  Danach kommt oft eine reine äußere Betragszeile, die die letzte
  offene Position (Stack, LIFO) mit ihrem Wert füllt. Positionen ohne
  jede gedruckte Summe (z. B. „B Eigenkapital") bekommen ihren Wert
  bottom-up per Roll-up aus den direkten Kind-Positionen (VJ nur, wenn
  alle Kinder VJ haben).
- **Spalten-Anker aus der Jahres-Kopfzeile:** Pro Kontennachweis-Seite
  werden `gjRight`/`vjRight` aus den beiden 4-stelligen Jahreszahlen
  (fiscalYear/-1) abgeleitet; Fallback: rechte Kanten der beiden
  „EUR"-Token. Die Kopfzeilen (Geschäftsjahr/Vorjahr, Jahreszeile,
  EUR EUR) werden übersprungen und **NIE** als Konto/Position
  klassifiziert (behebt „Konto 2024" im ersten E2E).

**Lektion Fixture-Realismus:** Rechtsbündige Spalten, Label-Umbrüche
und die Zwischensummen-Struktur (reine Betragszeilen im äußeren Band,
benannte Zwischensummen ohne Prefix, mehrfach-Beträge auf
„Übertrag"-Zeilen) des echten Drucks müssen in Parser-Fixtures
abgebildet sein — die erste Fixture hat alle drei Eigenschaften
verfehlt und den Fehler bis zum echten E2E verdeckt. Neu abgedeckt
durch sechs Charakterisierungs-Tests (Anker-Findung inkl. Fallback,
inneres/äußeres Band, offenes Konto mit Umbruch, Rollup GJ+VJ,
benannte Zwischensumme, Übertrag). Nicht angefasst: `checkGuvStaffel`,
`checkKontenSumForYear`, `checkAnlageAnchors`, `validateReplacePayload`
— die Gate-Logik ist korrekt und bleibt unverändert; nur die
Datenzulieferung wurde repariert.

**F4b-Fix-2 — Abschnitte über Seitengrenzen (03.07.2026):** Zweiter
E2E-Befund an allen drei echten Berichten (2022–2024): Der Anker
„Kontennachweis zur Handelsbilanz/GuV" steht nur auf der **ersten Seite**
eines Abschnitts. Fortsetzungsseiten tragen nur Entity-Kopfzeile,
Spaltenkopf (ggf. „Aktiva"/„Passiva", Jahreszahlen, „EUR EUR"),
„Übertrag"-Zeile und dann die restlichen Konten/Positionen. Vorher wurden
alle Seiten ohne Anker verworfen — Aktiva verlor Seite 2 inkl.
Bankkonten und „Summe Aktiva", die GuV brach nach Posten 3 ab, und Konten
mit umgebrochenem Label über die Seitengrenze verloren ihre Beträge.
Nachgezogen: Der Parser führt einen `currentSection`-Zustand über die
Seitenschleife; eine Seite ohne Anker, aber mit Spaltenkopf ist
Fortsetzungsseite (offener Konto- und Positions-Stack überleben den
Umbruch). Anlage-/andere Anker oder eine Seite ohne Spaltenkopf beenden
den Abschnitt. Entity-Kopfzeile, Fußzeile („Erläuterung zu den
wesentlichen Posten"), einzelnes „Aktiva"/„Passiva" und die Anker-Zeile
selbst werden nie als Konto/Position klassifiziert. Widerspricht das
Statement-Label der Folgeseite dem aktiven Abschnitt → Warnung und Label
gewinnt. Neu abgedeckt durch fünf Charakterisierungstests (offenes Konto
über die Seitengrenze, Übertrag beider Seiten ignoriert, Positions-Summe
der Folgeseite trifft die richtige offene Position, Folgeseite ohne
Spaltenkopf beendet den Abschnitt, widersprüchliches Statement-Label
erzeugt Warnung + Wechsel). Nicht angefasst: Gate-Funktionen,
`findAnlageAnchors`, Banding/Anker-Ableitung, `validateReplacePayload`,
`bilanz.functions.ts`, Schema/Migration.

**Lektion:** Abschnitte laufen über Seitengrenzen; der Anker steht nur
auf der ersten Seite — Fortsetzungsseiten erkennt man am Spaltenkopf.

**F4b-Fix-3 — Teilsummen akkumulieren + Dezimalkomma-Pflicht (03.07.2026):**
Dritter E2E-Befund an allen drei echten Berichten: zwei Restursachen.
(1) Positionen mit mehreren gestapelten Teilsummen (B.II Forderungen:
zwei Kontenblöcke, je eigene reine Betragszeile, keine finale Gesamtzeile
— B.II = Σ Teilsummen; erst B.III schließt) wurden vom Parser bei der
ersten Teilsumme geschlossen, die zweite rutschte auf die nächste offene
Position. (2) Konten mit Paragraphen-Zahlen im Label (8105
„… § 4 Nr. 12 UStG …", 2281 „… nach § 4 Abs. 5b EStG") verloren ihre
Beträge, weil die nackten Label-Zahlen „4"/„12" als GJ-Betrag gefressen
und das Konto verfrüht geschlossen wurde — die Delta-Beträge stimmten
cent-genau mit den echten Werten überein. Nachgezogen: Reine Betragszeile
im äußeren Band schließt die innerste offene Position NICHT mehr — sie
akkumuliert (GJ addiert immer; VJ addiert nur, wenn alle Teilzeilen einen
VJ trugen, sonst wird VJ auf null gesetzt). Positionen schließen erst
beim nächsten Positions-Header mit gleichem oder höherem Level bzw. am
Abschnittsende (Level-Stack). Betrags-Klassifikation umgestellt auf
Dezimalkomma-Pflicht (`^-?\d{1,3}(\.\d{3})*,\d{2}$`) — genau zwei
Nachkommastellen, wie ETL-ADHOGA ausnahmslos druckt; Jahres-Kopfzeilen-
Erkennung nutzt weiter ihr eigenes Muster. Neu abgedeckt durch vier
Charakterisierungstests (B.II-Muster mit zwei Teilsummen, 8105-Muster mit
nackten Label-Zahlen, 2281-Muster mit dreizeiligem §-Label und Kleinst-
betrag −0,20, negative Zeile mit nur nackten Ganzzahlen). Nicht ange-
fasst: Gate-Funktionen, Anker-/Band-Logik, Seitenfortsetzung aus Fix-2,
`pdf-lines.ts`, `bilanz.functions.ts`, UI, Schema/Migration.

**Lektion:** Positionen können mehrere gestapelte Teilsummen haben
(Positionsende = nächster Positions-Header, nicht erste Summenzeile).
Beträge haben im ETL-ADHOGA-Druck immer zwei Nachkommastellen — nackte
Ganzzahlen sind Label-Bestandteile (§-Zitate!), nie Beträge.

## 50. Fallstudie: „Forbidden" auf /profil unter Impersonation — fehlende Default-Rolle (04.07.2026)

**Symptom:** „Vorschau als ANDI" → alle Portal-Tabs funktionieren, nur
„Meine Daten" wirft „Fehler beim Laden: Forbidden".

**Beweiskette:** (1) Impersonation wirkt bis in die RLS — Migration
`20260617230538` definiert `current_staff_id()` effective-aware (bei
aktiver Vorschau gilt die Zielperson als Identität); die Browser-Session
bleibt die des Admins, `startImpersonation` schreibt nur die
Overlay-Zeile. (2) `/profil` ist die einzige Portal-Seite auf
`loadAdminCaller(…, "staff")` — der verlangt zwingend eine
`role_assignments`-Zeile (`role = null` ⇒ ForbiddenError). Die übrigen
Portal-Tabs laufen über `loadStaffCaller`, der KEINE Rolle prüft.
(3) ANDI hatte keine Rollen-Zuweisung ⇒ Forbidden. Derselbe Fehler
träfe sie auch beim echten PIN-Login.

**Wurzel (systemisch, OFFEN):** `createStaff` vergibt keine Default-Rolle
— jeder neue Mitarbeiter ohne manuell gesetzten Rechte-Tab läuft in
dieses Loch. Sofort-Fix pro Person: Stammblatt → Rechte → Rolle `staff`.
Geplanter Fix (Prompt wartet auf GO): `createStaff` schreibt die Rolle
`staff` im selben runGuarded-Block mit (+ Backfill-SQL für Bestands-
Mitarbeiter ohne Zeile). Bis dahin gehört „Rolle zuweisen" verbindlich
in Schritt 2 des Onboarding-Runbooks.

## 51. Fallstudie: Pool-Zeit-Rückschreibung 100 % still tot — partielle Indizes vs. PostgREST-Upsert (04.07.2026)

**Symptom:** Kellner-Abgaben liefen (Service-Pool-Endzeiten wurden gesetzt),
aber KEIN Pool-Teilnehmer bekam time_entries — Arbeitszeiten-Tab leer,
seit Einführung der Rückschreibung am 30.06. Diagnose-CSV 03.07.: 19 Pool-
Zeilen mit (fast) vollständigen Zeiten, Tag ungesperrt, 0 Zeiteinträge.

**Root Cause:** `upsert(..., { onConflict: "organization_id,import_key" })`
gegen zwei PARTIELLE Unique-Indizes (WHERE source='import' bzw. 'pool') —
PostgREST kann partielle Indizes nicht als Konfliktziel inferieren →
42P10 bei jedem Aufruf, vom Best-effort-Catch still geschluckt.

**Fix:** Ein VOLLER Unique-Index auf (organization_id, import_key) ersetzt
beide (NULLs kollidieren nie → gefahrlos für clock/manual; Key-Präfixe
disjunkt). Alt-Tage seit 30.06. per Heilungs-SQL nachgezogen (repliziert
resolvePoolTimeEntrySync inkl. Mitternachts-Wrap und Europe/Berlin;
Vorrangregel und Unvollständig-Regel respektiert). Catches schreiben jetzt
Audit-Einträge (pool_time.writeback_failed / sync_failed).

**Pflicht-Regeln daraus:**

- PostgREST-`onConflict` verlangt einen VOLLEN Unique-Index/Constraint auf
  exakt den Spalten — partielle Indizes sind damit unvereinbar und
  scheitern zur Laufzeit (42P10), nicht beim Deploy.
- Best-effort-Catches müssen IMMER eine auffindbare Spur hinterlassen
  (audit_log), nie nur console.error — vier Tage unsichtbares Scheitern
  waren die Folge.
- Offene Pool-Zeiten (kein shift_end, z. B. keine Abgabe erfolgt) erzeugen
  bewusst KEINEN Eintrag — Nachpflege in der Kassen-Pool-Zeile löst den
  Sync sofort aus.

## 52. Provision P1 — Server-Layer (04.07.2026)

Portierung der Legacy-Commission (`useCommissionData` aus tagesabrechnung)
mit drei Neuerungen: (1) an-/abschaltbar pro Standort
(`locations.commission_enabled`, Default AUS — `enabled=false` beendet die
Server-Fn VOR jeder Rechnung, also auch vor jedem Datenzugriff), (2)
Einstellungen pro Standort (Mindestumsatz je Kellner/Tag in CENTS, Satz in
%), (3) Rechnung in BIGINT cents mit centgenauer
Largest-Remainder-Verteilung (Legacy verlor Rundungscents an Floats).

Formel unverändert zur Legacy: pro Tag Kellner-Set aus Abrechnungen +
Partnern (GL immer ausgeschlossen, sowohl als Haupt- als auch als
Partner-Kellner), Schwelle `revenue / waiterCount ≥ minRevenueCents`,
Tages-Pool = `round((revenue − min × waiterCount) × pct / 100)`,
Verteilung nach Service-Minuten des Zeitraums aus `time_entries`
(Auto-Ausstempeln + Pool-Writeback stellen sicher, dass praktisch immer
ein `time_entry` existiert — der frühere Legacy-Fallback auf
Abrechnungs-Zeiteinträge ist damit nicht mehr nötig).

Pures Modul `src/lib/lohn/provision-calc.ts` ist zeitraum-agnostisch
(Periode UND Woche möglich), getestet inkl. Legacy-Kanonik (1 Tag, 2
Kellner, 3.400 € / min 1.200 € / 5 % ⇒ Pool 5.000 Cents),
Schwellen-Grenzfall, Partner-Kopfzahl, GL-Ausschluss (Haupt und Partner),
Largest-Remainder-Summen-Invariante (Pool 10.001 auf 3 Kellner ⇒ Σ =
10.001, deterministische Tie-Break-Reihenfolge nach `staffId`).

Server-Fns:

- `getProvisionOverview({ locationId, periodStart, periodEnd })` — reine
  Leseoperation, gated auf `manager | admin | payroll`. Kurzschluss bei
  deaktiviertem Standort. Rückgabe: `{ enabled, settings, poolCents,
dayBreakdown[], rows[] }` — der `dayBreakdown` ist die Grundlage für
  Franks „detailliert beschrieben"-Anforderung im P2-UI (Drilldown pro
  Tag: Umsatz, Kellnerzahl, Schwelle, Tages-Pool).
- `updateCommissionSettings({ locationId, enabled, minRevenueCents, pct })`
  — admin-only, `runGuarded` + Audit-Eintrag
  `provision.settings_changed` mit `before/after` der drei Werte (keine
  sensiblen Daten).

M4 bleibt bewusst getrennt: Provision fließt NICHT automatisch in den
Lohnrechner ein — die Übergabe ans Lohnbüro ist P2- bzw. Folge-Thema.

Offen: **P2 UI** — Provision-Tab in der Zeitübersicht (Liste + Pool +
Erklärungs-Panel mit Tages-Drilldown), Einstellungs-Dialog pro Standort
(Schalter, Mindestumsatz, Satz).

P2 UI (04.07.): Provision-Tab mit Perioden-Pool, Verteilungs-Tabelle,
Tages-Drilldown (dayBreakdown macht die Formel an echten Zahlen
nachvollziehbar), Einstellungs-Dialog (aktiv/min/pct, admin-only) und
statischem Erklärungs-Panel. Bei „Alle Standorte" bewusst kein Merge —
Provision ist standort-scoped. Status: ✅ (E2E Frank ausstehend).

04.07.: Alle-Standorte-Merge für Zusammenfassung/Buchhaltung
(Client-Merge nach Wochenplan-Muster, sfn/notes je Standort
summiert/konkateniert); Wochenplan-Layout final: Anf./Ende nebeneinander,
gleiche Tages-Spalten, Namens-Spalten 68px gespiegelt, S/U/K-Gruppe
konsistent in allen drei Tabs, Tastatur-Navigation beim Inline-Edit.

## 53. Telegram-Verknüpfung (Bot + Webhook) (04.07.2026)

Infrastruktur für Telegram-Benachrichtigungen (Direktarbeit, Security-Review
bestanden): Öffentliche Webhook-Route `/api/public/telegram/webhook`
verifiziert Telegrams `X-Telegram-Bot-Api-Secret-Token` per timingSafeEqual
(401 sonst) und verarbeitet AUSSCHLIESSLICH `/start <token>` zur
Konto-Verknüpfung — alle anderen Updates werden ignoriert. Bot-Token nur als
Env-Secret (TELEGRAM_API_KEY via Lovable-Connector), NIE in der DB.
Verknüpfungs-Token: CSPRNG (randomBytes(32) base64url) mit Ablauf;
Self-Service in /profil (Deep-Link), Verwaltung in den Einstellungen.
Tabelle `staff_telegram_links`: Self-Service-Policies (eigenen Link
lesen/löschen) + Admin-Übersicht — bewusster, eng gescopter Client-Zugriff
(Chat-ID/Username, geringe Sensibilität), Webhook schreibt via service_role.
Noch KEIN Versand-Pfad — Berichte (z. B. Tages-Summary) sind ein eigener
Folge-Baustein mit Design-Schritt (was wird an wen gesendet, Opt-in).

TG2 Tagesbericht (04.07.): Versand an angehakte verknüpfte Konten
(`staff_telegram_links.receives_daily_report`) statt fester Chat-ID.
Trigger: pg_cron ruft STÜNDLICH die Route `/api/public/telegram/daily-report`
(Prompt nannte `/api/internal/…` — Pfad bewusst unter `/api/public/`
abgelegt, weil auf TanStack Start nur dieser Prefix ohne Lovable-Auth-Wall
zuverlässig extern erreichbar ist; abgesichert wird ausschließlich per
`X-Cron-Secret`, timing-safe gegen `process.env.TELEGRAM_CRON_SECRET`;
503 wenn Env fehlt). Der Endpoint gated selbst — Berlin-Stunde ==
`telegram_report_hour` UND `telegram_report_last_sent` < heute → DST-fest
und idempotent. Inhalt aus denselben Helfern wie das Tages-PDF
(`sessionToDayInput` / `computeDailyCash` / `computeWechselgeld`);
pures Modul `src/lib/telegram/telegram-report.ts` (HTML `parse_mode`,
`escapeHtml` für alle dynamischen Strings, Vitest deckt Escaping/Flags/
Ausschluss/„Keine Daten"/Snapshot ab). Empfänger-Fehler einzeln
`try/catch` — ein toter Chat blockiert die anderen nicht. Audit
`telegram.report_sent` speichert nur Zähler + Datum, KEINE Berichts­inhalte.
Testbericht-Button in den Einstellungen umgeht das Gate ohne
`last_sent` zu setzen. pg_cron-Einrichtung: Frank-SQL (Ops, keine
Migration).

BZ1 Batch-Schichtzeiten (04.07.): Portierung des Legacy-`ShiftTimeOverride`
als Admin-Card auf `/admin/zeit-uebersicht`. Drei Modi (`override`,
`create_weekdays`, `create_daily`) — für Gehalts-/GL-Personal, das nicht
stempelt. Standardzeiten je Werktag (17:00–01:00) und Sonn-/Feiertag
(15:00–02:00) sind konfigurierbar in `organization_settings`
(`batch_weekday_start/end`, `batch_sunhol_start/end`) und werden per
Admin-Dialog gepflegt. Sonn-/Feiertagsentscheidung nutzt die kanonische
Quelle `isBavarianHoliday` aus `shift-hours.ts` (1. Mai unter der Woche
bekommt so die sunhol-Zeiten). Skip-Semantik im reinen Modul
`src/lib/time/batch-times.ts`: `locked` (Wasserlinie — Batch bricht NIE
hart ab, sondern zählt Skips), `absence` (`roster_absence`), `other-location`
(Eintrag am selben Tag an einem Fremd-Standort), `no-entry` (override-Modus
ohne bestehende Schicht — erzeugt bewusst NICHTS), `not-weekday`
(create_weekdays Sa/So). Mitternachts-Wrap (17→01 landet am Folgetag) über
`batchTimestamps`; Pausen kommen aus `arbzgMinimumBreak`. Audit-Strategie:
EIN Aggregat-Eintrag pro Lauf (`time_entry.batch_times`, meta enthält
`runId`, Modus, Periode, Zähler, `createdEntryIds`) plus separate Chunks
(`time_entry.batch_times.changes`, ~200 Vorher-Bilder je Chunk, gemeinsame
`runId`) — überschriebene Zeiten sind aus dem append-only Log
rekonstruierbar, ohne den Audit-Trail bei großen Läufen zu fluten.

## 54. Urlaubs-Stammdaten aus edlohn-PaySlips + Vorzeichen-Lektion (04.07.2026)

Aus dem Sammel-PDF „Entgeltabrechnungen YUM Gastronomie GmbH 06/2026"
(65 Seiten, 39 Personen) wurden die Urlaubsfelder für 36 Mitarbeiter in
`staff_personal_details` importiert (Join strikt über `staff.perso_nr`,
COALESCE-only-NULL — gepflegte Werte unantastbar). Semantik an Real-Fällen
verifiziert: genommen = (akt Jahr + Vorjahr) − Restanspruch, Stichtag
30.06.2026. Verifikation: 36/36 gematcht und gefüllt, 0 ohne Zuordnung.

**Sonderfälle:** 6 Personen mit NEGATIVEM Vorjahres-Übertrag (Urlaub
überzogen: perso 4, 11, 253, 320, 334, 504) — `previous_year` bewusst NULL
gelassen (App-Schema erwartet ≥ 0; Entscheidung Frank offen: Schema
erweitern vs. 0 mit Vermerk). 3 Personen ohne Urlaub-Block im PaySlip
(12, 20, 317). `vacation_days_contractual` steht in keinem PaySlip und
bleibt Handpflege. TSB ist eine eigene Entität — PaySlips folgen separat.

**Lektion (Import-Disziplin):** Vorzeichen-Audit auf ALLE extrahierten
Felder, nicht nur das Zielfeld — die erste Plausibilitätsprüfung testete
nur „genommen < 0" und übersah sechs negative Vorjahres-Werte; aufgeflogen
durch Zufalls-Review. Dieselbe Sorgfalt wie bei Geld-Importen gilt für
jede Zahlenspalte.

## 55. Schichttausch TA1 — Zustandsmaschine, DENY-ALL-RLS, kein Auto-Vollzug (04.07.2026)

Mitarbeiter können ihre eigenen zukünftigen `roster_shifts` zum Tausch
anbieten. Berechtigte Kollegen (gleicher Standort + gleicher Arbeitsbereich,
kein Tageskonflikt) sehen die Anfrage im Portal und können sie **annehmen**
oder **ablehnen**. Der Dienstplan ändert sich in TA1 NIE automatisch — der
Vollzug (Umschreibung von `roster_shifts.staff_id`) ist Aufgabe der
Manager-Genehmigung (TA2).

**Zustandsmaschine `shift_swap_requests.status`:**

```
open ──accept──▶ peer_accepted ──approve──▶ approved
  │                    │
  │                    └──reject──▶ rejected
  │
  └──cancel (nur Anfragender) ──▶ cancelled
```

Ablehnungen einzelner Kollegen leben in einer **separaten Tabelle**
`shift_swap_declines (request_id, staff_id)` und **ändern den Status
NICHT**. Auch wenn alle Berechtigten ablehnen, bleibt der Request `open` —
der Anfragende entscheidet selbst über Stornieren. Eine ANNAHME kann der
Kollege in TA1 nicht zurückziehen (nur der Anfragende storniert, der
Manager lehnt in TA2 ab). Eine ABLEHNUNG ist endgültig für diesen Request.

**Berechtigten-Regel (`eligiblePeerFilter` in `swap-rules.ts`):** aktiv,
nicht der Anfragende, hat `staff_locations`-Zeile mit
`(location_id, department) == (shift.location_id, shift.area)`, hat an
`shift_date` an genau diesem Scope KEINE eigene Schicht.

**RLS/Zugriff:** Beide Tabellen sind **DENY-ALL** für Clients — keine
Policies, alle Zugriffe laufen server-seitig über `supabaseAdmin` NACH
`loadStaffCaller` und expliziter Berechtigungsprüfung. `staffId` kommt
IMMER aus `auth.uid` → `user_links` und nie vom Client.

**Partieller Unique-Index:**
`shift_swap_requests_active_shift ON (shift_id) WHERE status IN ('open','peer_accepted')`
verhindert zwei aktive Anfragen pro Schicht. §51-Anmerkung: der Index ist
KEIN `onConflict`-Ziel für PostgREST-Upserts — der Konflikt wird als
`INSERT`-Fehler oben abgefangen und zusätzlich server-seitig per
`hasActiveRequestForShift`-Precheck erkannt.

**Perioden-Sperren:** Beim Anlegen einer Anfrage wird
`assertShiftDateUnlocked` gerufen — für gesperrte Perioden gibt es keine
Tausch-Anfragen.

**Status:** TA1 ✅ / TA2 offen.
