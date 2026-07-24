## Problem

Auf dem Mac (Safari) passiert beim Klick auf **PDF / Excel / CSV** in Zeit-Übersicht → Zusammenfassung und Buchhaltung nichts. Auf Windows/Chrome funktioniert es. Ursache liegt zentral in `src/lib/time/weekly-export.ts`:

```ts
a.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
```

Safari löst über synthetische `MouseEvent`-Dispatches keinen Download auf `<a download>` aus — nur der native `HTMLElement.click()`-Pfad triggert dort das Speichern. Chromium/Firefox akzeptieren beides, deshalb ist es nur auf dem Mac aufgefallen. Alle drei Exportknöpfe (Zusammenfassung PDF/Excel, Buchhaltung PDF/Excel/CSV, Wochenplan PDF/Excel, Lohn-Excel) laufen durch denselben Helfer, deswegen sind sie alle betroffen.

## Fix (rein presentational, ein Helfer, drei Ausgabewege)

`downloadBlobWithAnchor` in `src/lib/time/weekly-export.ts` von `dispatchEvent(new MouseEvent(...))` auf `a.click()` umstellen. Anker bleibt vorher im DOM (schon so), `URL.revokeObjectURL` bleibt bei 60 s (Safari-freundlich).

```ts
export function downloadBlobWithAnchor(blob: Blob, filename: string, a: HTMLAnchorElement): void {
  const url = URL.createObjectURL(blob);
  a.href = url;
  a.download = filename;
  a.rel = "noopener";
  a.style.display = "none";
  if (!document.body.contains(a)) document.body.appendChild(a);
  a.click();                       // Safari-kompatibel; Chrome/Firefox funktionieren weiterhin
  window.setTimeout(() => {
    a.remove();
    URL.revokeObjectURL(url);
  }, 60_000);
}
```

Keine weiteren Änderungen: `downloadBlob`, `prepareDownloadAnchor` und alle Aufrufer (`handlePayrollExportPdf/Xlsx/Csv`, `handleExportXlsx/Pdf`, Lohn-Excel-Export) bleiben unverändert — sie profitieren automatisch.

## Nicht in diesem Schritt

- Kein Umbau der Callsites (Regel 4 aus `project-knowledge`: keine Zusatz-Arbeit außerhalb des Auftrags).
- Kein Wechsel auf `FileSaver`/`msSaveBlob`/`showSaveFilePicker` — der native `a.click()`-Weg reicht für Safari 14+, Chrome, Edge, Firefox.
- Kein Test-Nachzug: Downloads sind DOM-Nebenwirkungen, die unsere Vitest-Umgebung nicht sinnvoll prüft.

## Verifikation

Nach dem Edit auf dem Mac (Safari + Chrome für macOS) einmal je Export klicken: Zusammenfassung → PDF/Excel, Buchhaltung → PDF/Excel/CSV. Datei muss im Downloads-Ordner landen, Dateiname unverändert (`Buchhaltung_<Standort>_<Periode>[_3b].<ext>`).
