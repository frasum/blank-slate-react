# Arbeitsweise & Stammdaten-Referenz — COCO

Schlankes Betriebshandbuch für die laufende Entwicklung. Wird bei jedem neuen Baublock konsultiert. Bewusst kurz gehalten — Architektur-Begründungen stehen im gruendungsdokument.md, nicht hier.

Stand: 16.06.2026

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
- **CI-Jobs:** `check` (tsc+eslint+vitest) muss grün sein. `db-integration` ist gelegentlich flaky („role_assignments insert failed: upstream") — das ist ein Timing-Problem des lokalen Supabase-Stacks, kein Code-Bug.

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
- **tagesabrechnung** (Kasse/Zeit-Quelle)
- **bunker-shift-flow** (Dienstplan-UI-Vorlage: RosterGrid, Paint-Tool)
- **thaitime-12f46b18** (Dienstplan-Daten + Display-Vorlage)

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

## 6. Aktueller Modul-Status (16.06.2026)

| Modul                                                                 | Status   |
| --------------------------------------------------------------------- | -------- |
| B3 Kasse + B4 Trinkgeld + B5 Tresor                                   | ✅       |
| B6 Zeitübersicht (Wochenplan/Zusammenfassung/Buchhaltung/Perioden)    | ✅       |
| B7 Perioden (26.–25.) + Import Jan–Sep 2026                           | ✅       |
| B8 Lohnbüro-Rolle (payroll)                                           | ✅       |
| D1 Dienstplan-Datenmodell + Grid                                      | ✅       |
| D2a–e Dienstplan editierbar, Realtime, Service-Symbole, Cross-Booking | ✅       |
| Dienstplan-Migration (4498 Schichten aus thaitime)                    | ✅       |
| D3 Öffentliches Display (Token-URL, Auto-Refresh, Rotation, Legende)  | ⏳ offen |
| Brutto/Netto (Lohnberechnung, SFN, Steuerklassen)                     | ⏳ offen |
| Provision (wochenbasiert)                                             | ⏳ offen |

**Stand 16.06.2026 (Session-Nachzug):**

- **B2b-Korrektur-UI entfernt:** `/admin/zeit` (Manager-Zeitkorrektur) + die Server-Functions `listEntriesForCorrection`/`getTimeLockSettings`/`createManualEntry`/`updateTimeEntry`/`deleteTimeEntry`/`setTimeLock` bewusst gelöscht. Schema (`source='manual'`, Wasserlinie) bleibt; Korrektur derzeit nur per SQL. Zeit-Migration aus tagesabrechnung (B2c) **unberührt** (eigenes `migration/`-Subsystem). Details im gruendungsdokument-Nachtrag.
- **Branding O1 entschieden:** App heißt „Central Ops" (BrandLockup über alle Seiten).
- **Standorte:** Kontaktfelder ergänzt (`phone`/`contact_name`/`contact_phone` auf `locations`, Migration `20260616102537`; create/update admin-only, org-gescoped). Live-DB-ALTER ggf. noch ausführen.
- **Personaldaten-Tab** in `/admin/staff/:id` (HR-Daten: IBAN, Steuer-ID, SV-Nummer, Steuerklasse, Bank, Urlaub etc.). Eigene Tabelle `staff_personal_details` (NICHT die `staff`-Stammtabelle). RLS: SELECT nur `admin`/`payroll`, Schreiben nur `admin`, org-scoped (Migration `20260616145016` — **verschärft SELECT von manager+ → admin/payroll; auf Live-DB ausführen, sonst lesen Manager dort noch IBAN/SV**). Audit-Log schreibt sensible Felder nur als `[REDACTED]` (`redactForAudit`, getestet) — nie Klartext. IBAN wird validiert/normalisiert.

**Offen aus B3/B4** (Echtbetrieb-Hebel): Trinkgeld-Pool-Verteilung als eigener Baustein (`useCommissionData`-Logik: Pool/Tag = Σ max(0,(Tagesumsatz − minRevenue × Kellnerzahl) × commissionPct%), Verteilung nach Stunden), B3c-1 manuelles E2E, B3c-2 (Saldo/Export). Hängt an D-M2-1 (Auto-Ausstempeln bei Abrechnungs-Abgabe) — erst damit stempelt das Team in COCO um.

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

**Hinweis CI:** `max-warnings` inzwischen auf 5 (5 tolerierte `react-hooks/exhaustive-deps`-Warnings: inventur/warenkorb/zeit-uebersicht + 2 in `easyorder.tsx`). Bei Gelegenheit bewusst aufräumen, nicht nebenbei (Logik-nahe `useMemo`-Änderung).
