## Ziel
PDF-Export der Tagesabrechnung soll nur möglich sein, wenn `guest_count > 0`. Bei Klick ohne Gästeanzahl: Toast-Hinweis, kein Export.

## Änderung
Datei: `src/routes/_authenticated/admin/kasse.tsx`

In `handleExportPdf()` (Zeile 321) gleich nach dem Session-Check ergänzen:

```ts
const guests = ov.session.guest_count ?? 0;
if (guests <= 0) {
  toast.error("Bitte zuerst die Gästeanzahl eintragen.");
  return;
}
```

Zusätzlich der PDF-Export-Button (Zeile 436) bekommt `disabled={(ovQ.data?.session?.guest_count ?? 0) <= 0}`, damit der gesperrte Zustand sichtbar ist. Tooltip via `title="Gästeanzahl fehlt"` wenn deaktiviert.

Kein Änderungsbedarf an `pdfExport.ts`, Tests oder Schema.

## Nicht anfassen
- pdfExport-Modul
- Speicher-Logik der Gästeanzahl (bereits über `misc.guestCount`/Save vorhanden)
- Cash-/Settlement-Pfade
