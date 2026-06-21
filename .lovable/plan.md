## Änderung in `src/components/cash/TipPoolCard.tsx`

In der Pool-Summenzeile beider Pools (Küche/Service):

- **"Rest: X,XX €" entfernen** (rechte Zelle der Footer-Zeile).
- **Stattdessen "Tip/h: X,XX €" anzeigen** = `poolCents / Summe(hoursWorked aller Zeilen)`, formatiert via `fmtCents`, Euro-genau.
- Bei 0 Stunden → `Tip/h: –` (keine Division durch 0).
- Spalten-Layout unverändert: Wert bleibt in der "Anteil"-Spalte rechtsbündig, monospace, `text-muted-foreground`.

Kein anderer Code, keine Logik-/Backend-Änderung. Der Rest (Cent-Verlust durch Euro-Abrundung) bleibt korrekt im Tagesbargeld — nur die UI-Anzeige verschwindet.

### Frage
Soll der Rest komplett verschwinden, oder zusätzlich klein als Tooltip am Pool-Total bleiben (für Audits)?