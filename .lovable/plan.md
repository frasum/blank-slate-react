# Lücken-Kartierung „Frag COCO"

Ziel: **Erst verstehen, wo COCO blind ist — dann priorisieren.** Kein Code in diesem Schritt, sondern ein Dokument, das jedes Modul den aktuellen 17 Tools gegenüberstellt.

## Heute verdrahtet (17 Tools)

Stammdaten · Getränke-Ranking · Umsatz-Zeitraum · Arbeitsstunden · Abwesenheiten · Personalkostenquote · Kasse-Tagesabschluss · Bestellungen · Inventur · BWA · Bilanz · Dienstplan · Aufgaben · Tausch · Urlaub · Branchenbenchmark · Personalbestand.

## Vorgehen

1. **Modul-Inventur.** Ich gehe jede Domäne im Repo durch (Kasse, Lohn, Bestellung, Dienstplan, Zeit, Aufgaben, Verkaufsartikel, Trinkgeld, Sofortmeldung, Migration, Dokumente, Statistik, Wein-Quiz, TRMNL/Display, Telegram, Bilanz/BWA, Personalstamm) und liste je Modul auf:
   - welche typischen Fragen ein Betreiber stellt,
   - welches vorhandene Tool sie beantwortet,
   - welche **konkreten Lücken** offen sind.
2. **Prüfen, wo bestehende Tools zu grob sind** — z. B. Umsatz ohne Kanal-Detail, Personalkosten ohne SFN/AG-Anteil, Bestellungen ohne Artikelebene, Aufgaben ohne Zuständigkeitsfrage.
3. **Datenschutz-Grenzen markieren.** Was darf ein Tool ausliefern (Aggregat, pseudonymisiert) und was nicht (Lohnhöhe pro Person, Personaldetails, Sofortmeldungs-Rohdaten). Regel bleibt: Pseudonymisierung MA-1/MA-2, keine Rohnamen an die KI.
4. **Priorisierung.** Je Lücke: Nutzen (wie oft gefragt) × Aufwand (Schema vorhanden? Aggregation trivial?) × Risiko (Datenschutz). Ergebnis: A/B/C-Liste.
5. **Deliverable.** Eine neue Datei `docs/frag-coco-luecken.md` mit
   - Tabelle „Modul → vorhandenes Tool → offene Frage",
   - A/B/C-Liste mit kurzem Vorschlag pro Lücke (welches neue Tool, welche Tabelle, welche Aggregation),
   - Absatz zu Datenschutz-Regeln und was bewusst NICHT ins Tool wandert.

## Was in diesem Schritt NICHT passiert

- Keine neuen Tools, kein Dispatcher-Umbau, keine Migrationen.
- Kein Auto-Discovery/Meta-Tool. Wenn nach der Kartierung viele Tools entstehen sollen, machen wir das als eigenen Bauplan-Schritt (dann ggf. mit Tool-Deferral-Muster).

## Nach der Freigabe

Du entscheidest anhand der A/B/C-Liste, welche Lücken wir zuerst schließen. Jede neue Werkzeug-Erweiterung läuft dann als eigener kleiner Prompt (Tool-Definition in `src/lib/ki/tools.ts`, Handler in `tool-dispatcher.server.ts`, Test, Doku-Nachzug).
