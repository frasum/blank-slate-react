# COCO Cutover-Plan — T0 = 26.07.2026

Stand: 14.07.2026 · Status: FREIGEGEBEN (Frank, alle Entscheidungen E1–E5 getroffen)
Konsolidiert aus: ARBEITSWEISE §5/§37/§86/§88/§90/§93, docs/migration-cutover-checklist.md,
docs/produktionsreife-review.md. Dieses Dokument ist ab jetzt die EINE Cutover-Wahrheit;
ältere Merkposten verweisen hierher.

**Ziel:** COCO wird alleinige Kassen-Wahrheit; `tagesabrechnung` wird read-only
eingefroren. Alle anderen Module laufen bereits produktiv in COCO — der Cutover
betrifft im Kern den Geldpfad Kasse.

**Bereits erledigt (Vorbedingungen):** P1 Monitoring/Sentry ✅ · P2 Finalize-E2E ✅ ·
P3 Restore-Probe ✅ · FK-Indizes (§93) ✅ · Generalprobe Kassen-Reimport = Cleaning Cut
(§37, 02.07., Ist = Soll über 5 Tabellen) ✅.

## Getroffene Entscheidungen (Frank, 14.07.2026)

- **E1 Härtung:** Freigabe-Disziplin (Feature-Branches, PR-Review, Migrations-Sichtung
  VOR Merge; Migration + Publish gekoppelt). KEIN Staging-Projekt — Neubewertung erst
  mit SaaS-Spur.
- **E2 PIN-Rate-Limit (N3):** wird JETZT atomar gemacht (Postgres-Funktion), Teil des
  Sicherheitspasses in Phase 0.
- **E3 Kalender-Token (N7):** BEWUSST OHNE Ablauf. Begründung: jährliche Neueinrichtung
  auf allen Mitarbeiter-Handys wäre teurer als das Restrisiko; Tokens sind SHA-256-gehasht
  (§87), widerrufbar und rotierbar. Bei Verlust: Token neu generieren.
- **E4 Kassen-/Tresor-Anker:** Die Tresor-Kette ist aus der Quelle nicht rekonstruierbar
  (§37) — am T0 wird je Kassen-Standort (YUM zuerst, dann Spicery) ein GEZÄHLTER
  Anfangsbestand als Anker gesetzt.
- **E5 Umschalttag:** T0 = 26.07.2026 (Periodengrenze — sauberer Schnitt für Lohn,
  Provision, Trinkgeld-Pool). Abbruchkriterien siehe Phase 3.

## Phase 0 — Härtung (bis ~18.07.)

1. **Betriebsmodell-Härtung (E1):** Ab sofort Feature-Branch + PR als Regelfall;
   Migrations-Dateien werden im PR gesichtet und erst nach Freigabe gemergt; jeder
   Migrations-Merge wird unmittelbar published (Lektion §87 Veröffentlichungs-Lücke).
2. **N3 PIN-Rate-Limit atomar (E2):** Zählen+Prüfen als eine Postgres-Funktion statt
   Read-Modify-Write. Eigener Lovable-Block mit Vorab-SQL.
3. **N7 dokumentiert (E3):** kein Code — Entscheidung steht oben.
4. **Mandanten-/Standort-Audit-Matrix (§86 P3):** Befundmatrix der indirekt gescopten
   Kassentabellen (waiter_settlements, session_tip_pool_entries, session_channel_amounts,
   session_terminal_amounts): Tabelle × Org-Scope × Location-Scope × indirekter Anker ×
   RLS-Abdeckung × Risiko × Maßnahme. Prüfer-Arbeit; Fixes nur bei Befund.

## Phase 1 — Mapping-Verifikation & Vorbereitung (bis ~21.07.)

1. **§5-Kassen-Mapping gegen aktuelles Schema verifizieren** (Mapping-Stand 29.06.,
   seither RT1/SP2/TG1-Schemaänderungen): jede Zielspalte prüfen, Import-SQL-Vorlage
   aktualisieren. Regeln bleiben: ids 1:1 · Geld ×100 → cents ·
   kassiert_brutto_cents = pos_sales (Entscheidung A) · Namens-Overrides GUNC→GUNG,
   PAE→SUMITR, jirawut.saechiang→COCO, KRIS→KRISS · Zusatzkellner nur Tip-Pool-Zeile.
