# Arbeitsweise & Stammdaten-Referenz — COCO

Schlankes Betriebshandbuch für die laufende Entwicklung. Wird bei jedem neuen Baublock konsultiert. Bewusst kurz gehalten — Architektur-Begründungen stehen im gruendungsdokument.md, nicht hier.

Stand: 29.06.2026

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
- **Neue Stammdaten-Spalte ⇒ Select-Liste mitziehen.** Jede neue Spalte auf `staff_personal_details`, die der Berechnungspfad braucht, MUSS in die explizite `.select(...)`-Liste in `src/lib/lohn/lohn-rechner.functions.ts` (Funktion `computeLohnForStaff`). Migration + Mapping (`staffDetailsToPerson`) + Berechnung allein reichen NICHT: fehlt die Spalte im Select, kommt sie als `undefined` an → `!!undefined = false` bzw. `?? default` → das Feature greift stillschweigend nicht, obwohl Code, Daten und CI grün sind. (Aktivrente-Hebel 26.06.: ~1 h Phantom-Deploy-Suche, bis die fehlende Select-Spalte gefunden war.) Daher nennt jeder Hebel-Prompt mit neuer Spalte die Select-Erweiterung explizit.

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

### tagesabrechnung → COCO Kassen-Mapping (Juni-Nachimport, 29.06.2026)

Rekonstruiert per Kalibrierung gegen bereits validierte Bestands-Sessions (Referenztag 10.06.). Geld = Quellwert ×100 → `*_cents`. **`sessions.id` und `waiter_settlements.id` werden 1:1 aus der Quelle übernommen.**

**Standort:** `restaurant_id` `3065f458-…` → YUM, `a1710390-…` → Spicery. (TSB hat in der Quelle keine Kassen-Sessions.)

**`sessions`:** `pos_total`→`vectron_daily_total_cents`; `session_date`→`business_date`; `guest_count`, `einladung`, `finedine_vouchers`, `vorschuss`, `sonstige_einnahme`, `vouchers_sold/redeemed` → gleichnamige `*_cents`. Konstant gesetzt: `status='open'`, `tip_pool_settlement_only=true`, `opentabs_deduction_cents=0`, `cash_actual_cents`/`opening_balance_cents`=NULL.

**Kanäle (`session_channel_amounts`, je `channel_id`):** `wolt_revenue`→Wolt, `takeaway_total`→Vectron-Takeaway, `ordersmart_revenue`→SOUSE. **Terminals (`session_terminal_amounts`, je `terminal_id`):** `terminal_1_total`→Terminal 1, `terminal_2_total`→Terminal 2, `card_total_gl`→Kredit Karten GL. **Null-Beträge erzeugen keine Zeile.** Diese Tabellen haben **keine** `location_id`-Spalte.

**`waiter_settlements` (eine Zeile je `waiter_shifts`):** `pos_sales`→`pos_sales_cents`; **`kassiert_brutto_cents = pos_sales` (Entscheidung A** — folgt der Live-Wahrheit, nicht dem Quell-Feld `kassiert_brutto`); `card_total`, `cash_handed_in`, `differenz`, `open_invoices`, `kitchen_tip`, `hilf_mahl` → `*_cents`; `kitchen_tip_rate`=0.0200; `status='submitted'`; `submitted_at` aus Quelle. `partner_staff_id`/`second_waiter_name`=NULL, `additional_waiters='[]'`. **Die Tabelle hat keine `location_id`-Spalte.** Zusatzkellner bekommen **keine** Settlement-Zeile.

**`session_tip_pool_entries`:** `hours_minutes = round(hours_worked × 60)`. Service je `waiter_shifts` mit `participates_in_pool=true`; Küche je `kitchen_shifts`. **Zusatzkellner** (`additional_waiters`/`second_waiter_name`) erhalten einen **eigenen** Service-Eintrag mit den Stunden des Primärkellners und `note='Zusatzkellner-Nachimport'`. Die Tabelle hat **keine** `location_id`-Spalte.

**Mitarbeiter-Auflösung:** Quell-`waiter_name`/`staff_name` → COCO `staff_id` über `upper(staff.display_name)` (case-insensitive). Sonderfall: Login-Form `jirawut.saechiang` → `COCO` (perso 19).

