## Ziel
Die Unter-Tabs im Bereich **Einstellungen → Allgemein** (Trinkgeldpool · Bestellungen · Sofortmeldung & Arbeitgeber · Telegram) sollen optisch/strukturell exakt wie die Sub-Sub-Tabs unter **Einstellungen → System** (Migration · Zuordnungen · Lohn PDF Import) aussehen — also in der Header-Tab-Leiste, mit demselben `tabClass`-Styling wie alle anderen Admin-Tabs, statt als eigenständige Button-Reihe innerhalb der Seite.

## Änderungen

### 1) `src/routes/_authenticated/admin/route.tsx`
- Analog zu `SYSTEM_SUB` eine neue lokale Liste `EINSTELLUNGEN_ALLGEMEIN_SUB` mit den vier Tab-Keys anlegen:
  - Trinkgeldpool → `?tab=trinkgeldpool`
  - Bestellungen → `?tab=bestellungen`
  - Sofortmeldung & Arbeitgeber → `?tab=sofortmeldung`
  - Telegram → `?tab=telegram`
- Nach dem bestehenden `isSystemPath`-Block eine dritte Nav-Zeile rendern, wenn `pathname === "/admin/einstellungen"`. Dieselbe Markup-Struktur (`nav.flex.flex-wrap … border-b border-border/60 pt-2 text-xs`) und derselbe `tabClass(active)`-Helper wie bei System.
- Aktivität wird über den `?tab=`-Search-Param bestimmt (Default `trinkgeldpool`, wenn nicht gesetzt). `Link` bekommt `to="/admin/einstellungen"` + `search={{ tab: … }}`.

### 2) `src/routes/_authenticated/admin/einstellungen.index.tsx`
- Die interne Tab-Leiste (`<div role="tablist">` mit den vier `<button>`s) entfernen — sie wird jetzt vom Layout gerendert.
- Alles andere (Search-Param `tab`, Route-Validator, State, Mutations, Sektionen) bleibt unverändert.
- Der Seiten-Header (`Einstellungen` / „Organisationsweite Geschäftsregeln…") bleibt erhalten.

## Technische Details
- Kein Umbau der Server-Functions, kein Verhalten geändert — reine UI-Umgruppierung.
- Der bestehende `validateSearch`-Filter in `einstellungen.index.tsx` sorgt weiterhin dafür, dass unbekannte `tab`-Werte auf `trinkgeldpool` zurückfallen.
- `tabClass` liefert automatisch das aktive Pill-Styling, dadurch sieht die Leiste 1:1 wie System und alle anderen Sub-Navs aus.
