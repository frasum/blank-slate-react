# Gründungsdokument: Vereinte Gastronomie-Betriebsplattform

Phase-1-Ergebnis: Domänenmodell, Modulschnitt und Bauplan

Stand: 12.06.2026 · Basis: Vollanalyse der vier Bestandsprojekte

---

1. Zweck und Kernaussage

Dieses Dokument ist das Fundament für den Neubau einer einzigen Anwendung, die die Funktionen von vier bestehenden Lovable-Projekten vereint: bunker-shift-flow, thaitime, tagesabrechnung und bestellung. Es definiert das gemeinsame Datenmodell, den Modulschnitt, die Baureihenfolge und die verbindlichen Qualitätsstandards. Es ist als `CLAUDE.md`-Grundlage bzw. `docs/`-Inhalt für die Umsetzung mit Claude Code gedacht.

Kernaussage der Analyse: Die vier Apps beschreiben denselben Betrieb aus vier Blickwinkeln und haben bereits begonnen, ineinander zu wachsen:

- bunker-shift-flow enthält einen vollständigen Klon der Tagesabrechnung (16 `ta_*`-Tabellen, die das tagesabrechnung-Schema duplizieren).

- thaitime enthält Tagesabrechnungs-Anbauten (`da_settings`, `da_telegram_settings`, `da_audit_logs`).

- tagesabrechnung und thaitime synchronisieren sich gegenseitig Mitarbeiter und Schichten über eigene Edge Functions (`sync-thaitime-staff`, `syncWaiterToZt`).

- Mitarbeiter-Stammdaten existieren viermal, Zeiterfassung dreimal, Kassenlogik zweimal vollständig.

Jede dieser Brücken ist ein Wartungsrisiko und eine Fehlerquelle. Die vereinte App ersetzt vier Wahrheiten durch eine.

---

2. Bestandsaufnahme der vier Projekte

| Kennzahl | bunker-shift-flow | thaitime | tagesabrechnung | bestellung |

|---|---|---|---|---|

| Tabellen | 52 | 73 | 32 | 71 |

| Edge Functions | 3 | 34 | 27 | 66 |

| Seiten (Pages) | 26 | 60 | 25 | 43 |

| TypeScript strict | ✅ (gehärtet) | ✅ (gehärtet) | ❌ (247 any) | ✅ (gehärtet) |

| Tests | 27 (Geldlogik) | 0 | 0 | 90 |

| Multi-Tenant | ❌ (restaurant_id teilw.) | ❌ (branches) | ❌ | ✅ (organizations, durchgängig) |

| Auth-Modell | Supabase Auth + Rollen | Supabase Auth + PIN + QR-Token | PIN + OAuth + WebAuthn → echte Sessions (Remix-Umbau) | Supabase Auth + Magic Links + Portale |

| RLS-Qualität | gut | gut (nach Härtung) | Referenz (nach Remix-Umbau) | Referenz (von Anfang an) |

Charakter und Stärken je App

bunker-shift-flow — der Generalist. Breitester Funktionsumfang in einer App: Dienstplan (virtualisiertes Grid), Stechuhr, Tagesabrechnung (als ta\_-Klon), SFN-Zuschläge mit getesteter Berechnungslogik, Wein (Karte, Quiz, öffentlicher Token-Katalog), Bestellwesen (einfach), Inventur. Stärke: SFN-/Abrechnungs-Tests, Roster-Grid.

thaitime — die HR-Maschine. Tiefstes Mitarbeiter-Modell (24 HR-Tabellen): Onboarding mit Token-Einladungen, Dokumentengenerierung (Arbeitsvertrag/Zeugnis aus Textbausteinen, Signaturen), Lohnhistorie, Nettolohn-Berechnung (724 Zeilen, Steuerklassen/Minijob/SV), Abmahnungen, Skills, Self-Service (Schichtwünsche, Tauschanfragen, Verfügbarkeiten, Urlaubsanträge), internes Messaging, Telegram-Bot, Hygiene-Schulungen, i18n, Capacitor-Mobile-App, KI-Dienstplan-Import aus Fotos.

tagesabrechnung — der Kassen-Spezialist. Sauberstes Abrechnungsmodell: Sessions mit Geschäftstag-Logik (3-Uhr-Cutoff), Kellner-/Küchen-Schichten, Trinkgeld, Kartenzahlungen, Ausgaben, Bankeinzahlungen, Register-Transfers, Vorschüsse, Lohnbüro-Portal, Checklisten. Im Remix wurde das Ziel-Auth-Modell bereits gebaut und bewiesen: PIN-Login mit echten Supabase-Sessions (Schatten-User), rollenbasierte RLS, Geschäftstag-Sperren. Dieses Muster ist die Vorlage für die vereinte App.

bestellung — der Architektur-Maßstab. Einziges echtes Multi-Tenant-System (`organizations` in 275 Policy-Stellen), B2B-Portale (Lieferanten- und Kunden-Portale mit Magic Links), KI-Importe (Kataloge, Rechnungen), Sprachsteuerung (ElevenLabs), 90 grüne Tests, sauberste Token-Architektur. Das Mandanten- und RLS-Muster dieser App ist die Vorlage für das Fundament.

---

3. Funktions- und Überschneidungsmatrix

Tabellen pro Domäne und App (aus den Migrationen extrahiert):

| Domäne | bunker | thaitime | tagesabr. | bestellung | Duplikationsgrad |

|---|---|---|---|---|---|

| Mitarbeiter/HR | 8 | 24 | 9 | 10 | 🔴 4-fach |

| Zeiterfassung | 3 | 1 | 1 (+Sync) | — | 🔴 3-fach |

| Dienstplan | 1 (+Grid) | 6 | 1 | — | 🟡 2-fach |

| Kasse/Abrechnung | 16 (ta*-Klon) | 7 (da*-Anbau) | 8 | 2 | 🔴 3-fach |

| Lohn/Payroll | (SFN-Logik) | 3 | 4 | — | 🟡 3-fach verteilt |

| Bestellwesen | 12 | — | — | 39 | 🟡 2-fach |

| Wein | 3 | — | — | 2 | 🟡 2-fach |

| Inventur | 4 | — | — | 1 | 🟢 |

| Auth/Token | — | (QR-Token) | 4 | 4 | 🔴 4 Systeme |

| Messaging/Notifs | — | 8 | (Telegram) | (E-Mail) | 🟡 |

