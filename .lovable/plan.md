## Fix: PeriodNav-Doppelpfeile vertauschen

Nur die Doppelpfeile sollen ihre Funktion tauschen — Einfachpfeile (2 Wochen) bleiben unverändert.

**Datei:** `src/components/roster/PeriodNav.tsx`

Am linken Doppelpfeil-Button (aktuell `ChevronsLeft` → `onPrevPeriod`):
- `onClick` → `onNextPeriod`
- Icon → `ChevronsRight`
- `disabled` → `!next`
- Tooltip → „Nächste Periode"

Am rechten Doppelpfeil-Button (aktuell `ChevronsRight` → `onNextPeriod`):
- `onClick` → `onPrevPeriod`
- Icon → `ChevronsLeft`
- `disabled` → `!prev`
- Tooltip → „Vorherige Periode"

Wait — das würde die Pfeile spiegelverkehrt zeigen. Sinnvoller: **Handler tauschen, Icons/Tooltips bleiben am Platz.** Also:

- Linker Button (`ChevronsLeft`, Tooltip „Vorherige Periode") ruft jetzt `onNextPeriod` auf → springt 1 Periode **vor**.
- Rechter Button (`ChevronsRight`, Tooltip „Nächste Periode") ruft jetzt `onPrevPeriod` auf → springt 1 Periode **zurück**.

Bitte bestätige welche Variante du meinst:

**A) Handler vertauschen, Icons bleiben** — dann zeigt der linke Doppelpfeil-Button optisch nach links, springt aber vorwärts. (Inkonsistent zur Optik.)

**B) Icons + Tooltips + Disabled-Logik vertauschen, Handler bleiben** — dann hat der linke Button `ChevronsRight` und der rechte `ChevronsLeft`. Optisch verwirrend in der Reihenfolge `Heute « ‹ Label › »`.

Bevor ich baue, brauche ich kurz die Bestätigung welche Lösung du willst — oder ob du in Wahrheit meinst, dass im aktuellen UI ein Klick auf `»` zurück und auf `«` vor springt (Bug in der Handler-Verdrahtung), und das einfach zur normalen Logik korrigiert werden soll.
