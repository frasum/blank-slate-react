Ziel: Der Schichttausch-Bereich lebt künftig unter dem bisherigen Urlaubsanträge-Tab, und das Tab-Label heißt „Urlaubsantrag / Schichttausch". Nur Umzug + Umbenennung, keine Logikänderung an Tausch/Urlaub.

## Änderungen

**1. Sub-Nav umbenennen** — `src/routes/_authenticated/admin/route.tsx`
- Zeile 76: `label: "Urlaubsanträge"` → `label: "Urlaubsantrag / Schichttausch"`.
- Prefixes bleiben (`/admin/urlaub`). Badge-Punkt (rot) erweitern: die Route zeigt heute nur einen Punkt bei `pendingLeave`; ergänzen um `pendingSwaps` (peer_accepted), damit auf offene Tauschfreigaben hingewiesen wird. Datenquelle ist bereits `admin-review-pending-counts` (falls dort `swaps` nicht enthalten ist, wird eine separate leichte Query `["admin","swap-requests"]` ergänzt und `.filter(status==="peer_accepted").length` verwendet).

**2. Schichttausch in Urlaubsseite integrieren** — `src/routes/_authenticated/admin/urlaub.tsx`
- Seitentitel bleibt inhaltlich; H1 wird zu **„Urlaubsanträge & Schichttausch"** (Subtitel angepasst). Head-Meta `title` analog.
- Struktur mit zwei internen Tabs (shadcn `Tabs`): 
  - „Urlaubsanträge" (bisheriger Inhalt inkl. Jahresplaner)
  - „Schichttausch" (neuer Inhalt, siehe unten)
- Die Filter-Buttons (Offen/Genehmigt/…) und `VacationPlannerSection` bleiben im Urlaubs-Tab.

**3. `SwapsTab` in eine wiederverwendbare Komponente extrahieren**
- Neue Datei `src/components/tausch/AdminSwapsPanel.tsx` mit dem heutigen Inhalt aus `personal-antraege.tsx` (Funktionen `SwapsTab`, `SwapCard`, Helper `fmtDeDay`, `areaLabel` — `fmtDateTime` bleibt Helper und wandert mit oder wird lokal reimplementiert).
- Verhalten & Query-Keys unverändert (`["admin","swap-requests"]`, Server-Fns `listPendingSwaps`, `decideSwapRequest`).

**4. `personal-antraege` aufräumen** — `src/routes/_authenticated/admin/personal-antraege.tsx`
- Der Tab „Schichttausch" wird entfernt (nur noch „Anträge" und „Dokumente"), sowie `swapsQ` und `pendingSwaps`, damit es keinen doppelten Ort mehr gibt.
- Badge-Logik oben in `route.tsx` (Punkt am Menüpunkt „Stammdaten & Dokumente") berücksichtigt keine Swaps mehr.

## Nicht angefasst
- Server-Funktionen (`listPendingSwaps`, `decideSwapRequest`, Leave-Fns), RLS, Datenmodell, PDF/Telegram.
- Mitarbeiter-Sicht auf `/zeit/schichten` (Anfragen/eigene Anfragen) bleibt unverändert.

## Erfolgs-Gate
- `tsgo --noEmit` 0, `eslint --max-warnings=0` 0, `prettier --check` sauber, `vitest run` grün.
- Manueller E2E: Menü zeigt „Urlaubsantrag / Schichttausch"; Seite hat zwei interne Tabs; Genehmigen/Ablehnen eines Tauschs funktioniert dort exakt wie vorher; „Stammdaten & Dokumente" enthält keinen Schichttausch-Tab mehr.

## Frage
Soll der Schichttausch aus „Stammdaten & Dokumente" tatsächlich **verschwinden** (empfohlen, kein Doppelort), oder an **beiden** Orten sichtbar bleiben? Standardannahme: entfernen.