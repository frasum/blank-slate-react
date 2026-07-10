## Plan: Trinkgeld-Anzeige im Standortvergleich prüfen

### Diagnose zuerst — keine Code-Änderung ohne Faktenlage

Die Vergleichskarten holen ihre Zahlen 1:1 aus `getTipStats` (dieselbe Server-Fn, die auch der Trinkgeld-Tab nutzt). Bevor wir „reparieren", muss klar sein, ob die Zahl schon in der Quelle falsch ist oder erst in der Darstellung.

### Schritt 1 — DB-Realität abgleichen (nur Lesen)

Für den aktuell im UI eingestellten Zeitraum (bitte kurz nennen: Monat oder Von/Bis) prüfe ich:

- `sessions` je Standort: Anzahl, Status, `business_date`-Spanne.
- `waiter_settlements` je Standort: `card_total_cents`, `tip_cash_cents`, `tip_card_cents` — Roh-Trinkgeld vor Pool-Verteilung.
- Vergleich mit dem, was `computeSessionTipPoolCore` als `serviceRemainder + kitchenRemainder + Σ shares` liefert (das ist, was `getTipStats` summiert).

Ziel: eine Tabelle „Standort | Roh-Trinkgeld (waiter_settlements) | Trinkgeld laut getTipStats | Delta".

### Schritt 2 — Ursache benennen, dann erst entscheiden

Je nach Befund einer von drei Fixes (kein Blindfix):

- **A) Roh-Trinkgeld in Spicery ist wirklich so niedrig** → kein Bug. Ggf. Hinweis „Spicery hat im Zeitraum nur X abgerechnete Tage" in der Vergleichskarte ergänzen.
- **B) getTipStats untertreibt Spicery** (z. B. `tip_pool_settlement_only`-Flag, Sessions ohne Settlement, Standort-Vererbung greift nicht) → gezielter Fix in `getTipStats` oder `computeSessionTipPoolCore`, mit Charakterisierungstest gegen die DB-Werte aus Schritt 1.
- **C) Nur die Vergleichs-Anzeige irritiert** (Balken/Badge) → kosmetischer Fix: bei extremen Differenzen `+…%` durch „×N" ersetzen oder Balken mit Minimum-Breite anzeigen. Beträge unverändert.

### Nicht Teil dieses Schritts

- Keine Änderungen an `revQueries`, `tipQueries` oder anderen Tabs.
- Keine neue Trinkgeld-Formel, keine Migration.

### Kurze Rückfrage vor Start

Damit ich in Schritt 1 den richtigen Zeitraum abfrage: welcher Monat / welches Datumsfenster ist im Screenshot gerade eingestellt? Und öffnest du den Trinkgeld-Tab einmal mit Standortfilter „Spicery" — steht dort dieselbe **20,10 €** wie in der Vergleichskarte, oder ein anderer Wert?
