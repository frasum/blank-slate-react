# Runbook: Datenbank-Restore (P3-geprobt am 09.07.2026)

Bewiesener Wiederherstellungsweg für die COCO-Produktions-DB. Probe bestanden:
Dump 1,9 MB (129 Tabellen mit Daten), Restore in Wegwerf-Projekt, Kernzahlen-Abgleich
22/22 identisch (inkl. Geld-Summen auf den Cent, 164 Migrationen, 85 RLS-Tabellen).
Gesamtdauer der reinen Wiederherstellung: unter 15 Minuten.

⚠️ Grundregeln:

- Connection-Strings enthalten das DB-Passwort → NIEMALS in Chat/Lovable/Repo, nur lokal ins Terminal.
- Der „Restore"-Knopf im Supabase-Dashboard (Database → Backups) spielt den Stand IN DIE PRODUKTION zurück
  und überschreibt sie — nur im echten Ernstfall nach bewusster Entscheidung nutzen.
- Unsere Backups sind PHYSICAL ohne Download-Option → der eigenständige Weg ist `pg_dump` (dieser Runbook).

## Voraussetzungen (einmalig)

- macOS: `brew install libpq && brew link --force libpq` (liefert psql/pg_dump/pg_restore)
- DB-Passwort im Passwortmanager (Reset jederzeit möglich: Project Settings → Database →
  Reset database password — COCO/Lovable nutzen API-Keys, ein Reset bricht nichts)
- Produktions-Host: `db.gyvblrdhutztbkoynnrq.supabase.co`, User `postgres` (Direktverbindung)

## Schritt 1 — Verbindung testen (30 s)

psql -h db.gyvblrdhutztbkoynnrq.supabase.co -p 5432 -U postgres -d postgres -c "select 1;"
→ Passwortabfrage, Ergebnis `1` = ok.

## Schritt 2 — Dump ziehen (nur LESEND, wenige Minuten)

pg_dump -h db.gyvblrdhutztbkoynnrq.supabase.co -p 5432 -U postgres -d postgres \
 --no-owner --no-privileges --format=custom --file=coco-prod.dump

Plausibilitätsprüfung:

- `ls -lh coco-prod.dump` → einstellige MB sind ok (Custom-Format komprimiert stark)
- `pg_restore --list coco-prod.dump | grep -c "TABLE DATA"` → deutlich über 100 (09.07.: 129)

## Schritt 3 — Zielprojekt

Ernstfall: neues Supabase-Projekt anlegen (gleiche Region eu-central-1), Referenz aus der
Dashboard-URL notieren. Übung: Wegwerf-Projekt.

## Schritt 4 — Einspielen

pg_restore -h db.<ZIEL-REFERENZ>.supabase.co -p 5432 -U postgres -d postgres \
 --no-owner --no-privileges coco-prod.dump

Erwartung: mehrere hundert ignorierte Fehler zu auth/storage/realtime/Extensions/Event-Triggern
(Plattform-Verwaltung, NICHT unsere Daten; 09.07.: „errors ignored: 340"). Das Urteil fällt in Schritt 5.

## Schritt 5 — Beweis führen

`docs/`-begleitendes Prüf-SQL (p3-kernzahlen.sql, liegt bei Claude/Chat-Archiv; Kennzahlen:
15 Zeilenzahlen der Kerntabellen, Σ kassiert_brutto_cents, Σ open_invoices_cents,
max business_date/shift_date/audit-Zeitstempel, Migrations-Anzahl, RLS-Tabellen-Anzahl)
auf Quelle UND Ziel im SQL-Editor ausführen, beide CSVs exportieren, Diff.
Bestanden = identisch bis auf erklärbare Nach-Dump-Aktivität der Produktion.

## Nach einem ECHTEN Restore zusätzlich nötig

1. API-Keys/Secrets des neuen Projekts in Lovable hinterlegen, App-Konfiguration umziehen
   (Projekt-Referenz in supabase/config.toml + .env.production), Publish.
2. Storage-Bucket-Inhalte sind NICHT im DB-Backup (Supabase-Hinweis „Storage objects are not
   included") — Mitarbeiter-Dokumente/Payslips müssen separat wiederhergestellt werden
   → offener Arbeitspunkt „Backup-Strategie Stufe 2".
3. TRMNL-/Display-/Kalender-Tokens bleiben gültig (stehen in der DB); Kiosks/TRMNL neu laden.

## Bekannte Grenzen

- auth.users-Passwörter/Sessions werden durch --no-privileges-Restore nicht 1:1 nutzbar —
  Logins laufen im Ernstfall über Passwort-Reset bzw. PIN-Neuvergabe (Shadow-User werden von
  COCOs ensure-Mechanik neu verknüpft). Bei der Probe nicht getestet (Daten-Probe, keine Auth-Probe).
- Storage-Objekte: siehe oben.