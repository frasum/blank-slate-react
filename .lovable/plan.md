## Ziel

pdfjs-dist-Dublette im Client-Bundle beseitigen: alle vier Aufrufstellen auf den Legacy-Build vereinheitlichen (Safari-Kompatibilitäts-Obermenge). Erster formaler Feature-Branch nach §77.

## Branch

- Neuer Branch von `main`: **`feature/bundle-diet`**
- Solange offen: keine parallele Arbeit auf `main`.

## Änderungen (genau 4 Zeilen in 2 Dateien)

**`src/components/cash/PdfCanvasPreview.tsx`**
- Z2: `pdfjs-dist/build/pdf.worker.min.mjs?url` → `pdfjs-dist/legacy/build/pdf.worker.min.mjs?url`
- Z25: `await import("pdfjs-dist")` → `await import("pdfjs-dist/legacy/build/pdf.mjs")`

**`src/lib/payslips/split-combined.ts`**
- Z7: `pdfjs-dist/build/pdf.worker.min.mjs?url` → `pdfjs-dist/legacy/build/pdf.worker.min.mjs?url`
- Z30: `await import("pdfjs-dist")` → `await import("pdfjs-dist/legacy/build/pdf.mjs")`

## Nicht anfassen

- `bwa.tsx`, `bilanz.tsx` (bereits Legacy).
- `PdfCanvasPreview.tsx` NICHT löschen, auch wenn aktuell ungenutzt — Toten-Code-Entfernung ist separate Entscheidung.
- Keine Dependency-Änderungen, keine Migrationen, keine weiteren Dateien.

## Vor dem Commit

- `npx prettier --write .`
- `npx eslint --fix` auf den geänderten Dateien.

## Erfolgs-Gate (automatisch)

- `bun run tsc --noEmit` → 0 Fehler
- `npx eslint .` → 0 Fehler
- `npx prettier --check .` → sauber
- `npx vitest run` → 1628 grün
- Build: nur noch **ein** `pdf.worker.min-*.mjs` im Output.

## Erfolgs-Gate (manuell, vor Merge — Pflicht)

Frank testet auf dem Branch mit echten Daten in Safari UND Chrome:
1. `/admin/lohn-verteilung` → Sammel-PDF aufteilen → „N Seiten → M Mitarbeiter" korrekt, kein splitError.
2. DevTools → Netzwerk → Filter „worker": genau ein `pdf.worker.min-*.mjs` geladen.
3. `/admin/bwa` und `/admin/bilanz` — PDF-Textimport funktioniert unverändert.

Erst nach grünem Manuell-Test: PR → Claude-Review → Merge nach `main`.
