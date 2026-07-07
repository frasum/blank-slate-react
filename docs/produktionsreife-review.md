COCO — Produktionsreife-Review

Stand: 07.07.2026 · Repo-HEAD 8cfdbc1d · Reviewer: Claude (Architekt/Prüfer des Projekts) Evidenzbasis: 595 TS/TSX-Dateien (~120.000 Zeilen), 168 Testdateien (1505 Tests), 157 Migrationen, gezielte Repo-Scans (heute) plus die dokumentierte Verifikations-Historie aller Bausteine (ARBEITSWEISE §1–§70).

Offenlegung: Ich bin der Architekt/Prüfer dieses Systems und reviewe damit auch eigene Entscheidungen. Ich benenne Schwächen deshalb bewusst hart; wo ich befangen sein könnte, sage ich es.

A. Executive Summary

Ist COCO produktionsreif? Für den eigenen Betrieb: weitgehend ja — mit drei benannten Lücken (Monitoring, Backup-Probe, E2E-Kernpfade). Mehrere Module laufen bereits produktiv (Dienstplan als alleinige Wahrheit, Bestellwesen, Zeiterfassung), die Kasse steht bewusst im Parallelbetrieb vor dem Cutover. Für den Betrieb als Mehrkunden-SaaS: nein, noch nicht — die Gründe sind dokumentiert (docs/saas-vorbereitung.md) und keine Überraschung: mandantenfähige Secrets, Konfigurationsobjekte, Support-/DSGVO-Prozesse.

Das Fundament ist überdurchschnittlich: durchgängige organization_id-Mandantenfähigkeit, ein konsequentes deny-all-RLS-Muster (20 sensible Tabellen ohne jeden Client-Zugriff), null client-seitige Schreibzugriffe in Komponenten (heute verifiziert: 0 Treffer — alles läuft durch Server-Functions mit Rollen-/Permission-Checks), append-only Audit-Log, und eine in dieser Projektgröße seltene Testkultur: cent-genaue Golden-Master-Tests gegen amtliche Lohnrechnung und echte Abrechnungen, Charakterisierungstests bei jeder Regel-Extraktion, RLS-Inventur als Skript. Die ehrliche Kehrseite: drei Monolith-Dateien, FK-Indizes-Lücke, dünne Error-Boundaries, kein Monitoring, keine automatisierten E2E-Tests, und die DB-Integrationstests laufen im CI non-blocking.

B. Kritische Risiken (vor Produktivstart der Kasse adressieren)

Kein Fehler-Monitoring/Alerting. Es gibt keinerlei Sentry/Logging-Anbindung (Scan: 0 Treffer). Ein Serverfehler im Tagesabschluss um 23:30 fällt heute nur auf, wenn ein Mitarbeiter anruft. Für ein Geldsystem inakzeptabel. → Kleiner, sicherer Schritt: Sentry (o. ä.) für Server-Functions + Client, mit Org-/Route-Tags; 1 Lovable-Baustein.

Backup/Restore nie geprobt. Supabase macht Backups, aber ein dokumentierter, einmal DURCHGESPIELTER Restore-Weg (Point-in-Time auf Staging-Projekt) existiert nicht. Ohne Probe ist ein Backup ein Hoffnungswert. → Halbtägige Übung, Ergebnis als docs/runbook-restore.md.

DB-Sicherheitstests non-blocking im CI (ARBEITSWEISE §8, PostgREST-Schema-Cache-Problem): Die RLS-/Guard-Integrationstests laufen, blockieren aber nicht. Die EasyOrder-/Rezept-Sicherheitspfade sind statisch wasserdicht, aber nicht in jeder Pipeline bewiesen. → Bei nächstem Supabase-CLI-Fix continue-on-errorentfernen; bis dahin: wöchentlicher manueller Blick auf den Job (Merkposten, kein Code).

Keine E2E-Automation für die drei Geldpfade (Tagesabschluss finalisieren, Lohnlauf-Export, Bestellung absenden). Manuelle Klickwege sind diszipliniert dokumentiert, aber nicht wiederholbar. → Playwright mit 3 Smoke-Szenarien gegen lokalen Stack; zuerst der Kassen-Finalize (vor dem Cutover!).

