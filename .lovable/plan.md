# N14b — ⌀ pro Gast: eine Zahl, ein Helfer (mit Kanal-Modell-Korrektur)

## Ursache (im Chat gemeldet)

`sessionHouseCentsFromKasse` (in `src/lib/statistics/revenue-core.ts`) delegiert an die reine `sessionRevenue`-Formel des **Statistik-Modells**:

```
houseCents = vectronCents + Σ(non-takeaway)
takeaway  = Σ(delivery_*)         ← wird NICHT abgezogen
```

Dort ist das korrekt: in der Statistik enthält `vectronCents` die Take-away-Anteile nicht.

Im **Kasse-Modell** ist es umgekehrt (Franks Betriebs-Klarstellung, 19.07., über drei Tage numerisch verifiziert): `session.vectron_daily_total_cents` ist der komplette Vectron-Registerumsatz. Wolt und SoUse werden in der Vectron gebongt und sind darin enthalten. Der Marker `delivery_vectron` deckt den eigenen Vectron-Takeaway **plus die Wolt-Beträge** ab; `delivery_souse` markiert SoUse separat. Für Spicery 18.07. (Vectron 6.672,50 €, delivery_vectron 365,10 €) liefert der bestehende Helfer daher fälschlich 6.672,50 → ⌀ 47,32 €. Die Karte in `kasse.tsx` rechnet lokal `vectronTotal − delivery_vectron` → 6.307,40 → 44,73 € (in diesem Fall zufällig richtig, weil SoUse 0). Zwei Zahlen, zwei Wahrheiten.

`chRows`/`channelById`-Lookup und die `kind`-Werte sind in Ordnung — die Kanäle sind korrekt geladen. Der Fehler liegt allein in der Formel.

## Fix (Helfer + Aufrufer, keine dritte Berechnung)

### 1. `sessionHouseCentsFromKasse` neu formulieren (standalone, nicht mehr über `sessionRevenue`)

```
houseCents =
    Σ(kind === "pos")
  + max(0, vectronCents − Σ(kind === "delivery_vectron") − Σ(kind === "delivery_souse"))
```

- `delivery_souse` wird abgezogen (außer Haus, im Vectron-Total enthalten, nicht vom `delivery_vectron`-Marker abgedeckt).
- `delivery_wolt` wird **nicht** abgezogen — Wolt steckt bereits im `delivery_vectron`-Marker; ein zusätzlicher Abzug wäre Doppelabzug. Der `delivery_wolt`-Kanal ist im Kasse-Modell eine Kontroll-/Auszahlungslinie.
- `pos` bleibt Haus (TSB-Fall).
- Unbekannte/leere `kind` → `throw` (damit ein Test es zwingend bemerkt).
- Modell-Kommentar im Helfer entsprechend (drei Sätze: was im Vectron-Total steckt, was die Marker bedeuten, warum Wolt nicht abgezogen wird).
- `sessionRevenue` (Statistik-Modell) bleibt unverändert.

### 2. Aufrufer vereinheitlichen

- `SessionFieldsCard.tsx` (Inline ⌀): nutzt Helfer bereits — automatisch korrekt.
- `DailyPrintView.tsx`, `pdfExport.ts`: nutzen Helfer bereits — automatisch korrekt.
- `kasse.tsx` (~Z. 640): lokales `inHouseCents = vectronTotal − deliveryVectron` durch Aufruf desselben Helfers ersetzen. Diese Größe speist beide Karten „Ø Umsatz/Gast" **und** „Trinkgeld-Quote" (im Chat gemeldet: semantisch dieselbe In-House-Basis, keine bewusste andere Basis).

## Tests (blockierend, in `src/lib/statistics/revenue-core.test.ts`)

Neuer `describe("sessionHouseCentsFromKasse — Kasse-Modell")`:

- **Spicery 18.07.**: `vectron=667_250`, `delivery_vectron=36_510`, `delivery_wolt=17_210`, `delivery_souse=0` → **630.740** (Wolt-Zeile vorhanden und ignoriert — beweist Nicht-Doppelabzug).
- **Spicery 17.07. (SoUse-Fall)**: `vectron=690_840`, `delivery_vectron=34_030`, `delivery_wolt=28_750`, `delivery_souse=15_040` → **641.770**.
- **TSB-Stil**: `vectron=0`, `pos=200_000`, `delivery_wolt=50_000` → **200.000**.
- **Vectron ohne Kanäle**: `vectron=100_000`, keine Kanäle → **100.000**.
- **Kind-Robustheit**: unbekannter/leerer `kind` → `expect(...).toThrow()`.
- **Exakter Prod-String**: mindestens ein Fall mit exakt `"delivery_vectron"` und `"delivery_souse"` als String-Literal.

## Nicht anfassen

- `sessionRevenue`, `aggregateByBusinessDate`, `computeDailyCash*` (dessen Wolt/SoUse-Abzüge sind Bargeld-Logik — Plattform-Geld erreicht die Lade nie — und bleiben exakt), Gästezählung, Trinkgeld-Verteilung, Migrationen.

## Vor Commit

`bunx prettier --write` + `bunx eslint --fix` auf geänderten Dateien. Danach müssen `bunx tsgo --noEmit`, `bunx eslint . --max-warnings=0`, `bunx vitest run`, `bunx prettier --check .` grün laufen. Abweichungen vorher im Chat melden.

## Erfolgs-Gate

- Session Spicery 18.07.: Inline (SessionFieldsCard) UND Karte (kasse.tsx) zeigen beide **44,73 €**; PDF/Druck ebenso.
- Frank-Klicktest 17.07.: beide Anzeigen zeigen denselben Wert auf Basis **6.417,70 €** Haus-Umsatz.
- Ursache im Chat benannt (oben).
- CI + db-integration grün.