Fett = inhaltlich reifste Implementierung (= „Quelle der Wahrheit" für den Neubau, siehe §5).

Die konkreten Duplikations-Beweise

1. `ta_sessions`, `ta_waiter_shifts`, `ta_kitchen_shifts`, `ta_expenses`, `ta_advances`, `ta_cash_settings` … (bunker) ≙ `sessions`, `waiter_shifts`, `kitchen_shifts`, `expenses`, `advances` … (tagesabrechnung) — dasselbe Fachmodell, zweimal gepflegt.

2. `staff` (tagesabrechnung) ↔ `employees` (thaitime) — verbunden über die Edge Function `sync-thaitime-staff`; Änderungen müssen synchronisiert werden statt einmal zu existieren.

3. `zt_shifts` (tagesabrechnung) ← `syncWaiterToZt` (Frontend-Sync nach jedem Cash-Up) — Zeiterfassung wird aus der Kasse in eine zweite Wahrheit kopiert.

4. Vier Token-/Auth-Systeme: QR-Badge-Tokens (thaitime), PIN+WebAuthn+Login-Confirmations (tagesabrechnung), Magic Links + Portal-Tokens (bestellung), Wein-Katalog-Tokens (bunker) — alle lösen dasselbe Problem („Zugang ohne klassisches Login") mit eigener Infrastruktur.

---

4. Ziel-Architektur

4.1 Mandantenmodell (Vorlage: bestellung)

Die App ist von Tag 1 mandantenfähig — auch wenn anfangs nur ein Betrieb darauf läuft. Das kostet beim Neubau fast nichts und erspart den schmerzhaftesten aller Nachrüstungen.

```

organizations (Mandant, z. B. die Betreibergesellschaft)

  └── locations (Betriebsstätte/Restaurant — vereinheitlicht

      bunker.restaurants, thaitime.branches, bestellung.locations)

```

Jede fachliche Tabelle trägt `organization_id` (RLS-Anker) und, wo sinnvoll, `location_id`.

4.2 Identitätskern (Vorlage: tagesabrechnung-Remix + thaitime-HR)

Eine Person = eine Zeile. Das zentrale Versäumnis der Bestandslandschaft wird zur zentralen Designentscheidung:

```

staff                      -- EINE Mitarbeiterwahrheit (Stammdaten aus thaitime.employees,

                           --   Schlankheit aus tagesabrechnung.staff)

staff_locations            -- Zuordnung zu Betriebsstätten (n:m)

staff_compensation         -- Lohn/Gehalt SEPARAT (Lektion aus bunker-Audit:

                           --   Gehaltsdaten nie in der allgemein lesbaren Stammtabelle)

user_links                 -- staff_id ↔ auth.users (Schatten-User-Muster aus dem Remix)

roles / role_assignments   -- EIN Rollenmodell: admin > manager > staff (+ Modul-Scopes)

access_tokens              -- EIN Token-System für alle „Zugang ohne Login"-Fälle:

                           --   token_type ∈ {badge_login, onboarding, portal_supplier,

                           --   portal_customer, public_catalog, calendar_feed, ...},

                           --   einheitlich: zufällig, ablaufend, widerrufbar (used_at),

                           --   Validierung NUR über Edge Functions / SECURITY DEFINER

```

Auth-Flüsse (alle erzeugen echte Supabase-Sessions):

1. E-Mail/Passwort & OAuth → Standard Supabase Auth (Admins, Büro)

2. PIN am Terminal → `validate-pin` erzeugt Magic-Link-Hash → `verifyOtp` → Session (Remix-Muster, produktionsbewiesen)

3. QR-Badge → `access_tokens(badge_login)` → gleicher Session-Mechanismus

4. Externe Portale (Lieferant/Kunde/Lohnbüro) → tokenbasiert über Edge Functions, KEINE direkten Tabellenzugriffe (bestellung-Muster)

4.3 Querschnittsdienste (einmal bauen, überall nutzen)

| Dienst | Quelle des Musters | Inhalt |

|---|---|---|

| `current_business_date()` | tagesabrechnung-Remix | Geschäftstag mit 3-Uhr-Cutoff Europe/Berlin — EINE Definition für Kasse, Zeiterfassung, Sperren |

| Sperr-Framework | tagesabrechnung-Remix E4 | `is_locked(entity)`-Prädikate: abgeschlossene Geschäftstage unveränderbar außer Manager+/Admin |

| RLS-Helper | Remix E3 | `current_staff_id()`, `has_min_permission()`, `is_admin()` — SECURITY DEFINER, search_path, Grants |

| `audit_log` | tagesabrechnung | Append-only (INSERT authenticated, kein UPDATE/DELETE), zentral statt 3 Varianten |

| `app_settings` | alle | Ein Settings-Modell mit Scope (organization / location / module) statt 8 Settings-Tabellen |

| Benachrichtigungen | thaitime + bestellung | Ein Dispatcher: in-App, Push, Telegram, E-Mail als Kanäle EINES Systems |

| i18n | thaitime | DE/EN/TH von Tag 1 im Kern |

---

5. Modulschnitt und „Quelle der Wahrheit"

Jedes Modul wird beim Neubau aus GENAU EINER Bestands-App fachlich abgeleitet (dort ist das Modell am reifsten); Funktionen der anderen Apps fließen als Anforderungen ein, nicht als Schema.

| # | Modul | Quelle der Wahrheit | Übernimmt zusätzlich aus |

|---|---|---|---|

| M0 | Kern: Organizations, Staff, Auth, Rollen, Tokens, Querschnitt | bestellung (Mandant/RLS) + Remix (Auth/Sperren) + thaitime (Staff-Tiefe) | — |

| M1 | Zeiterfassung | tagesabrechnung `zt_shifts` (+ Remix-Policies) | bunker-Stechuhr-UI (LiveClock, optimistische Updates) |

| M2 | Tagesabrechnung/Kasse | tagesabrechnung (sessions-Modell) | bunker ta*-Varianten (SFN-Integration), thaitime da*-Telegram-Report |

| M3 | Dienstplan | thaitime (schedule + KI-Foto-Import + Self-Service-Wünsche/Tausch) | bunker Roster-Grid (Virtualisierung, Paint-Tool) |

_Ersetzt durch Nachtrag M3 (siehe unten): Quelle ist bunker-shift-flow (shifts + RosterGrid + billing-cycle 26.–25.). thaitime-Features sind ausgeschlossen._

| M4 | Lohn/HR | thaitime (Nettolohn, Dokumente, Onboarding, Payslips) | tagesabrechnung Lohnbüro-Portal, bunker SFN-Berechnung (getestet!) |

| M5 | Bestellwesen | bestellung (komplett: B2B, Portale, KI-Import, Voice) | bunker Lieferanten/Katalog als Anforderungs-Checkliste |

| M6 | Wein & Gäste-Features | bunker (Karte, Quiz, öffentl. Katalog) | bestellung Wein-Tabellen |

| M7 | Inventur | bunker | bestellung products |

| M8 | Kommunikation | thaitime (Messaging, Telegram) | als Querschnitt in M0 vorbereitet |

Explizit NICHT portieren: die Sync-Brücken (`sync-thaitime-staff`, `syncWaiterToZt`, ta*/da*-Klone) — sie sind das Problem, nicht die Lösung. Ebenso die vier getrennten Token-Systeme.

---

6. Bauplan und Migrationsstrategie

Prinzip: Strangler Fig. Die Alt-Apps laufen weiter und sterben modulweise. Nach jedem Modul: Datenumzug aus der jeweiligen Quell-App, Personal-Umstellung, Alt-Modul einfrieren (read-only), erst nach Bewährung abschalten. Kein Big-Bang-Cutover.

| Phase | Inhalt | Daten-Umzug aus | Erfolgs-Gate |

|---|---|---|---|

| B0 | Repo-Setup: Vite+React+TS(strict)+Supabase, CI mit Tests, dieses Dokument als docs/ | — | CI grün, RLS-Helper getestet |

| B1 | M0 Kern | staff: thaitime.employees ⊕ tagesabr.staff (Dublettenabgleich über Namen/IDs!) | Jeder Mitarbeiter genau 1×; PIN-, OAuth-, Badge-Login funktionieren |

| B2 | M1 Zeiterfassung | zt_shifts (tagesabr.) + zt_shifts (bunker) | Parallelbetrieb 2 Wochen: neue App stempelt, Alt-Sync stillgelegt |

| B3 | M2 Kasse | sessions-Historie (tagesabr.; ta\_-Daten aus bunker nur falls abweichend) | 1 Monat Abschlüsse fehlerfrei; Lohnbüro-Export identisch zu Alt |

| B4 | M3 Dienstplan | thaitime schedule + Templates | Eine volle Planungswoche produktiv |

_Ersetzt durch Nachtrag M3/B4 (siehe unten): Quelle bunker-shift-flow; Erfolgs-Gate ist ein voller Planungszyklus (26.–25.) produktiv._

| B5 | M4 Lohn/HR | thaitime (Dokumente, Payslips, Onboarding-Historie) | Nettolohn-Tests grün GEGEN BMF-Referenzfälle; ein Lohnlauf parallel verifiziert |

| B6 | M5 Bestellwesen | bestellung (größter Datenumzug: Artikel, Lieferanten, Bestellhistorie, Portale) | Lieferanten-Portale umgestellt, alte Magic Links deaktiviert |

| B7 | M6–M8 + Abschaltung | Rest | Alle vier Alt-Apps read-only archiviert |

Reihenfolge-Begründung: M1+M2 zuerst, weil dort der Sync-Schmerz lebt und der tägliche Nutzen am größten ist; M4 (Lohn) erst NACH M1+M2, weil Lohn auf deren Daten rechnet; M5 zuletzt unter den großen, weil bestellung als einzige App solide alleine weiterlaufen kann.

Nachtrag (B1c, eingefügt nach B1b, vor B2): Stammdaten-/Personal-UI + PIN-/Badge-Verwaltung. Begründung: B1a/B1b haben Schema und Auth-Flüsse geliefert, aber neue Mitarbeiter, PINs und Badge-Tokens lassen sich nur per SQL anlegen. Ein Admin-UI dafür ist Voraussetzung, damit B2 (Zeiterfassung) überhaupt mit echten Personen getestet werden kann. B1c trifft KEINE Vorfestlegung zu R4 (PWA vs. Capacitor) — es ist ein reines Verwaltungs-UI für Admin/Manager, kein Terminal- oder Mobile-Flow. O3 (Voice/Telegram) bleibt offen bis B2.

B1c-Scope (freigegeben):

- Datenmodell: nur eine neue Tabelle `audit_log` (append-only, organization_id/actor/action/entity/entity_id/meta). GRANT ausschließlich `service_role`; RLS aktiv, **keine** Policy für `anon`/`authenticated` (DENY-ALL für Clients). Schreiben ausschließlich serverseitig via `supabaseAdmin`. Kein UPDATE/DELETE-Pfad im Code.

- Server-Functions: alle `createServerFn` + `requireSupabaseAuth` + **expliziter Rollencheck im Handler** (`assertMinRole`), bevor geschrieben wird. Org-Scope via `current_organization_id()` aus dem Aufruferkontext. Jede schreibende Function schreibt nach Erfolg einen `audit_log`-Eintrag.

- Geschäftsregeln (hart, serverseitig): „≥1 aktiver Admin pro Organisation" (reine Funktion, geprüft VOR dem Schreiben). Inaktive Mitarbeiter dürfen sich nicht einloggen. PIN: 4–8 Ziffern. Badge-Token: 32 Byte CSPRNG, base64url, Klartext nur direkt nach Erstellung — danach nur Metadaten. Standort-Löschung nur, wenn keine `staff_locations`-Verknüpfung mehr existiert.

- Kein Org-UI: Organisationen werden per dokumentiertem Seed-Snippet angelegt. Datei: `docs/seed-organization.sql` (Org + erster Standort + Admin-User-Link für eine bestehende `auth.users`-Zeile).

- Erfolgs-Gate B1c:

- `tsc --noEmit`, `eslint . --max-warnings=0`, `vitest run` grün.

- RLS-Inventur (`scripts/check-rls-inventory.sql`): weiterhin 0 anon-Policies, 0 bedingungslose Schreib-Policies; `audit_log` hat 0 Client-Policies.

- Negativtest (a): „letzten aktiven Admin deaktivieren → serverseitig abgelehnt" (Unit-Test der reinen Regel `wouldRemoveLastActiveAdmin`).

- Negativtest (b): „Server-Function-Aufruf als Nicht-Admin → abgelehnt, kein `audit_log`-Eintrag" (Unit-Test der Wrapper-Funktion `runAsAdmin`: bei unzureichender Rolle wird der injizierte `writeAudit`-Mock nie aufgerufen).

- Manueller End-to-End-Klick: Mitarbeiter anlegen → PIN setzen → PIN-Login → Badge ausstellen → Badge-Login → Badge widerrufen → Badge-Login schlägt fehl → `audit_log` enthält die 4 Schreibaktionen.

---

Nachtrag R4 (entschieden vor B2b, dokumentiert nach Abnahme B1c): **PWA-Manifest-only** für M1-Mobile-Stempeln. Keine `vite-plugin-pwa`, kein Service-Worker, keine Offline-Queue. Begründung: Stempeln ist ein synchroner Online-Akt; Identifikation läuft über bestehende PIN-/Badge-Flows; Kamera/Geolocation sind im Web verfügbar. Mitarbeiter-Handys benötigen kein NFC (Badge-Lesung läuft am Terminal). App-Store-Präsenz ist nicht gefordert.

Geltungsbereich: R4 betrifft ausschließlich den UI-Lieferschritt **B2b** (Mobile-Stempel-UI). **B2a** (Schema, Geschäftstag-/Stempel-Logik, Server-Functions, RLS, Tests) ist davon unabhängig und wird ohne PWA-Bezug gebaut.

Umschwenk-Schwellen (erst dann wird Capacitor / Offline-Queue neu bewertet, nicht früher):

1. Stempeln per Handy-NFC wird zur Pflichtanforderung (nicht „nett zu haben").

2. App-Store-Präsenz wird vom Betrieb gefordert (Marketing, Onboarding, Vertrauen).

3. Hintergrund-Push auf iOS wird hartes Muss und Web-Push via installierter PWA reicht nicht.

Eine belegte Offline-Stempelpflicht (mehrfach reproduzierter Netzausfall am Stempelort) öffnet einen **eigenen** Scope „Offline-Queue für M1", nicht eine stille Erweiterung von B2b.

---

Nachtrag B2-Schnitt (vor Bau B2a freigegeben):

**B2a — Stempelkern (dieser Schritt):** Tabelle `time_entries` (Felder: `organization_id`, `staff_id`, `location_id` nullable, `started_at`, `ended_at`, `business_date`, `source ∈ {clock, manual}`); Geschäftstag aus `started_at` via `businessDateOf()`/`current_business_date()` (3-Uhr-Cutoff, Europe/Berlin); partieller Unique-Index `(staff_id) WHERE ended_at IS NULL`; RLS: SELECT nur eigene Einträge, **keine** Client-Schreib-Policy (DENY-ALL, keine Trigger-Doppelung); Server-Functions `clockIn`/`clockOut`/`getMyOpenEntry`/`listMyEntries` mit reinen Regel-Modulen (`canClockIn`/`canClockOut`); `clockIn()` schreibt `source='clock'`, `'manual'` ist für B2b-Manager-Korrekturen reserviert; `location_id` wird automatisch aus der Standort-Zuordnung gesetzt, **wenn genau eine** existiert, sonst `NULL`.

**Ersetzt E1 (Eintragsmodell):** Das Schema erlaubt bewusst mehrere abgeschlossene `time_entries` pro Mitarbeiter und Geschäftstag (nicht: nur ein Eintrag pro Tag). Betriebspraxis bleibt 1× ein-/ausstempeln pro Tag — die Mehrfach-Möglichkeit existiert für spätere Manager-Korrekturen (`source='manual'`) und geteilte Schichten. Tagesaggregation passiert NICHT auf Schemaebene, sondern bei der SFN-Berechnung (siehe B2-SFN unten). Offen ist Behandlung der gesetzlichen Pause (ArbZG, ≥6h → 30 min, ≥9h → 45 min) innerhalb des Tageseintrags — Entscheidung in B2-SFN oder B2b.

**B2-SFN — SFN-Berechnung + Golden-Master (neuer eigener Schritt, vor B2c):** Reines TS-Modul, das aus den `time_entries` eines Tages SFN-Zuschläge berechnet. Zwei Testquellen, beide blockierend:

1.  **Primärreferenz (Golden Master):** `calculateShiftHours` aus `tagesabrechnung/src/lib/shiftCalculations.ts` — die produktiv bewährte §3b-EStG-Logik (identisch im Remix-Stand). Charakterisierungstest gegen jeden Referenzfall der Originalsuite; bitgenaue Reproduktion ist Abnahmekriterium.

2.  **Zweite Testquelle:** `computeSfn`-Testfälle aus `bunker-shift-flow/.../sfn.test.ts` als unabhängige Gegenprobe.

**Dies ist explizit nicht M4** — es ist die getestete Zuschlags-Logik auf Stempel-Basis, auf der M4 (Nettolohn) später aufsetzt.

**Umsetzung (abgenommen, Stand 13.06.2026):**

- Modul-Layout `src/lib/time/sfn/` mit Zwei-Adapter-Architektur:

- `sfn-core.ts` — reine Helfer (parseTime, overlap, round2).

- `tagesabrechnung.ts` — Adapter zur Primärreferenz. Bitgenaue Reproduktion der 20 Fixture-Fälle aus `golden-master/calculateShiftHours.json`. Rundet (wie das Original) am Ende auf 2 Nachkommastellen — daher `toEqual` mit Toleranz 0 statt `toBeCloseTo`.

- `bunker.ts` — Portierung von `computeSfn`. 13 Tests (nicht 14 wie im Briefing genannt — siehe Original-Datei).

- `golden-master.test.ts`, `bunker.test.ts` — beide Testquellen, beide blockierend.

- **Pro EINZELNEM `time_entry`** wird gerechnet. Tages-/Wochensummen entstehen in B2c durch Summieren der Topf-Werte über die Einträge eines `business_date`. **Keine virtuelle Verschmelzung von Einträgen** auf SFN-Ebene.

- **Welches Output-Schema die App produktiv persistiert** (GM-Felder, bunker-Felder oder ein normalisiertes Drittes), entscheidet B2c/M4. B2-SFN liefert beide Adapter parallel.

- **Pause** ist Input des bunker-Adapters (proportionale Proration), keine ArbZG-Automatik in B2-SFN.

- **Quirks** des Originals werden als Charakterisierung reproduziert, nicht korrigiert: (a) `01:00–05:00` ohne Mitternachts-Wrap liefert 0 Nachtstunden, (b) `00:00–08:00` ebenso. Briefing nannte 3 Quirks; Fixture enthält 2.

**Bewusst NICHT in B2-SFN, vertagt nach M4** (Quelle: `tagesabrechnung-sfnRates.ts`, vom Nutzer zitiert — Datei steht in M4 zur Verifikation gegen das Original an):

- `night40` (00–04) als Geld-Zuschlagssatz,

- `holiday150` für 1. Mai, 25.12., 26.12.,

- 50-€-Grundlohngrenze nach §3b EStG.

  Diese Werte gehören in den Geld-Pfad (M4), nicht in die Stunden-Töpfe.

**Gestrichen (Spekulation, nicht im Originalcode):** „24.12. ab 14:00 als Special-Holiday".

**Erfolgs-Gate B2-SFN (erfüllt):** `tsc --noEmit`, `eslint`, `vitest run` grün; beide Test-Suiten blockierend; RLS-Inventur unverändert; DB-Integrationstests in CI unverändert grün.

**B2b — Korrekturen & Mobile-UI (umgesetzt):**

- **PWA-Manifest-only (R4):** `public/manifest.webmanifest` mit `name="COCO"`, `short_name="COCO"`, `start_url="/zeit"`, `display="standalone"`, COCO-Icons unter `public/icons/`. Head-Tags in `__root.tsx`. **Kein Service-Worker, keine Offline-Queue.** Caveat: `start_url` ist nach Installation eingefroren.

- **Pause (Option B — manuelle Eingabe mit ArbZG-Default):** Neue Spalte `time_entries.break_minutes int not null default 0 check (>=0 and <480)`. Beim Ausstempeln Pflicht-Dialog mit Default = `arbzgMinimumBreak(grossMin)` (>6h → 30, >9h → 45). Mitarbeiter kann übersteuern; UI warnt bei Unterschreitung. `audit_log.meta` enthält `breakMinutes`, `grossMinutes`, `arbzgRecommended`, `arbzgShort: boolean` — Compliance-Belegbarkeit für BAG-Anfragen. Reines Modul: `src/lib/time/break-rules.ts` + Tests.

- **Wasserlinie (G2-Sperrlogik):** Neue Tabelle `organization_settings(organization_id PK, time_locked_through_date date)`. Trigger legt für jede neue Org automatisch eine Zeile an. Semantik: `business_date ≤ time_locked_through_date` ist für **alle Rollen** gesperrt — auch Manager. Verschieben der Wasserlinie ist **admin-only** via `setTimeLock` mit Audit-Eintrag `settings.time_lock_moved`, `meta: { before, after }`.

- **Manager-Korrektur-Server-Functions** (`src/lib/time/time-admin.functions.ts`, alle via `runGuarded` + audit nur bei Erfolg):

- `listEntriesForCorrection` (manager+, lesen)

- `createManualEntry` (manager+, `source='manual'`, audit `time_entry.manual_create`)

- `updateTimeEntry` (manager+, **`source` bleibt erhalten** — kein stilles Umflaggen von `clock` auf `manual`; audit `time_entry.manual_update` mit `before`/`after`-Diff)

- `deleteTimeEntry` (manager+, audit `time_entry.manual_delete` mit **vollständigem Zeilen-Snapshot in `meta.snapshot`** — Gate (e): gelöschte Arbeitszeiten bleiben aus dem append-only-Log rekonstruierbar)

- `setTimeLock` (admin-only, audit `settings.time_lock_moved`)

- **Manager-UI:** `/admin/zeit` (Route gegated über `/admin`-Layout: manager+). Zeitraum-Filter, Tabelle mit Sperrindikator pro Zeile, Neu/Bearbeiten/Löschen-Dialoge mit Pflicht-Begründung (≥3 Zeichen, in `audit_log.meta.reason`). Admin-Block zum Verschieben der Wasserlinie nur sichtbar für Admins (UX-Gate; Sicherheit serverseitig).

> **Nachtrag 16.06.2026 — B2b-Korrektur-UI bewusst entfernt.** Die Manager-Korrektur-UI `/admin/zeit` und ihre Server-Functions (`listEntriesForCorrection`, `getTimeLockSettings`, `createManualEntry`, `updateTimeEntry`, `deleteTimeEntry`, `setTimeLock`) wurden entfernt (Frank-Entscheidung). Das Schema bleibt: `time_entries.source='manual'`, `organization_settings.time_locked_through_date` und `assertBusinessDateUnlocked` bestehen weiter (letzteres genutzt von `setTimeEntryShift`/`createTimeEntryShift`). Korrektur einzelner Einträge aktuell nur per SQL; eine Korrektur-UI ließe sich später wieder andocken. **Kein Einfluss** auf die Zeit-Migration aus tagesabrechnung — die läuft über das getrennte `migration/`-Subsystem (B2c, `source='import'`, setzt die Wasserlinie inline, unabhängig von den entfernten Functions).

- **Erfolgs-Gate B2b:**

- `tsc --noEmit`, `eslint --max-warnings=0`, `vitest run` grün

- DB-Integrationstests (blockierend): (a) Migration legt eine `organization_settings`-Zeile pro Org an (Trigger), (d) `assertBusinessDateUnlocked` wirft `TimeLockedError`, wenn `business_date ≤ time_locked_through_date` — server-seitige Sperre vor dem ersten DB-Schreibvorgang, **kein `audit_log`-Eintrag bei Verweigerung**.

- Unit-Tests: `arbzgMinimumBreak` (Schwellen 6h/9h), `isArbzgShort`, `isLocked`.

- RLS-Inventur unverändert sauber. Neue Tabelle `organization_settings`: SELECT für eigene Org, INSERT/UPDATE nur Admin.

- Manueller E2E (durch Nutzer): Manager-Korrektur → Audit-Query zeigt `manual_update` mit `before/after`-Diff und Reason; Löschung → `manual_delete` enthält vollständigen Snapshot in `meta.snapshot`; Versuch auf gesperrtem Tag → Fehlermeldung, kein Audit-Eintrag.

**B2c — Migration & Parallelbetrieb:** `zt_shifts`-Importer aus tagesabrechnung + bunker, 2-Wochen-Parallelbetrieb mit Abgleichsbericht, Alt-Sync stilllegen.

Erfolgs-Gate B2a:

- `tsc --noEmit`, `eslint . --max-warnings=0`, `vitest run` grün.

- RLS-Inventur (`scripts/check-rls-inventory.sql`): weiterhin 0 anon-Policies, 0 bedingungslose Schreib-Policies; `time_entries` hat **0 Client-Schreib-Policies** (nur die SELECT-Policy für eigene Einträge).

- Unit-Tests für `canClockIn`/`canClockOut` (aktiv/inaktiv, kein/ein offener Eintrag, end vor start).

- **Automatisierte DB-Integrationstests** (blockierend, Teil von `vitest run`): (a) direkter INSERT in `time_entries` als `authenticated`-Rolle wird von RLS abgelehnt; (b) zweiter offener Eintrag pro Mitarbeiter wird vom partiellen Unique-Index abgelehnt; (c) Lesezugriff auf fremde Einträge liefert 0 Zeilen.

- **`role-guard.db.test.ts`** (blockierend, Nachholung aus B1c-Merkposten): Integrationstest, der die Verdrahtung der Guard-Regeln gegen die echte DB prüft — Last-Admin-Schutz und Nicht-Admin-Ablehnung (kein `audit_log`-Eintrag bei abgelehntem Aufruf).

- **DB-Integrationstests grün in CI** (blockierend): GitHub-Actions-Job `db-integration` hebt via Supabase CLI (`supabase start`) einen lokalen Stack mit allen Migrationen hoch und führt dort die `*.db.test.ts`-Suiten aus (anon-/authenticated-Client für RLS-Prüfungen, service-role-Client für Setup/Cleanup). **Keine Tests gegen die Produktiv-DB.** Lokal/in Lovable werden die DB-Tests via `SUPABASE_DB_TESTS`-Env-Flag sauber geskippt, statt rot zu sein.

- E2E-Klickpfad mit zwei realen B1c-Personen: einstempeln → Liste enthält offenen Eintrag → ausstempeln → Eintrag geschlossen, Dauer korrekt. **`audit_log`-Prüfung:** danach existieren **genau zwei** Einträge — `action='time_entry.clock_in'` und `action='time_entry.clock_out'` — beide mit `entity='time_entry'` und korrekter `entity_id` (= ID des `time_entries`-Eintrags).

- Negativ: inaktiver Mitarbeiter (per B1c-Admin deaktiviert) bekommt beim Einstempeln die deutsche Fehlermeldung; zweites Einstempeln ohne vorheriges Ausstempeln wird abgelehnt; in beiden Fällen wird **kein** `audit_log`-Eintrag geschrieben.

---

Nachtrag M3/B4 (Quellenwechsel, ersetzt M3-Zeile in §4/§5 und präzisiert B4 in §6):

- **Quelle:** `bunker-shift-flow` — nicht `thaitime`. `thaitime` ist als M3-Quelle gestrichen.

- **Datenmodell `shifts`:** Mitarbeiter + Datum + Arbeitsbereich + Skill + Status (`geplant`/`bestätigt`) + Notiz. **Keine Uhrzeiten im Plan.** Der Plan beantwortet „wer, wann, wo"; Ist-Zeiten kommen aus M1 (Stechuhr).

- **UI-Vorlage:** bunker `RosterGrid` mit verbindlich zu erhaltenden Eigenschaften:

- (a) Paint-Tool mit Pinsel je Skill und Radierer, Klick-Malen in Zellen; Sperr-Zeiträume blockieren das Malen.

- (b) Drag & Drop der Schicht-Pills mit optimistischen Updates und Rollback bei Fehler.

- (c) Konflikt-Markierung auf der Pill (Abwesenheit, fehlender Skill).

- (d) Virtualisierte Zeilen, Gruppierung nach Arbeitsbereich, Dichte-Umschaltung, Summenspalte.

- (e) Status-Workflow `geplant → bestätigt` mit Bestätigungs-Popover.

- (f) **Planungseinheit ist der Abrechnungszyklus 26.–25. des Monats** (bunker `billing-cycle.ts`), mit Zyklus-Navigation und Zyklus-Sperren — **nicht die Kalenderwoche**.

- **Explizit ausgeschlossen** (thaitime-Features, allenfalls spätere Anbauten): KI-Foto-Import, Schichtvorlagen, Besetzungsanforderungen, Freigabe-Workflow, Schichtwünsche/Tausch.

- **Konsequenz für M1:** `time_entries.source='plan'`-Einträge erhalten aus dem Plan nur Datum/Mitarbeiter/Bereich — **keine Sollzeiten**.

- **Konsequenz für M4 (Lohn):** Abrechnungszyklus 26.–25. wird als **organisationsweite Einstellung** geführt; Plan, Zeiterfassungs-Auswertung und Lohn nutzen denselben Zyklus.

- **B4-Erfolgskriterium (ersetzt „eine volle Planungswoche"):** ein voller Planungszyklus (26.–25.) produktiv.

---

7. Verbindliche Standards (die Audit-Lektionen als Gesetz)

1. TypeScript: `strict: true` ab Commit 1. Keine `any` außerhalb generierter UI-Libs. `Tables<>`-Typen für alle DB-Zeilen.

1. RLS: Jede Tabelle `organization_id` + Policy ab Erstellung. Keine `USING (true)` außer dokumentiert (Inventur-Query als CI-Check!). Drops vor Creates (ODER-Falle). Helper statt Inline-Logik.

1. Geld & Zeit: Jede Berechnung (SFN, Nettolohn, Trinkgeld-Split, Geschäftstag) ist ein reines, getestetes Modul. Charakterisierungstests + Referenzfälle (BMF-Rechner) VOR der ersten Produktivnutzung.

1. Integrität: Geschäftstag-Sperren auf allen Geld-/Zeit-Tabellen ab Tag 1. Audit-Log append-only.

1. Tokens: Zufällig (32 Byte), ablaufend, widerrufbar, Validierung nur serverseitig, niemals in Logs/Konsole (Lektion bestellung).

1. Secrets & Daten: Keine Personaldaten, CSVs oder Dokumente im Repo (Lektion thaitime). `.env` in `.gitignore` ab Commit 1.

1. Ehrlichkeitsregel für KI-Arbeit: Migrations-/Commit-Kommentare beschreiben nur, was tatsächlich enthalten ist. Konflikte zwischen Vorgabe und Code-Realität werden gemeldet, nicht still „gelöst" (Lektion Remix E4b — diese Regel hat zwei App-Brüche verhindert).

1. Review-Loop: Jedes Modul wird vor Produktivgang von einer unabhängigen Instanz geprüft (Chat-Review wie etabliert): tsc, Tests, Policy-Inventur, Diff-Analyse.

---

8. Risiken und offene Entscheidungen

| # | Punkt | Empfehlung |

|---|---|---|

| R1 | Dubletten beim Staff-Merge (gleiche Person, 4 Schreibweisen) | B1 enthält einen manuellen Abgleich-Schritt mit Review-UI; nicht automatisch mergen |

| R2 | Parallelpflege während des Baus (Alt-Apps entwickeln sich weiter) | Feature-Freeze je Alt-Modul ab Start des entsprechenden Neubau-Moduls |

| R3 | Lohn-Korrektheit (Nettolohn war nie getestet) | B5-Gate: ein kompletter Lohnlauf parallel alt/neu mit Abgleich, bevor Alt abgeschaltet wird |

| R4 | Capacitor/Mobile (nur thaitime hat native Apps) | **Entschieden vor B2b: PWA-Manifest-only** (siehe Nachtrag R4 unten). Re-Evaluierung nur bei den dort genannten Umschwenk-Schwellen. |

| R5 | Umfang ehrlich halten | Nicht jede Funktion der Alt-Apps verdient den Umzug (z. B. Entwickler-Checklisten, ComponentPlayground). Pro Modul: bewusste „nehmen wir NICHT mit"-Liste |

| R6 | tagesabrechnung-Produktiv-Rollout (P0–P4) | Unabhängig davon ABSCHLIESSEN — die echten Kassendaten sind bis dahin offen; die vereinte App ist Monate entfernt |

| O1 | Name & Branding der vereinten App | **Entschieden (16.06.2026): „Central Ops"** (BrandLockup über alle Seiten) |

| O2 | Hosting-Strategie (ein Supabase-Projekt; Region; Backup-Plan) | vor B0 entscheiden |

| O3 | ElevenLabs/Voice & Telegram: welche Integrationen in v1? | vor B2 bzw. B4 entscheiden |

---

Anhang A: Vollständige Tabellen-Inventur

bunker-shift-flow (52 Tabellen): `absences`, `bank_deposits`, `card_transactions`, `cash_balance_settings`, `daily_reports`, `daily_sessions`, `employee_skills`, `inventory_count_items`, `inventory_counts`, `inventory_movements`, `kitchen_tip_shifts`, `locked_periods`, `order_articles`, `order_categories`, `order_draft_items`, `order_drafts`, `order_items`, `order_price_history`, `order_suppliers`, `order_units`, `orders`, `products`, `profiles`, `restaurant_labels`, `restaurant_settings`, `restaurants`, `session_expenses`, `shifts`, `skills`, `staff_advances`, `staff_profiles`, `staff_restaurants`, `suppliers`, `ta_advances`, `ta_cash_settings`, `ta_expenses`, `ta_kitchen_shifts`, `ta_labels`, `ta_sessions`, `ta_waiter_shift_audit`, `ta_waiter_shifts`, `user_roles`, `waiter_cashup_audit`, `waiter_cashups`, `wine_articles`, `wine_catalog_tokens`, `wine_details`, `wine_quiz_questions`, `wine_quiz_scores`, `zt_holidays`, `zt_sfn_settings`, `zt_shifts`

thaitime (72 Tabellen): `absence_entries`, `active_clock_ins`, `app_settings`, `arbeitsvertrag_text_blocks`, `audit_logs`, `auto_checkout_settings`, `availability_entries`, `billing_period_locks`, `branches`, `company_settings`, `conversation_members`, `conversations`, `da_advances`, `da_audit_logs`, `da_bank_deposits`, `da_card_transactions`, `da_expenses`, `da_kitchen_shifts`, `da_sessions`, `da_settings`, `da_telegram_settings`, `da_waiter_shifts`, `developer_checklist_settings`, `display_settings`, `document_signatures`, `document_templates`, `document_types`, `edge_function_registry`, `email_settings`, `employee_access_tokens`, `employee_advances`, `employee_branches`, `employee_calendar_tokens`, `employee_documents`, `employee_roles`, `employee_schedule_wishes`, `employee_skills`, `employee_wage_history`, `employees`, `generated_documents`, `hr_document_templates`, `hygiene_trainings`, `job_task_templates`, `leave_requests`, `messages`, `messaging_group_access`, `messaging_permissions`, `messaging_restrictions`, `notification_preferences`, `onboarding_invitations`, `onboarding_submissions`, `payroll_notes`, `payslips`, `push_subscriptions`, `role_permissions`, `schedule_button_settings`, `schedule_entries`, `schedule_group_requirements`, `schedule_releases`, `schedule_requirements`, `scheduler_permissions`, `shift_swap_requests`, `shift_templates`, `skills`, `system_feature_priorities`, `time_entries`, `user_activity_logs`, `user_permission_overrides`, `user_roles`, `warnings`, `work_areas`, `zeugnis_text_blocks`

tagesabrechnung (Remix-Stand) (31 Tabellen): `absences`, `advances`, `audit_logs`, `auth_attempts`, `bank_deposits`, `card_transactions`, `employee_skills`, `expenses`, `kitchen_shifts`, `login_confirmations`, `manager_nav_permissions`, `payroll_calculations`, `payroll_office_settings`, `profiles`, `register_transfers`, `restaurants`, `sessions`, `settings`, `shift_assignments`, `skills`, `sofortmeldung`, `sofortmeldung_log`, `staff`, `staff_pins`, `staff_restaurants`, `telegram_settings`, `user_roles`, `waiter_shifts`, `webauthn_challenges`, `webauthn_credentials`, `zt_sync_logs`

bestellung (68 Tabellen): `article_locations`, `article_price_history`, `articles`, `cart_draft_items`, `cart_drafts`, `categories`, `communication_logs`, `customer_article_prices`, `delivery_addresses`, `demo_account_rate_limits`, `edge_function_registry`, `email_templates`, `employee_article_favorites`, `employee_location_suppliers`, `employee_locations`, `employee_notifications`, `employee_order_items`, `employee_order_submissions`, `employee_sessions`, `employees`, `inventory_items`, `inventory_sessions`, `invoice_discrepancies`, `invoice_email_log`, `invoice_items`, `invoice_processing_status`, `invoices`, `locations`, `magic_link_rate_limits`, `notification_preferences`, `order_confirmation_tokens`, `order_items`, `orders`, `organizations`, `packaging_units`, `photo_capture_tokens`, `pin_verification_rate_limits`, `price_watch_alerts`, `price_watch_results`, `price_watch_settings`, `profiles`, `simple_order_rate_limits`, `simple_order_token_suppliers`, `simple_order_tokens`, `suggested_articles`, `supplier_article_changes`, `supplier_b`, `supplier_locations`, `supplier_order_views`, `supplier_own_articles`, `supplier_own_inventory_items`, `supplier_own_inventory_sessions`, `supplier_own_purchase_order_items`, `supplier_own_purchase_orders`, `supplier_own_vendors`, `supplier_portal_drafts`, `supplier_portal_settings`, `supplier_portal_tokens`, `suppliers`, `system_feature_priorities`, `team_invitations`, `translation_overrides`, `units`, `user_delivery_preferences`, `user_roles`, `wine_catalog_tokens`, `wine_quiz_scores`, `wine_token_rate_limits`

Anhang B: Edge Functions pro App

bunker-shift-flow (3): `bootstrap-platform-admin`, `wine-catalog-public`, `wine-quiz-submit`

thaitime (34): `activate-employee-access`, `auto-checkout`, `birthday-notifications`, `calculate-nettolohn`, `calendar-feed`, `create-user`, `employee-upcoming-shifts`, `generate-schedule`, `get-user-role`, `get-users`, `hygiene-reminder`, `manage-user`, `notify-advance`, `notify-branch-activity`, `notify-onboarding-submission`, `notify-schedule-change`, `notify-schedulers`, `parse-schedule-image`, `process-payslip-pdf`, `process-shift-swap`, `query-fallback`, `reset-employee-password`, `resolve-employee-login-email`, `schedule-display`, `send-document-email`, `send-group-message`, `send-payslip-email`, `send-push-notification`, `send-telegram-summary`, `sync-employees`, `test-email`, `translate-message`, `upload-onboarding-photo`, `voice-time-entry`

tagesabrechnung (Remix-Stand) (27): `admin-link-account`, `backfill-staff-auth-users`, `calculate-payroll`, `create-login-confirmation`, `elevenlabs-stt`, `elevenlabs-tts`, `ensure-staff-auth-user`, `link-account`, `manage-nav-permissions`, `manage-user-role`, `manage-webauthn`, `notify-pdf-export`, `parse-payroll-pdf`, `payroll-office-auth`, `payroll-office-data`, `restaurant-chat`, `run-staff-backfill`, `send-telegram-summary`, `shared-zt-data`, `sync-thaitime-staff`, `update-pin`, `update-telegram-schedule`, `validate-pin`, `verify-login-confirmation`, `verify-session-pin`, `webauthn-authenticate`, `webauthn-register`

bestellung (66): `accept-b2b-customer-invitation`, `accept-invitation`, `ai-import-helper`, `check-invoice-emails`, `confirm-order`, `convert-demo-account`, `create-article-from-mobile`, `create-articles-batch`, `create-b2b-account-user`, `create-b2b-mobile-token`, `create-demo-account`, `create-photo-suggestion`, `create-supplier-portal-token`, `delete-demo-organization`, `delete-employee-draft`, `elevenlabs-conversation-token`, `elevenlabs-industry-token`, `elevenlabs-scribe-token`, `elevenlabs-tts`, `get-employee-drafts`, `get-order-details`, `hash-employee-pin`, `identify-article`, `import-wine-articles`, `import-wine-data`, `invite-sponsored-account`, `manage-b2b-mobile-inventory`, `manage-simple-order-favorites`, `notify-preorder-received`, `parse-invoice`, `populate-demo-data`, `request-new-magic-link`, `research-wine`, `reset-b2b-customer-password`, `scan-order-list`, `search-kroeswang-catalog`, `search-price-alternatives`, `search-wine-image`, `send-b2b-customer-invitation`, `send-b2b-customer-purchase-order`, `send-b2b-offer`, `send-b2b-purchase-order`, `send-invitation-email`, `send-order-email`, `send-price-alerts`, `send-supplier-magic-link`, `send-trial-reminders`, `submit-b2b-order`, `submit-simple-order`, `supplier-portal-articles`, `sync-wine-menu`, `test-email-connection`, `transcribe-inventory`, `transcribe-order`, `translate-wine-content`, `update-article-image`, `update-b2b-account-email`, `update-email-settings`, `update-employee-draft`, `upgrade-b2b-customer`, `verify-b2b-mobile-token`, `verify-employee-login`, `verify-employee-pin`, `verify-photo-capture-token`, `verify-simple-order-token`, `verify-supplier-token`

Nachtrag M3/D — Dienstplan (umgesetzt, 14.06.2026)

Quelle der Wahrheit: bunker-shift-flow (Roster-Grid, Paint-Tool) für das UI, thaitime (schedule_entries) für Datenmodell-Anforderungen und die Display-Vorlage. Der Dienstplan ist die VORAUSPLANUNG und bewusst getrennt von der Ist-Zeiterfassung (time_entries).

Designentscheidungen

D-1 (Eigene Tabelle, getrennt von time_entries): Dienstplan-Schichten liegen in roster_shifts — NICHT in time_entries. Plan (Soll) und Stempel (Ist) sind zwei Welten. roster_shifts hat KEINE Uhrzeiten (kein start/end_time): eine Schicht ist „an Tag X arbeitet Mitarbeiter Y im Bereich Z mit Skill S". Unique-Key (staff_id, location_id, shift_date, area). Status planned | confirmed. RLS: alle Org-Mitglieder lesen, nur service_role schreibt (über Server-Functions, manager+).

D-2 (Skills als Stammdaten): Genutzt werden die bestehenden Tabellen skills (name, category ∈ kitchen/service/gl/other, color) und staff_skills (Mitarbeiter ↔ Skill). Skills werden im Mitarbeiter-Stammblatt (SkillsTab) aktiviert und filtern die Skill-Auswahl im Dienstplan-Popover.

D-3 (Zwei Grid-Abschnitte, GL ist kein Bereich): Das Grid zeigt nur KÜCHE und SERVICE. „GL" (Geschäftsleitung) ist KEIN eigener Bereich, sondern ein Skill im Service. staff_locations.department='gl' wird im Grid dem Service-Abschnitt zugeordnet. Ein Mitarbeiter mit Bereichen kitchen UND service erscheint in BEIDEN Abschnitten (gewollt — gesteuert über staff_locations, das (staff_id, location_id, department) als Unique-Key hat).

D-4 (Service-Symbol-Darstellung): Im Service werden keine farbigen Skill-Pillen gezeigt, sondern kompakte Marker (nach thaitime-Display): SERVICE→„X", GL→„GL", BAR→„B", 19 Uhr→„19h", Hausmeister→„H", kein Skill→„X". Logik in src/lib/roster/service-marker.ts (getestet), damit das Display (D3) später dieselbe Funktion nutzt. KÜCHE behält farbige Skill-Pillen (CO/VS/PA/SP) mit Skill-Farbe.

D-5 (Realtime): roster_shifts ist in der supabase_realtime Publication (REPLICA IDENTITY FULL für DELETE-Events). Änderungen erscheinen live bei allen offenen Clients via postgres_changes.

D-6 (Cross-Booking-Warnung): getStaffCrossBookings lädt orgweit alle Schichten im Zeitraum. Hat ein Mitarbeiter an einem Tag IRGENDWO (anderer Bereich/Standort) eine Schicht, erscheint in seinen anderen LEEREN Zellen desselben Tages ein roter Punkt; Hover-Tooltip „Bereits: <Standort> · <Bereich> · <Skill>". Verhindert Doppelbelegung über Bereiche/Standorte.

D-7 (Periodensperre): Schreiboperationen prüfen assertShiftDateUnlocked gegen die periods-Tabelle (26.–25.-Rhythmus). Liegt das shift_date in einer locked-Periode → Fehler, keine Änderung.

D-8 (Eine Einteilung pro Mitarbeiter und Tag, 17.06.2026): Pro staff_id + shift_date ist maximal EINE roster_shifts-Zeile zulässig — standort- UND bereichsübergreifend, auch für GL/Management. Härtet D-6: aus der rein visuellen Cross-Booking-Warnung wird eine durchgesetzte Regel. Durchsetzung auf App-Ebene: Server-Pre-Check in createRosterShift (vor dem Upsert) + Zusatz-Check in moveRosterShift (irgendwo sonst am Tag, eigene id ausgeschlossen); UI sperrt die leeren Zellen eines bereits eingeteilten Mitarbeiters (gedimmt, cursor-not-allowed, Lock-Map aus crossBookings, Realtime-aktualisiert). BEWUSST KEIN DB-Unique-Constraint auf (organization_id, staff_id, shift_date): bestehende Altdaten dürfen Duplikate enthalten (Re-Import-Lektion) und ein hartes Constraint würde künftige Backfills brechen. Bestand: 3 Alt-Doppelbelegungen bleiben sichtbar/editierbar (ANDRE 01.05., MO 21./22.04. — je GL an zwei Standorten). Ersetzt die Annahme aus D-3, ein Mitarbeiter könne am selben Tag in kitchen UND service eingeteilt sein; das Grid-Layout aus D-3 (zwei Abschnitte, GL→service) bleibt unverändert.

Datenmigration (erledigt)

Re-Migration (17.06.2026, in zwei Korrekturschritten): Die erste Migration (4498 Zeilen) hatte fälschlich Verfügbarkeits-/Abwesenheits-Marker („nicht verfügbar"/Urlaub/krank aus thaitime availability_entries/absence_entries) als Schichten importiert. Korrektur: roster_shifts geleert und aus thaitime schedule_entries neu importiert = zunächst 3762 Zeilen; der 10:59-Export ließ jedoch 2 echte Gerard-Schichten (Spicery 08./09.04.) aus, die nachgesetzt wurden → Endstand 3764 (Spicery 1848, YUM 1905, TSB 11). WICHTIG (bestätigt 17.06.): thaitime legt „nicht verfügbar"-Tage NICHT in einer eigenen Tabelle ab, sondern ALS schedule_entries-Zeile mit `notes='\t='` (Tab + Gleichheitszeichen; verifiziert an WIT, Spicery, 27.01.2026). schedule_entries hat 4365 Zeilen, davon 601 solche Marker; nur die 3764 notiz-freien sind echte Schichten; die Lasse-Zeilen sind selbst Marker (existieren ohnehin nicht in COCO). Korrekter COCO-Stand = 3764. Beim Import daher zwingend nur Zeilen mit leerem notes nehmen — den Vollexport (4365) NIE importieren, sonst landen die Nicht-verfügbar-Tage wieder als Schicht (genau der ursprüngliche 4498-/4362-Fehler). 40 Mitarbeiter gemappt (Nickname in Klammern → display_name; Sonderfälle: „Sumitr (PAE)" → SUMITR, „Elson" ohne Nickname → display_name „Elson"; Lasse existiert nicht in COCO → ignoriert; Andre/Milk per Schreibweise korrigiert; Kosal/BIG inaktiv, dessen 3 Schichten bewusst enthalten). Standorte über feste location_id-UUIDs aufgelöst — locations.name „spicery" ist klein geschrieben, ein Name-Join scheiterte zunächst an allen Spicery-Zeilen; der UUID-Join ist casing-sicher. Skill-Mapping siehe arbeitsweise.md. Alle als confirmed. „19 Uhr", Service 3/4 hatten keine realen Einträge.

Bauschritte

D1 — Schema roster_shifts + Read-only-Grid

D2a — Schreib-Functions + Klick-Editor (Popover) + Realtime

D2c — Service-Symbol-Darstellung (service-marker.ts)

D2d — GL-Bereinigung (gl→service, kein GESCHÄFTSLEITUNG-Abschnitt)

D2e — Cross-Booking-Warnung (roter Punkt + Tooltip)

Erfolgs-Gate (erfüllt)

tsc, eslint --max-warnings=0, vitest grün (566 Tests). Grid zeigt migrierte Schichten korrekt; Editor legt an/ändert/löscht; Realtime live; Cross-Booking-Punkt sichtbar.

Offen — Dienstplan

D3 — Öffentliches Display (/display/:slug?token=…, Edge Function, Auto-Refresh, Bereichs-Rotation, Legende X/–/U/K/B/♡, Geburtstags-Banner) nach thaitime-Vorlage (ScheduleDisplay.tsx).

Offene Module insgesamt (Stand 14.06.2026)

Erledigt: M0 Kern, M1 Zeiterfassung, M2 Kasse, M3 Dienstplan (außer D3).

Noch offen, grob nach Aufwand/Abhängigkeit:

ModulQuelle der WahrheitInhaltPrioritätZeit-ResttagesabrechnungBrutto/Netto (SFN, Steuerklassen, Minijob/SV), Provision (wochenbasiert)hoch — rechnet auf bestehende Zeit-/KassendatenM4 Lohn/HRthaitime + bunkerNettolohn (gegen BMF-Referenz testen), Payslips, Dokumentengenerierung (Vertrag/Zeugnis), Onboarding-Historie, AbmahnungenhochM5 BestellwesenbestellungGrößter Datenumzug: Artikel, Lieferanten, Bestellhistorie, B2B-Lieferanten-/Kunden-Portale (Magic Links), KI-Katalog-/Rechnungsimport, Voice (ElevenLabs)groß, aber bestellungläuft solide alleine weiter → kann späterM6 Wein & GästebunkerWeinkarte, Quiz, öffentlicher Token-KatalogniedrigM7 InventurbunkerInventur-ErfassungniedrigM8 KommunikationthaitimeMessaging, Telegram-Bot, Benachrichtigungs-Dispatcher (in-App/Push/E-Mail/Telegram)Querschnitt

Reihenfolge-Empfehlung: Zeit-Rest (Brutto/Netto + Provision) → M4 Lohn/HR → D3 Display → M5 Bestellwesen → M6/M7/M8. Begründung wie im Hauptdokument: Lohn rechnet auf Zeit-/Kassendaten (müssen zuerst stehen); bestellung ist die einzige Alt-App die autark weiterläuft, daher M5 unter den großen zuletzt.

**Nachtrag Geofencing M1 (umgesetzt 17.06.2026):** UI-Stempelungen sind server-seitig geofence-gegated (`src/lib/geo/`: haversine, geofence, server-check, geocoding.server, client). `locations` erhielt `latitude`/`longitude`/`geofence_radius_m` (Default 100 m). `clockIn` verlangt (a) genau **einen distinkten** Standort in `staff_locations` und (b) hinterlegte Koordinaten am Standort — sonst sprechende deutsche Ablehnung, kein Eintrag. Manager-Korrekturen (`createManualEntry`/`updateTimeEntry`) sind geofence-frei (geoFix optional). Bewusste Erweiterung über R4 hinaus (R4 erlaubte Geolocation, schrieb Geofencing nicht vor). **Vertragsänderung zu B2a:** früher war `location_id NULL` beim Stempeln erlaubt; jetzt ist ein eindeutiger, geocodierter Standort Voraussetzung fürs UI-Stempeln.

Nachtrag Mitarbeiter-Self-Service + Kasse Soll-Wechselgeld (umgesetzt 17.06.2026)

Mitarbeiter-Self-Service (neuer Modulstrang, aus M1 `/zeit` gewachsen): Hub + „Meine Schichten" (A), Freier-Tag-Wunsch (B), Urlaubsanträge mit Genehmigung (C) umgesetzt; Payslips einsehen (D) offen. Welle C nutzt `leave_requests` + atomare SECURITY-DEFINER-RPC `approve_leave_request` (EXECUTE nur `service_role`); ein genehmigter Antrag expandiert nach `roster_absence`. thaitime-Features Schichttausch/-wünsche bleiben ausgeschlossen (Freier-Tag-Wunsch ist unverbindlich, kein Tausch).

Kasse Soll-Wechselgeld: `locations.cash_balance_target_cents` (`bigint NULL`) mit COALESCE-Fallback auf `organizations.cash_balance_target_cents`; Vier-Zeilen-Bargeldblock in `/admin/kasse`, Berechnung über reines `cash-summary.ts` und geteilten `sessionToDayInput`-Helper.

Nachtrag Aufgaben/Kanban (neuer Modulstrang, umgesetzt 21.06.2026; nicht Teil von M0–M8)

Zweck: betriebliches Aufgaben-/Ticket-Board (Schicht-/Prep-/Putz-Aufgaben und Wartung), bewusst getrennt von Dienstplan (Soll) und Zeiterfassung (Ist). Quelle der Wahrheit: Neubau (kein Alt-App-Klon).

Datenmodell: Tabelle `tasks` mit `organization_id`/`location_id`, `title`, `description`, `category` (`task_category` ∈ service/kitchen/maintenance/manager_admin), `status` (`task_status` ∈ open/in_progress/done/cancelled), `priority` (smallint 0–3), `sort_order` (numeric, LexoRank-light fürs Drag&Drop), `assignee_staff_id`, `created_by_staff_id`, `due_at`, `started_at`, `completed_at`, `archived_at`. Archivieren statt Löschen.

Berechtigungen: `app_permission` um `tasks.view/create/assign/change_status/delete` erweitert; `permission_role_defaults`: admin alle fünf, manager view/create/assign/change_status (kein `tasks.delete` → Archivieren admin-only).

RLS & Schreibpfad (Hausmuster, verbindlich für künftige service_role-Module): `tasks` hat **nur SELECT-Policies** (admin/manager + staff), **keine** Client-Schreib-Policy. Alle Schreibvorgänge laufen über **service_role-only** SECURITY-DEFINER-RPCs (`create_task`, `set_task_status`, `reassign_task`, `update_task`, `archive_task`, `claim_task`). Die Aufrufer-Identität wird **nicht** über `auth.uid()` in der RPC abgeleitet (unter service_role NULL!), sondern im Server-Fn via `loadAdminCaller` aus der Session aufgelöst und als Parameter (`p_caller_staff_id`, `p_organization_id`) übergeben; die Rolle ermittelt die RPC autoritativ aus `role_assignments`. Gleiches Muster wie skills/easyorder — Referenz für alle service_role-RPCs.

Volle Transparenz (bewusst entschieden): Staff sehen alle nicht-archivierten Tasks ihrer Standorte inkl. `manager_admin`; `manager_admin` bleibt aber manager-only beim Anlegen.

Self-Service: `claim_task` weist eine offene, unassignete Task am eigenen Standort dem Aufrufer zu. Realtime: `tasks` in `supabase_realtime` (REPLICA IDENTITY FULL). UI: Manager-Board `/admin/aufgaben`, Staff-Board `/zeit/aufgaben`, Drag&Drop via @dnd-kit.

Lektion (live gelernt): Die RPCs hatten anfangs `current_staff_id()`/`has_permission()` intern, wurden aber via `supabaseAdmin` (service_role) aufgerufen → `auth.uid()` NULL → „kein aktiver Aufrufer", jeder Schreibvorgang scheiterte. Statisches Review fing das nicht (DB-Integrationstests sind `continue-on-error`); erst der manuelle Smoke-Test. Fix: Migration `…123007` (Caller-Parameter, service_role-only). Konsequenz für künftige service_role-RPCs: Identität immer als Parameter, nie `auth.uid()` in der RPC.

Stand 21.06.2026: End-to-End-Smoke-Test bestätigt (Anlegen → Staff sieht/claimt → Realtime live). Assignee-Filter nach Kategorie umgesetzt — reines, getestetes `filter-staff-by-category.ts`. Standort ist über die Quelle bereits erzwungen; der Filter narrowt zusätzlich nach Skill/Rolle (`service`/`kitchen` → Skill-Kategorie, `manager_admin`/`maintenance` → Rolle bzw. `other`-Skill).