2. **N15-Verifikation:** bestätigen, dass `opentabs_deduction_cents` und
   `count_holidays_as_leave` von keinem Import-Pfad gebraucht werden → gibt die
   Drop-Migrationen in Phase 4 frei.
3. **Zeit-Import (B2c) auffrischen:** frischer Export aus tagesabrechnung (mit 16. Spalte `restaurant`), Dry-Run über /admin/migration, Sollwerte in
   docs/migration-cutover-checklist.md aktualisieren.

## Phase 2 — Generalprobe (19.07.–25.07.)

- **Kasse:** Voll-Reimport-Dry-Run nach §37-Prozedur gegen aktuellen Quellstand:
  Export → Diagnose → Lücken-/Hüllen-Erkennung über INHALT (nicht Session-Existenz —
  Hüllen-Falle) → Batch-SQL mit WHERE NOT EXISTS (≤ ~2000–2500 Zeilen/Datei,
  Standortname prominent in Dateiname+Header) → Abschluss-Abgleich Soll/Ist je
  Monat × Standort (PFLICHT — fängt stille Namens-Drops). Laufenden Geschäftstag NIE
  importieren (Stichtag = gestern). Mitternachts-Wrap: h<0 → h+24.
- **Zeit:** CSV-Dry-Run mit Bilanz-Invariante read = imported + Σ skipped;
  Identitäts-Mapping bis „alle bestätigt"; Abgleichsbericht 26.–25. mit 0 unerklärten
  Differenzen.
- **Testdaten-Inventur:** Liste der zu bereinigenden COCO-Testdaten (46
  Test-Bestellungen [Frank 09.07.: zum Cutover bewerten], etwaige Test-Sessions,
  Bestell-Testmodus-Status). Bereinigung nach Regel A (Lese-SELECT beweist) und
  Regel B (destruktives SQL separat geliefert).

## Phase 3 — Umschalttag T0 (26.07.)

1. tagesabrechnung einfrieren: Schreibrechte entziehen, laufende Stempelungen
   abschließen, Read-only-Vermerk (Datum + Verweis auf COCO).
2. Finale Exporte (Kasse + Zeit, bis einschließlich 25.07.).
3. Testdaten-Bereinigung (Phase-2-Liste; DELETE + Rest-Check im SELBEN Editor-Lauf, §10).
4. Kassen-Voll-Reimport (§37-Prozedur) → Abschluss-Abgleich Ist = Soll.
5. Zeit-Import-Commit über /admin/migration → Run-ID + Wasserlinie notieren;
   Wasserlinie = höchster importierter Geschäftstag; Audit-Log prüfen.
6. Tresor-Anker setzen (E4): gezählter Anfangsbestand je Standort, YUM zuerst.
7. Bestell-Testmodus umschalten (Config-Check-Seite; order_email_log belegt jeden Versand).
8. **Abbruchkriterien-Check — bei Verstoß Abbruch nach Rollback-Pfad der Checkliste,
   kein Weiterwursteln:**
   - Abschluss-Abgleich zeigt unerklärte Differenz
   - Bilanz-Invariante des Zeit-Imports verletzt
   - Wasserlinie ≠ höchster importierter Geschäftstag
   - Re-Import-Probe liefert neue Zeilen (Idempotenz gebrochen)

## Phase 4 — Nachlauf (27.07.–09.08.)

- Täglicher Alt/Neu-Summenvergleich über die Übergangsphase (§86); jede Differenz
  nach T0 = Hinweis auf Schreibzugriff ins eingefrorene Alt-System.
- Re-Import-Probe (imported = 0).
- Alt-Syncs/Cron endgültig stilllegen; finale CSVs verschlüsselt EXTERN archivieren
  (nicht Repo, nicht Projekt-Storage).
- Aufräum-Migrationen (nach Phase-1-Verifikation): sessions.opentabs_deduction_cents
  droppen (N15b) · count_holidays_as_leave droppen (UZ1).
- ARBEITSWEISE.md-Nachzug: §-Eintrag mit Anker, Zählern, Entscheidungen E1–E5.

## Nach dem Cutover freigegeben (bewusst NICHT davor)

G1b cash.functions.ts-Aufteilung · H2-Folgedurchgänge cash/lohn/roster · Hygiene mit
CI-Budgets (§86 P4) · SaaS-Spur (N8, Feiertags-Regionen). Parallel, nicht blockierend:
BK2-Inbetriebnahme, e2e-Zehner-Serie → blockierend, PL3, Backup-Strategie Stufe 2,
Gerätetest-Stapel.
