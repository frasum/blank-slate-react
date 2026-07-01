## Ziel

Kellner müssen nicht mehr warten, bis der Manager eine Session eröffnet. Beim ersten Aufruf von `/zeit/abrechnung` am Geschäftstag wird die Session für den Standort des Kellners automatisch angelegt — mit fortgeschriebenem Wechselgeld und Vortagsdefizit wie bei manueller Eröffnung. Der Manager-Button bleibt als Fallback.

## Was sich ändert

- **Neue Server-Fn `ensureSessionForBusinessDay({ locationId })`** (in `src/lib/cash/cash.functions.ts`)
  - Middleware: `requireSupabaseAuth` (jeder authentifizierte Staff darf sie aufrufen — kein Manager-Recht nötig).
  - Ermittelt Geschäftstag über `public.current_business_date()`.
  - Prüft per `SELECT … FOR UPDATE`-Muster (Advisory-Lock auf `hashtext(location_id||date)`), ob bereits eine offene Session existiert → gibt diese zurück.
  - Wenn nein: legt neue Session an und ruft dieselbe interne Init-Routine auf, die heute der manuelle Manager-Weg nutzt (Wechselgeld-Kette + Vortagsdefizit fortschreiben, Kanäle/Terminal-Zeilen seeden, Roster-Snapshot für den Tip-Pool).
  - Kein neuer RPC nötig — die bestehende Session-Anlage wird in einen internen Helper extrahiert und von beiden Wegen (manuell + auto) genutzt.
  - Auditlog-Eintrag mit `source='auto_waiter_settlement'`, damit der Ursprung nachvollziehbar bleibt.

- **`/zeit/abrechnung` Loader/Component** (`src/routes/_authenticated/zeit/abrechnung.tsx`)
  - Der bestehende „keine Session offen"-Zweig ruft `ensureSessionForBusinessDay` genau einmal auf (Guard gegen Doppelaufruf über `useRef`), invalidiert die Abrechnungs-Query und rendert dann normal.
  - Fehlerzweig (z. B. Standort nicht ermittelbar) zeigt eine klare Meldung mit Retry-Button — kein stiller Fehler.

- **Manager-„Session eröffnen"-Buttons bleiben** in `/admin/kasse` und im Manager-Zweig von `/zeit/abrechnung`. Sie rufen die gleiche interne Init-Routine, damit beide Wege exakt dasselbe Ergebnis liefern.

## Was sich NICHT ändert

- Sessions-Datenmodell, Wechselgeld-Verkettung, PDF-Export, Tip-Pool-Snapshot, RLS-Policies.
- Standort-Zuordnung des Kellners (bleibt aus `staff_locations`).
- Cron/pg_net wird nicht angefasst — bewusst kein Zeitschalter, um keine Leer-Sessions an Ruhetagen zu erzeugen.

## Technisch relevante Details

- Standort für den Auto-Open kommt aus dem Staff-Profil des Aufrufers. Hat ein Kellner mehrere Standorte, wird der in der Abrechnungs-UI aktuell gewählte Standort verwendet (gleiche Auswahl wie heute für den Manager-Flow).
- Race-Absicherung: `pg_advisory_xact_lock(hashtext(location_id::text || business_date::text))` innerhalb der Init-Transaktion + Unique-Constraint-Check auf offene Session pro (location, business_date).
- Der bestehende Roster→Tip-Pool-Snapshot bei Session-Eröffnung läuft unverändert mit — dadurch bleibt „Fähigkeit A" intakt.
- Audit: `audit_log`-Eintrag mit `action='session.open'`, `metadata.source='auto_waiter_settlement'`, `actor_staff_id`.

## Tests

- Unit: neue Init-Routine (Wechselgeld-Fortschreibung, Defizit-Kette) wird bereits getestet — Tests werden auf den neuen Helper umgehängt, kein Verhaltensdrift.
- Integration: „zwei Kellner rufen /abrechnung gleichzeitig auf" → nur eine Session entsteht (Advisory-Lock-Test).
- Regression: Manueller Manager-Open erzeugt identische Session wie Auto-Open (Snapshot-Vergleich der relevanten Spalten).

## Rollout

Kein Migrations- oder Datenumbau nötig. Reine Code-Änderung + optional ein zusätzliches Feld im `audit_log.metadata` (JSONB — kein Schema-Change).
