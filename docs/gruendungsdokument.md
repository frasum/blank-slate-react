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

**B2-SFN — SFN-Berechnung + Golden-Master (neuer eigener Schritt, vor B2c):** Reines TS-Modul, das aus den `time_entries` eines Tages SFN-Zuschläge berechnet. Charakterisierungstest (Golden Master) gegen das Original `calculateShiftHours` aus bunker-shift-flow mit dem dortigen Referenzfall-Satz (27 Tests). Erst wenn jedes Originalergebnis bitgenau reproduziert wird, gilt B2-SFN als abgenommen. **Dies ist explizit nicht M4** — es ist die getestete Zuschlags-Logik auf Stempel-Basis, auf der M4 (Nettolohn) später aufsetzt.

**B2b — Korrekturen & Mobile-UI:** Manager-Korrektur-UI (`source='manual'`), Pausen-Behandlung, PWA-Manifest-only fürs Mitarbeiter-Stempeln (siehe R4).

**B2c — Migration & Parallelbetrieb:** `zt_shifts`-Importer aus tagesabrechnung + bunker, 2-Wochen-Parallelbetrieb mit Abgleichsbericht, Alt-Sync stilllegen.

Erfolgs-Gate B2a:

- `tsc --noEmit`, `eslint . --max-warnings=0`, `vitest run` grün.
- RLS-Inventur (`scripts/check-rls-inventory.sql`): weiterhin 0 anon-Policies, 0 bedingungslose Schreib-Policies; `time_entries` hat **0 Client-Schreib-Policies** (nur die SELECT-Policy für eigene Einträge).
- Unit-Tests für `canClockIn`/`canClockOut` (aktiv/inaktiv, kein/ein offener Eintrag, end vor start).
- DB-Integrationstest (manuell via SQL-Konsole für B2a): (a) direkter INSERT als `authenticated`-Rolle wird abgelehnt; (b) zweiter offener Eintrag pro Mitarbeiter wird vom Unique-Index abgelehnt; (c) Lesezugriff auf fremde Einträge liefert 0 Zeilen.
- Manueller E2E-Klickpfad mit zwei realen B1c-Personen: einstempeln → Liste enthält offenen Eintrag → ausstempeln → Eintrag geschlossen, Dauer korrekt.
- Negativ-Manuell: inaktiver Mitarbeiter (per B1c-Admin deaktiviert) bekommt beim Einstempeln die deutsche Fehlermeldung; zweites Einstempeln ohne vorheriges Ausstempeln wird abgelehnt.

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

| O1 | Name & Branding der vereinten App | offen |

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
