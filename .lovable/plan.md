## Änderung (Minimal-Fix, nur Portal-Navigation)

Datei: `src/lib/nav/portal-nav.ts`

1. `payroll` in den persönlichen Mitarbeiter-Zweig aufnehmen — damit Viktoria wie jede/r Mitarbeiter/in „Mein COCO", „Abrechnung", „Lohn" und „Meine Daten" sieht:

   ```ts
   if (role === "admin" || role === "manager" || role === "payroll" || role === "staff") {
     // Mein COCO / Abrechnung / Lohn / Meine Daten
   }
   ```

2. `payroll` in den Backoffice-Zweig aufnehmen — damit die Kachel „Backoffice" erscheint:

   ```ts
   if (role === "admin" || role === "manager" || role === "payroll")
     items.push({ to: "/admin", label: "Backoffice", icon: LayoutDashboard });
   ```

Kein Eingriff in `admin/route.tsx`: das Gate leitet `payroll` bereits automatisch auf `/admin/zeit-uebersicht` um und zeigt dort die Payroll-Tab-Leiste mit „Arbeitszeiten" und „Mitarbeiter" (SD1). Keine RLS-/Rechte-Änderung, keine neuen Seiten, keine Freischaltung von BWA/Bilanz/Bankkonto/Statistik.

## Ergebnis

Viktoria sieht auf `/`:
- Mein COCO, Abrechnung, Lohn, Meine Daten (persönliche Kacheln)
- Backoffice → landet auf Arbeitszeiten mit Zugriff auf Mitarbeiter-Stammdaten
