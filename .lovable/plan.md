## Ziel
Payroll-Nutzer landen nach dem Login direkt auf `/admin/zeit-uebersicht` (Arbeitszeiten) statt auf der Portal-Startseite mit Kacheln.

## Änderung
In `src/routes/_authenticated/index.tsx` den `beforeLoad`-Hook erweitern: wenn `identity.role === "payroll"`, `throw redirect({ to: "/admin/zeit-uebersicht" })`. Analog zur bestehenden `planer`-Weiche direkt darüber.

Das Admin-Gate in `src/routes/_authenticated/admin/route.tsx` erlaubt payroll bereits auf dieser Route und lenkt sonstige `/admin/*`-Aufrufe ohnehin auf `/admin/zeit-uebersicht` — keine weitere Anpassung nötig.

## Nicht enthalten
- Keine Änderung an der Portal-Navigation (payroll sieht bei manuellem Aufruf von `/` weiterhin die Kacheln — nur der Auto-Redirect nach Login ändert sich).
- Keine Rechte-Änderungen.
