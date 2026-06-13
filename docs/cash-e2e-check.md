# Kasse — manuelle E2E-Checkliste (B3c-1b)

Reine UI-Prüfung gegen die B3b/B3c-1a Server-Functions.

## Voraussetzungen
- Org mit `kitchen_tip_rate` gesetzt; je ein Login als Admin / Manager / Kellner.
- Mindestens ein aktiver `revenue_channel` und ein `payment_terminal`.

## Ablauf
1. Kellner stempelt sich in `/zeit` ein.
2. Manager öffnet `/admin/kasse` für heute. Falls keine Session offen ist:
   „Session anlegen" → `getOrCreateOpenSession`. Badge zeigt `open`.
3. Kellner öffnet `/zeit/abrechnung`, trägt fünf Beträge ein, prüft die
   Live-Vorschau (gleiches Modul wie der Server) und sendet ab.
   Erwartung: Toast „abgegeben & ausgestempelt", read-only Ansicht mit
   Status `submitted` und Auto-Ausstempelzeit.
4. Manager sieht die Settlement-Zeile in `/admin/kasse`. „Korrektur" →
   Wert + Begründung → `correctWaiterSettlement`. Original wird
   `superseded` (ausgegraut), neue Zeile erscheint.
5. Manager ergänzt Kanäle, Terminals, Gutscheine, Notiz → „Session speichern"
   (`updateSession`).
6. Manager fügt je einen Satelliten an (Ausgabe, Vorschuss, Kartenumsatz,
   Bankeinzahlung, Transfer) via `addSessionSatellite`; einen davon wieder
   löschen via `removeSessionSatellite`.
7. Manager finalisiert (`finalizeSession`). Status `finalized`,
   Schreibfelder disabled, Korrektur-Button bleibt aktiv.
8. Admin sperrt die Session (`lockSession`). Status `locked`. Korrektur-
   Versuch muss `CashLockedError` werfen (Toast).
9. Admin verschiebt im Block „Kasse-Wasserlinie" das Datum vorwärts mit
   Begründung (`setCashLock`). Re-Save auf älteren Tag → `CashLockedError`.

## Negativ-Pfade
- Kellner ruft `/zeit/abrechnung` ohne offene Session → Hinweis, keine
  Eingabe möglich.
- Doppel-Submit → `idempotent: true`, Toast „bereits abgegeben".
- Kellner-User ruft `/admin/kasse` direkt → Layout-Gate redirect auf `/`;
  harte Prüfung serverseitig in `loadAdminCaller`.

## Nicht im Scope
- Saldo/Carry-over/CSV/Abgleich → B3c-2.
- Stammdaten-Pflege Kanäle/Terminals → separater Mini-Commit.