**Idempotenz:** Import-SQL nutzt durchgängig `WHERE NOT EXISTS` (gefahrlos mehrfach ausführbar); Kassendetail-Tabellen (`session_card_transactions`/`session_expenses`/`session_bank_deposits`/`session_advances`/`session_register_transfers`) werden für diese settlement-only-Sessions **nicht** befüllt.

**Leere native Hüllen ersetzen (26./27.06., nachgezogen 29.06.):** Beim Nachimport zeigte sich, dass COCO für manche Tage bereits eine **leere native Session-Hülle** führt — die Session existiert, hat aber `vectron_daily_total_cents=0` und 0 Kind-Zeilen. Eine Lückenerkennung über die reine **Session-Existenz** übersieht diese; geprüft werden muss der **Inhalt** (vectron + Zähler von `waiter_settlements`/`session_channel_amounts`/`session_terminal_amounts`/`session_tip_pool_entries`). Betroffen waren YUM 28. sowie YUM **und** Spicery 26.+27. Behandlung = **guarded Replace**: die leere Hülle nur löschen, wenn sie kinderlos ist (`NOT EXISTS` auf alle vier Kind-Tabellen, die eigene Legacy-`id` per `id <> …` ausgenommen), dann die Legacy-Session mit Legacy-`id` einspielen — atomar in `BEGIN…COMMIT`. **Konsequenz für den Go-Live-Re-Import:** Der muss leere native Hüllen **ersetzen**, nicht nur fehlende Tage auffüllen — sonst bleiben Tage mit Null-Umsatz in der Abrechnung sichtbar, obwohl die Legacy echte Zahlen hat.

### Mitarbeiter-Mapping

Über das Nickname in Klammern im thaitime-Vornamen, z.B. „REDACTED" → COCO display_name „REDACTED". Sonderfall: „REDACTED" → REDACTED. „REDACTED" existiert nicht in COCO (ignoriert). Sonderfall Doppel-Nickname GIG: Der bestehende Küchen-„GIG" (perso 360) und der neue Service-„GIG" tragen in thaitime denselben Nickname-Stamm — daher KEIN Auto-Match. „(GIG SERVICE)" ist per Hardcode auf den eigenen Service-Mitarbeiter `staff_id 93e44abe-d1d8-4763-b0a6-63cea7313687` (display_name „GIG SERVIE", Spicery/`service`) gemappt; der Küchen-GIG bleibt unverändert.

## 6. Aktueller Modul-Status (29.06.2026)

