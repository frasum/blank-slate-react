# SaaS-Vorbereitung COCO — Readiness-Audit & Modul-Katalog

Stand: 07.07.2026, Audit am HEAD c8b6816d. Grundlage für den späteren Ausbau zu einem mandantenfähigen Angebot mit zubuchbaren Modulen. Verbindliche Leitplanke: keine SaaS-Umbauten vor dem Kassen-Go-live (tagesabrechnung-Ablösung). Ausführliche Markt-/Konzeptanalyse und Onboarding-Entwurf liegen bei Frank (COCO-SaaS-Konzept, COCO-Lab-Checkliste); dieses Dokument ist die Repo-Wahrheit der technischen Befunde.

## A. Härtegrad-Liste (Readiness-Audit, read-only erhoben)

### Stufe A — bereits konfigurierbar (keine Arbeit nötig)

- Trinkgeldpool-Parameter in `organization_settings`: `kitchen_tip_rate` (Default 0,02), `tip_pool_min_hours` (2,5), `kitchen_manual_only` — geladen via `loadOrgSettings`.
- Zeitsperren-Wasserlinie `time_locked_through_date` (`organization_settings`).
- Skills, Bereichs-/Standortzuordnungen, Lieferanten-Kundennummern je Standort (SL1), Artikel-Standort-Sortimente — alles Stammdaten.

### Stufe B — Code-Konstanten, hebbar mit Charakterisierungstests („COCO-Preset = heutiges Verhalten, bitgenau")

- Geschäftstag-Cutoff 03:00 — `src/lib/business-date.ts` (`hour < 3`) UND als SQL-Funktion `current_business_date()` (Doppel-Implementierung TS/SQL beachten!).
- Periodenregel 26.–25. — `src/lib/display/period-split.ts` (Tag ≥ 26 ⇒ Ende 25. Folgemonat) plus generierte `periods`-Zeilen; Label = Endmonat.
- `EKW_VAT_RATE = 0.19` — `src/lib/bestellung/ek-linking.ts` (Wareneinsatz netto).
- Globale Versand-Secrets — `MAILERSEND_API_KEY`/`FROM_EMAIL`/`FROM_NAME` (`send-order-email.server.ts`), `TELEGRAM_API_KEY` (`telegram.functions.ts`): heute env = ein Absender für alle; SaaS braucht Integrations-Secrets je Mandant.
- Zwei hartcodierte Location-UUIDs in `src/lib/admin/import-assignments-core.ts` (Legacy-Import-Mapping; einmaliger Migrationshelfer, als solcher kennzeichnen/archivieren).
- Standort-Namen-Literale in `location-theme/location-theme.ts` (spicery/yum-Themes), `SessionFieldsCard.tsx`, `zeit-uebersicht.tsx`, `migration/run-import-core.ts` — Theme-Zuordnung muss Stammdatum je Standort werden.

### Stufe C — Strukturannahmen / Produkt-DNA (nur mit bewusster Produktentscheidung ändern)

- Bereichs-Enum `StaffDepartment = "kitchen" | "service" | "gl"` (`staff-domain.ts`, DB-Enum, `RosterGrid`-Abschnitte, `service-marker`-Darstellung) — SaaS-Ziel: konfigurierbare Bereichs-Stammdaten je Standort.
- Dienstplan ohne Uhrzeiten (D-1) — bewusste DNA; begrenzt Marktbreite, Entscheidung über Zielsegment nötig (Interviews!), nicht still nachbauen.
- Trinkgeldpool-Formel-FORM (Umsatzschwellen-Pool, Verteilung nach Stunden, Euro-Abrundung) — Parameter sind konfigurierbar (Stufe A), die Formel selbst ist eine von mehreren am Markt üblichen; SaaS-Ziel ist ein Regelobjekt `tip_pool_rules` mit der heutigen Formel als Preset Nr. 1.
- Vectron-Feldwelt (`hauptgruppe`/`untergruppe`/`warengruppe`, `revenue_channels`/`payment_terminals`, POS-Import) in Kasse, Verkaufsartikel, Statistik — andere Kassentypen = eigene Adapter-Schicht.
- Deutsches Lohn-/Arbeitszeitrecht (pap-2026, SFN §3b, ArbZG-Pausen) — gewollte DNA fürs DACH-Segment; produktweit fix, nicht mandantenspezifisch.

## B. Modul-Katalog für zubuchbare Module

| Modul               | Inhalt (heutige Routen/Functions)                                                                                    | Setzt voraus                            |
| ------------------- | -------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| KERN (immer dabei)  | Organisation, Standorte, Mitarbeiter-Stammdaten, Rollen/Rechte/Overrides, PIN-/Badge-Auth, Audit-Log, Einstellungen  | —                                       |
| ZEIT                | Stempeluhr (Terminal/mobil), Pausen-Compliance, Manager-Korrekturen, Wasserlinie, Zeitübersicht                      | KERN                                    |
| PLAN                | Dienstplan-Grid, öffentliches Display, Wunsch-/Urlaubs-/Tausch-Self-Service, Jahresplaner                            | KERN                                    |
| KASSE               | Tagesabschluss, Kellnerabrechnungen, Trinkgeldpool, Tresor/Bank, Perioden                                            | KERN + ZEIT (Pool-Stunden)              |
| LOHN                | SFN-Zuschläge, PAP-Brutto/Netto, Lohnarten, Lohnbüro-Export, Payslips                                                | KERN + ZEIT (+ KASSE für Provision)     |
| EINKAUF             | Lieferanten, Artikel, Bestellungen/E-Mail, EasyOrder                                                                 | KERN                                    |
| KALKULATION         | Verkaufsartikel, EK-Zuordnung, Rezepturen, Wareneinsatz-Ampel                                                        | EINKAUF                                 |
| INVENTUR            | Inventur-Sessions, Bestandswert                                                                                       | EINKAUF                                 |
| WEIN                | Weinkatalog, Quiz                                                                                                     | EINKAUF                                 |
| STATISTIK           | Umsatz/Trinkgeld/Personalquote, PDF                                                                                   | KASSE bzw. ZEIT je Report               |

Paketierungs-Idee: HR-Edition = KERN+ZEIT+PLAN(+LOHN) als fokussiertes Einstiegsprodukt (gastromatic-Segment); Voll-Edition = alles. thaitime dient dabei ausschließlich als Anforderungs-Spender (Dokumentengenerierung, Onboarding-Einladungen, Messaging → M4/M8-Backlog), NICHT als Codebasis (keine Mandantenfähigkeit, 0 Tests, wird per Strangler Fig abgelöst).

Technischer Weg (erst nach Kassen-Go-live): Tabelle `organization_features` (deny-all-Hausmuster), Server-Helper `assertFeature(orgId, feature)` in den Modul-Functions, Navigation blendet ungebuchte Module aus. Invariante: Flag AUS = Zugriff gesperrt, NIEMALS Datenverlust.

## C. Empfohlene Reihenfolge (Roadmap-Kurzform)

1. Jetzt möglich, risikofrei: Gastronomen-Interviews entlang des Onboarding-Fragebogens (Konzeptdokument Abschnitt D); optional COCO-Lab als getrenntes Experimentierfeld.
2. Nach Kassen-Go-live: Stufe-B-Konstanten als Konfigurationsobjekte heben — je Objekt eigener Baustein mit Golden-Master-Charakterisierungstest; danach `organization_features`.
3. Danach: Pilot mit EINEM befreundeten Betrieb, Concierge-Onboarding, zwei volle Lohnperioden als Gate. Kein Self-Service vor drei gleichartigen Concierge-Durchläufen.