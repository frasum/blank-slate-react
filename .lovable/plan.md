## Ziel
Monats-/Periodennavigation im Dienstplan visuell und funktional wie in `thaitime.pro` (siehe `src/components/schedule/ScheduleGridToolbar.tsx`):

```
[ Heute ]  [‹‹]  [‹]   Juni 2026   [›]  [››]
```

- runde weiße Buttons mit grauem Rand, `h-10`
- „Heute" als Pille mit Text, Pfeile als `w-10 h-10` Kreise
- Label zentriert mit `text-sm font-semibold min-w-32`
- Tooltips wie im Original

Da unsere Perioden monatsweise in der DB liegen (keine Halbmonats-Logik), mappen wir die Pfeile auf die `periods`-Liste:

| Button | Aktion |
|---|---|
| Heute | Periode, die `today` enthält (Fallback: erste Periode) |
| ‹‹ | erste Periode in der Liste |
| ‹ | vorherige Periode (Index −1) |
| › | nächste Periode (Index +1) |
| ›› | letzte Periode in der Liste |

Buttons werden disabled, wenn am Rand. Periode-Select entfällt komplett; Label zeigt `period.label` (z. B. „Juni 2026").

## Änderungen

### 1. `src/components/roster/PeriodNav.tsx` — **neu**
Reine Präsentations-Komponente nach dem Vorbild von thaitime:
- Props: `periods`, `currentPeriodId`, `today`, `onSelect(periodId)`
- Berechnet `prev`/`next`/`first`/`last`/`todayPeriod` aus Props
- Rendert die 6-Button-Leiste mit `lucide-react` (`ChevronLeft`, `ChevronRight`, `ChevronsLeft`, `ChevronsRight`)
- `TooltipProvider` ist schon im Page-Scope vorhanden — Komponente nutzt nur `Tooltip`/`TooltipTrigger`/`TooltipContent`

### 2. `src/routes/_authenticated/admin/dienstplan.tsx`
- Periode-`<label>`/`<select>` entfernen
- Statt dessen `<PeriodNav periods={periods} currentPeriodId={effectivePeriod?.id ?? null} today={today} onSelect={setPeriodId} />` im Header rendern
- Standort-Select bleibt, Header-Layout bleibt (neben „Dienstplan")

## Nicht angefasst
Standort-Select, Datenfluss, Saldo/Kasse, Pillen-Logik, Server-Funktionen.

## Erfolgskriterium
6-Button-Leiste statt Dropdown, optisch wie thaitime; „Heute" springt zur aktuellen Periode; Pfeile blättern in der Perioden-Reihenfolge; Buttons am Rand sind disabled; `tsc --noEmit` und ESLint grün.