| Modul                                                                                                                                  | Status   |
| -------------------------------------------------------------------------------------------------------------------------------------- | -------- |
| B3 Kasse + B4 Trinkgeld + B5 Tresor                                                                                                    | ✅       |
| B6 Zeitübersicht (Wochenplan/Zusammenfassung/Buchhaltung/Perioden)                                                                     | ✅       |
| B7 Perioden (26.–25.) + Import Jan–Sep 2026                                                                                            | ✅       |
| B8 Lohnbüro-Rolle (payroll)                                                                                                            | ✅       |
| D1 Dienstplan-Datenmodell + Grid                                                                                                       | ✅       |
| D2a–e Dienstplan editierbar, Realtime, Service-Symbole, Cross-Booking                                                                  | ✅       |
| D-8 Eine Einteilung/MA/Tag (Pre-Check + UI-Lock, kein DB-Constraint)                                                                   | ✅       |
| Dienstplan-Migration (Re-Import 17.06.: 3764 · Delta-Nachimport 29.06.: +114 → 3873, inkl. Jul–Sep-Planung + GIG-Service)              | ✅       |
| D3 Display — Token, Auto-Refresh, Einstellungen (Rotation/Bereiche/Header/Legende/Nachricht/QR), Bereichs-Freigabe, Geburtstags-Banner | ✅       |
| M4 Lohn — Rechen-Kern (Stufe 1/3): PAP 2026 + SV, edlohn-cent-getestet                                                                 | ✅       |
| M4 Lohn — SFN-Geld + Perioden-Aggregation + Verdrahtung (Stufe 2a–c)                                                                   | ✅       |
| M4 Lohn — Lohnrechner-UI + Excel-Export (`/admin/lohnrechner`)                                                                         | ✅       |
| M4 Lohn — Perioden-Übersicht (Liste aller aktiven MA je Periode, Klick → Detail)                                                       | ✅       |
| M4 Lohn — Lohnrechner-Übersicht CSV-Export (edlohn-Abgleichs-Datensatz)                                                                | ✅       |
| M4 Lohn — Sachbezug + Mahlzeiten als automatische Lohnarten                                                                            | ✅       |
| M4 Lohn — Soll-Std/Tag-Feld (Vertrags-Soll je MA)                                                                                      | ✅       |
| M4 Lohn — Urlaub/Krank ins Brutto (`lohn_absence_days`, Tage = Vorgabe)                                                                | ✅       |
| Provision (wochenbasiert)                                                                                                              | ⏳ offen |
| Geofencing-Stempeln (UI clockIn nur am Standort, distinct-Location)                                                                    | ✅       |
| PIN-Login via Vorname/Nickname                                                                                                         | ✅       |
| Hub & Meine Schichten (`/zeit/schichten`, `/zeit/stempeln`)                                                                            | ✅       |
| M-Statistik — Umsatz (S-1/S-2: reine Fn + Server-Fn, Kalendermonat, doppelzählungsfrei)                                                | ✅       |
| M-Statistik — Trinkgeld (S-7: Tagesreihe + Totals + perStaff, Reuse computeSessionTipPoolCore)                                         | ✅       |
| M-Statistik — Personalquote (S-8: Basis-Brutto B2, gültigkeitsdatierter hourly_rate)                                                   | ✅       |
| M-Statistik — UI (Tabs, KPI/Chart, Trinkgeld, Personalquote, Standortvergleich, PDF, freier Zeitraum)                                  | ✅       |
| Inventur-Session an DB gebunden                                                                                                        | ✅       |
| Self-Service Welle B — Freier-Tag-Wunsch (`/zeit/wuensche`)                                                                            | ✅       |
| Self-Service Welle C — Urlaubsanträge + Genehmigung (`/zeit/urlaub`, `/admin/urlaub`)                                                  | ✅       |
| Kasse — Vier-Zeilen-Bargeldblock + Soll-Wechselgeld je Standort                                                                        | ✅       |
| Kasse — Abgleichs-Warnungen (POS-/Terminal-Differenz, `payment_terminals.is_gl`)                                                       | ✅       |
| Impersonation („Anmelden als") + granularer Rechte-Tab + Passwort-Flows (ändern/zurücksetzen)                                          | ✅       |
| M4 — Payroll-Policies erweitert (`m4-payroll-permissions.db.test`)                                                                     | ✅       |
| Buchhaltung §3b-Block (`/admin/zeit-uebersicht`, payroll-Tab) inkl. Feiertags-Fix                                                      | ✅       |
| Interne Verbesserungen: `@/lib/format`, DE-Lokalisierung, Skeletons, Identity-Roundtrip                                                | ✅       |
| Refactor: `kasse.tsx` aufgeteilt (2189 → 860 Z., `src/components/cash/*`)                                                              | ✅       |
| Auto-Ausstempeln: verschluckter DB-Fehler in `submitWaiterSettlementCore` gefixt (`if (linkErr) throw`)                                | ✅       |
| PIN-/Passwort-Login gegen PostgREST-Filter-Injection gehärtet (Allowlist `validatePinLoginName`)                                       | ✅       |
| `parseEuroToCents` zentralisiert (eine Impl. in `@/lib/format`; Bestellung-Magnitude-Korrektur)                                        | ✅       |
| Artikel-Suche (`listArticles`) gegen PostgREST-`.or()`-Injection gehärtet (`sanitizeArticleSearchTerm`)                                | ✅       |
| jspdf/pdfjs lazy-geladen (#3-Rest: keine statischen PDF-Imports mehr)                                                                  | ✅       |
| Security-Header / CSP (Report-Only) auf HTML-Responses (`withSecurityHeaders` in `server.ts`)                                          | ✅       |
| Mitarbeiter-Matrix (Stammblatt-Umbau: Standort-Dept-Pills, Skill-Eligibility, Index-Redesign)                                          | ✅       |
| payroll = Büro (Index-Sperre + Dienstplan-Ausschluss, keine 4. Abteilung)                                                              | ✅       |
| Wochenplan → Abrechnungsperioden (26.–25., gemeinsamer Periodenbegriff im Zeit-Screen)                                                 | ✅       |
| Aufräumen: Dead-Code, `makeAuditWriter` zentral, Typ-Single-Source `staff-domain.ts`                                                   | ✅       |

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
