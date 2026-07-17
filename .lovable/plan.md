
## Ziel

`/admin/locations` bekommt die gleiche zweistufige Tab-Optik wie `/admin/einstellungen`:

- **Ebene 1 — Standort-Tabs** (oben, horizontal): ein Tab pro Standort statt der Karten-Liste. Deaktivierte Standorte bleiben sichtbar (gedämpft mit „deaktiviert"-Badge).
- **Ebene 2 — Einstellungs-Tabs** (innerhalb des gewählten Standorts): eine Tab-Leiste für die verschiedenen Bereiche.

Reine UI-Umgruppierung. Keine Änderung an Server-Fns, RLS, Daten oder an den Panel-Komponenten selbst (`LocationCalendarPanel`, `LocationTipPoolPanel`, `DisplayPanel`, `GeofencePanel`).

## Neue Struktur

```text
[ spicery ] [ TSB (deaktiviert) ] [ YUM ] [ + Neu ]      ← Ebene 1 (Standort)

  Allgemein | Display | Kalender & Ruhetage | Trinkgeldpool | Geofence
  ───────────────────────────────────────────────────────    ← Ebene 2 (Bereich)

  <Inhalt des gewählten Bereichs>
```

**Ebene 2 — Tab-Aufteilung:**

| Tab | Inhalt (heute im aufgeklappten Row-Panel) |
| --- | --- |
| Allgemein | Name, Adresse, Kontakt, Lieferhinweise, Soll-Wechselgeld · unten: Speichern + Aktionen „Deaktivieren / Aktivieren" und „Löschen" |
| Display | `DisplayPanel` (heute per Button „Display" ein-/ausgeblendet) |
| Kalender & Ruhetage | `LocationCalendarPanel` |
| Trinkgeldpool | `LocationTipPoolPanel` |
| Geofence | `GeofencePanel` (Adresse geokodieren, Radius) |

**„+ Neu"** ersetzt den heutigen „Neu"-Button oben rechts: der letzte Eintrag der Standort-Tab-Leiste öffnet das bestehende Anlege-Formular in der Inhaltsfläche. Nach erfolgreichem Anlegen springt die Auswahl auf den neuen Standort.

## URL & Persistenz

Zwei Search-Params, damit Reload und Verlinkung die Position halten — analog zu `einstellungen.index.tsx`:

- `?loc=<uuid>` — aktiver Standort. Default: erster aktiver Standort. Ungültig/leer → Default.
- `?tab=<key>` — aktiver Bereich (`allgemein` | `display` | `kalender` | `trinkgeld` | `geofence`). Default: `allgemein`.
- Sonderwert `?loc=new` für den „+ Neu"-Tab.

`validateSearch` in `createFileRoute` sichert beide Werte typseitig ab (KGL-konform: Tab-Keys aus einer einzigen `SUB_TABS`-Konstante).

## Bestätigungs-Dialoge, Toast, Cache

- Bestehende `confirmDelete` / `confirmActive` Modals und Cache-Invalidierung mit Prefix `["admin","locations"]` bleiben 1:1 erhalten.
- Nach Löschen: Auswahl wechselt automatisch auf den ersten verbleibenden Standort (oder `?loc=new`, falls keiner mehr existiert).

## Was nicht angefasst wird

- Server-Funktionen (`listLocations`, `updateLocation`, `setLocationActive`, `deleteLocation`, `createLocation`, Geo-/Display-/Kalender-/Tip-Pool-Fns) bleiben unverändert.
- `LocationCalendarPanel`, `LocationTipPoolPanel`, `DisplayPanel`, `GeofencePanel`, `DetailsFields` werden nur verschoben, nicht umgebaut.
- Admin-Layout-Navigation (`route.tsx`) bleibt unverändert — „Standorte" bleibt ein Punkt unter „Einstellungen".
- `standortzeiten.tsx`, `einstellungen.index.tsx`, `einstellungen.easyorder-verwaltung.tsx` bleiben unangetastet.

## Technische Notizen

- Betroffene Datei: `src/routes/_authenticated/admin/locations.tsx` (die heutige `LocationRow`-Komponente wird durch einen Tab-Container ersetzt, ihre Teile werden auf die Sub-Tabs verteilt).
- Tab-Styling exakt wie `EINSTELLUNGEN_ALLGEMEIN_SUB` in `route.tsx` (`SYSTEM_SUB`-Optik) übernommen, damit die Konsistenz gewahrt bleibt.
- Nach der Umstellung ist der Editier-State pro Standort auf den `?loc`-Wechsel gebunden (State wird beim Tabwechsel neu aus Server-Daten geseedet — analog zum bisherigen `useEffect([props.loc])`).
- Prettier/ESLint vor Commit; Vier Check-Gates grün.

## Erfolgs-Gate

- Standort-Tab-Leiste zeigt alle Standorte inkl. Deaktivierte + „+ Neu".
- Wechsel zwischen Standorten aktualisiert `?loc`, Reload behält Auswahl.
- Innerhalb eines Standorts wechseln die fünf Bereichs-Tabs den Inhalt und schreiben `?tab`.
- Speichern (Allgemein), Display-Token-Regen, Kalender-Edit, Tip-Pool-Override und Geofence-Aktionen funktionieren wie bisher.
- Deaktivieren/Aktivieren/Löschen funktionieren aus dem „Allgemein"-Tab und aktualisieren die Tab-Leiste sofort.
