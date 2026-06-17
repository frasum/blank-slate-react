## Ziel

Sowohl das **Standort-Select** als auch die **6-Button-Periodennavigation** (Heute · ‹‹ · ‹ · Monatslabel · › · ››) aus dem Header entfernen und gemeinsam **horizontal zentriert** über dem Dienstplan-Grid platzieren — in dem aktuell leeren Bereich oberhalb der Tagesleiste (DI MI DO …).

## Änderungen (nur Layout, keine Logik)

**`src/routes/_authenticated/admin/dienstplan.tsx`**

1. Aus dem `<header>` werden Standort-`<label><select>` und `<PeriodNav>` entfernt. Im Header bleibt nur Titel „Dienstplan" + optionaler Read-only/Locked-Hinweis.
2. Neue zentrierte Zeile direkt über `<RosterGrid>` (nach `PaintToolbar`/`SkillFilterChips`, vor dem Grid):
   ```tsx
   <div className="flex items-end justify-center gap-3">
     <label className="flex flex-col gap-1 text-xs">
       <span className="text-muted-foreground">Standort</span>
       <select … >…</select>
     </label>
     <PeriodNav … />
   </div>
   ```
3. Props, State, Datenfluss, Realtime, Grid unverändert.

## Nicht angefasst

- `PeriodNav.tsx`
- Filter-Chips, Küche/Service-Tabs, Grid, Server-Functions
- Keine neuen Abhängigkeiten

## Erfolgskriterium

Standort-Select und PeriodNav stehen gemeinsam mittig über der Tagesleiste; Header zeigt nur noch den Titel; `tsc --noEmit` grün.
