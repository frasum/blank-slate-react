## Ziel

1. **Brand-Rename:** "Betriebsplattform" → großes **COCO** mit Untertitel *Central Operation Cockpit*. Konsistent auf Home (`/`), Auth-Seite, `<title>` und Admin-Header.
2. **UI-Polish** für die zwei gezeigten Screens (Home-Hub + Admin/Verwaltung), ohne Funktionsänderung.

## Scope (Frontend-only, keine Logik-Änderung)

### Brand-Lockup (neue Komponente `src/components/brand-lockup.tsx`)
- `COCO` in großer, tighter Display-Schrift (`text-5xl md:text-6xl font-black tracking-tight`)
- Subtitle `Central Operation Cockpit` darunter (`text-xs md:text-sm uppercase tracking-[0.3em] text-muted-foreground`)
- Größenvariante `sm` für Admin-Header (kleiner, einzeilig: `COCO` + dezenter Subtitle daneben)

### Home (`src/routes/_authenticated/index.tsx`)
- Headline durch `<BrandLockup size="lg" />` ersetzen
- Identity-Zeile als dezenten Badge stylen (Pill mit Border, Punkt-Indikator)
- Buttons: gleiche Breite, etwas mehr `py-3`, sanfte Hover-/Focus-States, subtile Trennung zwischen Haupt-Aktionen (Zeiterfassung/Abrechnung/Verwaltung) und „Abmelden" (kleiner, Ghost-Variante, mit Abstand)
- Hintergrund: dezenter Radial-Gradient (`bg-background` + sehr leichter Akzent), zentrierte Karte mit `max-w-sm`

### Admin-Header (`src/routes/_authenticated/admin/...` Layout)
- Header-Bar: links `<BrandLockup size="sm" />` + Trennstrich + aktueller Bereich („Verwaltung"), rechts „← Zurück"
- Sub-Nav (Mitarbeiter/Zeit/Zeitübersicht/…) in zweite Zeile mit Underline-Active-State (statt fett+normal)
- Cards (Mitarbeiter/Standorte): Hover-State (subtle shadow + border-accent), Pfeil-Icon rechts

### Meta / Tab-Title
- `<title>` überall auf `COCO – Central Operation Cockpit`
- Auth-Route Headline ebenfalls Brand-Lockup

### Token-Hygiene
- Keine Hex-Werte / `text-white` etc. – alles über bestehende semantische Tokens in `src/styles.css`. Falls eine sehr dezente Akzent-Variable fehlt, wird sie dort ergänzt (kein Theme-Umbau).

## Out of scope
- Keine Änderung an Routen, Daten, Auth, Logik.
- Keine neue Farbpalette / Font-Wechsel (Fonts bleiben wie aktuell; falls gewünscht, separater Schritt).
- Admin-Sub-Seiten (Mitarbeiter-Editor etc.) bleiben unverändert.

## Offene Frage (optional)
Falls du **eigene Schrift/Farbpalette** für COCO willst (z. B. Display-Font für das Logo, Akzentfarbe), sag Bescheid – sonst bleibe ich beim aktuellen System.