Bewusst NICHT kritisch: hartcodierte Secrets (keine gefunden — alles über process.env, Service-Key nur in client.server.ts), XSS (einziges dangerouslySetInnerHTML in der shadcn-Chart-Bibliothek, kontrolliert), Datenlecks zwischen Standorten (Cross-Org-Guards assertLocationInOrg/assertStaffInOrg durchgängig, RLS-Anker überall; die Advisor-Prüfung ADV1 hat das Modell bestätigt).

C. Architektur- & Datenbankbewertung

Stärken: Saubere Schichtung UI → Server-Functions (createServerFn, Cloudflare-kompatibel) → supabaseAdmin; Geschäftsregeln als reine, getestete Module (tip-pool.ts, recipe-costing.ts, sfn/, pap-2026/, unit-conversion.ts) — die KGL-Regel („eine Regel, eine Implementierung") wird gelebt und bei jedem Review geprüft. Mandantenmodell von Tag 1. Migrationen: 157 Dateien, nachvollziehbar, idempotente Muster, Enum-Erweiterungen korrekt separiert.

Schwächen (ehrlich):

Monolithen: cash.functions.ts 3365 Zeilen, zeit-uebersicht.tsx 2805, bwa.tsx 2468. Funktional korrekt, aber jede Änderung dort hat unnötig großen Blast-Radius. → Refactoring-Vorschlag G1.

FK-Index-Lücke: 154 REFERENCES vs. 102 CREATE INDEX — Postgres indiziert FKs nicht automatisch; einige Joins/ON-DELETE-Prüfungen laufen ohne Index (Kandidaten: recipe_items.article_id, session_tip_pool_entries.staff_id, article_locations.location_id). Bei heutiger Datenmenge unkritisch, bei Wachstum nicht. → G2.

Doppel-Implementierung Geschäftstag (TS business-date.ts + SQL current_business_date()) — dokumentiert, aber ein latentes Drift-Risiko; bei der SaaS-Konfigurierbarkeit ohnehin zu vereinheitlichen (saas-vorbereitung Stufe B).

types.ts 5616 Zeilen generiert — okay (generiert), aber routeTree.gen.ts-Drift wurde zweimal beobachtet; generierte Dateien gehören in einen CI-Regenerations-Check.

D. Security Review

Positiv verifiziert: Auth-Modell (PIN → echte Supabase-Session via Shadow-User → RLS greift — die tagesabrechnung-Lücke ist hier konstruktiv geschlossen); Rollen admin>manager>staff + Seitenrollen + gescopte permission_overrides (PL1/PL2-Härtung inkl. der Lektion globaler vs. gescopter Checks); 20 deny-all-Tabellen; staffId NIE vom Client (loadAdminCaller/auth.uid); Token-Regeln (32-Byte CSPRNG, ablaufend, nie geloggt); sensible Felder in Dry-Runs maskiert; Trigger-Funktionen ohne Client-EXECUTE (ADV1); HIBP aktiv; Payslip-Bucket privat. Input-Validierung durchgängig Zod in jeder Server-Function.

Restpunkte: (1) Rate-Limiting existiert für PIN-Versuche (pin_attempts), aber nicht für die übrigen Server-Functions — für internen Betrieb okay, vor SaaS nötig. (2) impersonation ist mächtig — auditiert, aber ein Vier-Augen-Gedanke (Ablaufzeit) fehlt. (3) Die eine dangerouslySetInnerHTML-Stelle (shadcn chart) bei Library-Updates im Blick behalten.

E. Performance Review

Serverseitig solide: selectAllPaged mit id-Tiebreaker nach der BFIX2-Lektion flächendeckend; die klassische 1000-Zeilen-Falle ist als §3-Pflichtregel gebannt. N+1-Muster: eine bekannte Stelle — getTipRemainderByPeriodrechnet pro Session sequenziell computeSessionTipPoolCore (je 3 Queries × ~30 Tage = ~90 Queries pro Ansicht). Funktioniert, ist aber die langsamste Admin-Ansicht. → G3.

Client: React Query durchgängig mit sinnvollen Keys; RosterGrid virtualisiert; Realtime gezielt. Bundle-Größe nicht gemessen (kein Build im Review-Umfang) — Messung als Merkposten; Kandidat: recharts/pdf-Bibliotheken nur route-lazy laden.

Große Client-Filterungen: Verkaufsartikel/Katalog filtern client-seitig über ~1200 Artikel — bewusst und bei dieser Größe richtig; ab ~10k Artikeln (SaaS) serverseitig.

F. Codequalität & Wartbarkeit

Beeindruckend für die Entstehungsgeschwindigkeit: 62 any in 120k Zeilen (fast alle in UI-Lib-Wrappern), 2 TODO/FIXME, ESLint --max-warnings=0 dauerhaft grün (die früheren 5 tolerierten Warnings sind abgebaut), Prettier durchgesetzt, deutsche Domänensprache konsistent. Testabdeckung 168 Testdateien mit klarem Fokus auf Geld/Zeit-Logik — genau richtig priorisiert. Schwächen: die drei Monolithen (C), vereinzelt lange Komponenten (RezepteTab 1486), und die Lovable-Eigenheit gelegentlicher Format-Nachzügler (durch das Erfolgs-Gate-Ritual praktisch neutralisiert).

G. Konkrete Verbesserungsvorschläge (kleine, sichere Schritte)

G1 — cash.functions.ts aufteilen (reines Move-Refactoring, keine Logikänderung): cash-settlement.functions.ts, cash-tip.functions.ts, cash-admin.functions.ts, cash-stammdaten.functions.ts; Re-Exports für Aufrufer; Gate: tsc + alle Tests unverändert grün. Ein Lovable-Prompt, niedriges Risiko, hoher Wartbarkeitsgewinn.

G2 — FK-Index-Nachzug: eine Migration mit ~10 gezielten Indizes (Kandidatenliste per pg_stat_user_tables/fehlende-FK-Index-Query, die ich liefern kann); vorher Live-Query bei Frank zur Bestätigung.

G3 — Trinkgeld-Rest-Ansicht bündeln: computeSessionTipPoolCore bekommt eine Batch-Variante (Settlements/Time-Entries/Pool-Entries für ALLE Sessions der Periode in je einer Query laden, im Speicher gruppieren) — Rechenmodul unverändert.

G4 — Monitoring: Sentry-Init in \_\_root + Server-Function-Wrapper (runGuarded ist die natürliche Andockstelle); Alerts auf Finalize-/Lohn-/Bestell-Fehler.

G5 — E2E-Smoke (Playwright): drei Szenarien — (a) PIN-Login → Stempeln → Ausstempeln mit Pausendialog, (b) Kellnerabrechnung → Finalize inkl. TG1-Warnungs-Pfad, (c) Warenkorb → Bestellung (Testmodus-Redirect prüft E-Mail). Läuft gegen den lokalen Supabase-Stack der db-Tests.

G6 — Restore-Runbook (kein Code): PITR-Probe auf Wegwerf-Projekt, Schrittfolge dokumentieren.

G7 — Generierte Dateien im CI verifizieren: Job-Schritt „routeTree/types regenerieren + git diff --exit-code".

H. Roadmap zur Produktionsreife

Kritisch vor Kassen-Go-live (Produktivstart des Geldpfads): G4 Monitoring → G5(b) Finalize-E2E → G6 Restore-Probe → dann der dokumentierte Cutover (§5-Voll-Reimport, YUM-Kassen-Anker). In dieser Reihenfolge; alles Vier-Augen-verifiziert wie gehabt.

Wichtig vor breiter Nutzung (alle Standorte, mehr Nutzer): G1 Kassen-Refactoring, G2 Indizes, G5(a/c), G3 Rest-Ansicht, Rate-Limiting-Konzept, Bundle-Messung.

Später optimieren (Richtung SaaS, nach saas-vorbereitung.md): mandantenfähige Secrets/Integrationen, Konfigurationsobjekte Stufe B, organization_features, DSGVO-Paket (AVV, Lösch-/Aufbewahrungskonzept — heute existiert Datensparsamkeit, aber kein dokumentierter Löschprozess für ausgeschiedene Mitarbeiter), Onboarding-Wizard.

Fazit in einem Satz: COCO ist ein für seine Größe ungewöhnlich diszipliniertes System, dessen Weg zur vollen Produktionsreife nicht durch Umbauten führt, sondern durch vier Betriebs-Bausteine — sehen (Monitoring), beweisen (E2E), üben (Restore), abschließen (Cutover).
