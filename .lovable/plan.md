Reiner Doku-Commit, zwei Dateien.

## docs/arbeitsweise.md
1. Stand-Zeile ersetzen: `Stand: 18.07.2026 (§104: …)` → `Stand: 18.07.2026 (§105: Hermes-Triage + SEC-02 + Pool-Diagnose + Preisrunde Spicery + Drei-Welten-Beschluss)`
2. §105-Block wortgleich am Dateiende anhängen (Abnahme-Anker `c368bcf2`; Abschnitte PY2, Hermes-Triage, SEC-02, ENV1, PZ1, PR1, Drei-Welten-Beschluss, Offene Merkposten).

## docs/t0-laufkarte.md
3. Bei den täglichen Routinen den Punkt „Zeit-Vollständigkeit Vortag (täglich, ~30 s)" mit dem SQL-Block einfügen, Formatierung an Umgebung angleichen. Passenden Ort suche ich beim Umsetzen (vermutlich unter Nachlauf/N1 oder in einem täglichen Prüfblock).

## Abschluss
4. `npx prettier --write docs/arbeitsweise.md docs/t0-laufkarte.md`
5. Keine Code-/Migrationsänderungen, keine anderen Dateien anfassen. CI muss grün bleiben.
