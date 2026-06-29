## Ziel
U4 — client-seitiger PDF-Export für die M-Statistik-Seite. Neuer Helfer + Export-Button auf `statistik.tsx`. **Keine** neuen Server-Fns, **keine** Migration, **keine** Berechnungslogik in `src/lib/statistics/*`.

Deps bereits vorhanden: `jspdf@4.2.1`, `jspdf-autotable@5.0.8`, `date-fns@4.1.0` — kein `bun add`.

## Datei 1 (neu) — `src/lib/statistics/statistik-pdf.ts`

Muster wie `src/lib/cash/pdfExport.ts`: dynamische `jspdf`/`jspdf-autotable`-Imports, kein `Buffer`, kein `node:`-Modul.

- Export `StatistikPdfData` exakt wie im Auftrag (Umsatz, Tips inkl. `perStaff`, Personal mit `ratioPct: number | null` und `staffWithoutRateNames`, `dailyRevenue`, `comparison`).
- `generateStatistikPdf(data): Promise<{ doc: jsPDF; blob: Blob; fileName: string }>`:
  - `import type jsPDF from "jspdf"` für Rückgabetyp; konkret `(await import("jspdf")).default`.
  - `autoTable(doc, {...})` v5-Funktionsform.
  - Folge-Tabellen positionieren via `(doc as unknown as { lastAutoTable: { finalY: number } }).lastAutoTable.finalY` — einzige zulässige Cast-Stelle.
  - Geld immer `fmtCents`, Prozent `toFixed(1)`, Stunden `toFixed(2)`.
- Abschnitte (Reihenfolge):
  1. Kopf: „Statistik-Bericht" + zentrierte Sub-Zeile `monthLabel · scopeLabel`.
  2. Umsatz: Tabelle Haus/Takeaway/Gesamt + Zeile „Tage mit Umsatz: N".
  3. Trinkgeld: Service/Küche/Gesamt + Tabelle „Trinkgeld pro Mitarbeiter" (Name, Bereich „Service"/„Küche", Betrag rechtsbündig).
  4. Personal: Netto-Std., Basis-Lohnkosten, Personalquote (`null → "—"` sonst `toFixed(1)+" %"`). Kleine Fußnote „Basis-Brutto (Netto-Stunden × Stundenlohn) — ohne AG-SV, SFN, Zweitsatz." Falls `staffWithoutRateNames.length>0`: Zusatzzeile „Ohne hinterlegten Stundenlohn: <Namen> — Quote untertreibt." (mit `splitTextToSize`).
  5. Umsatzverlauf: Tagestabelle (Datum, Haus, Takeaway, Gesamt) aus `dailyRevenue`; autoTable bricht selbst um.
  6. Standort-Vergleich: Tabelle (Standort, Umsatz, Trinkgeld, Personalquote, Netto-Std., Basis-Lohnkosten). `hasMissingRate` → `*` an der Quote, Fußnote unter der Tabelle.
- `fileName = \`Statistik_${monthLabel.replace(/\s+/g,"-")}_${scopeLabel.replace(/\s+/g,"-")}.pdf\``.

## Datei 2 — `src/routes/_authenticated/admin/statistik.tsx`

- Neue Imports: `Button` (`@/components/ui/button`), `Download` (lucide), `format` (`date-fns`), `de` (`date-fns/locale`), `generateStatistikPdf` + Typ `StatistikPdfData`.
- Compare-Queries (`revQueries`/`tipQueries`/`perQueries`) genau einmal in `StatistikPage` deklarieren und als Props an `LocationCompareSection` reichen. **Markup und Zeilen der Vergleichstabelle bleiben byte-identisch zu U3** — nur Datenquelle wechselt von intern zu Props.
- Export-Handler in `StatistikPage`:
  - `monthLabel = format(new Date(month + "-01T00:00:00"), "LLLL yyyy", { locale: de })`.
  - `scopeLabel = locationFilter === "all" ? "Alle Standorte" : (locations.find(l => l.id === locationFilter)?.name ?? "Standort")`.
  - `revenue/tips/personnel` aus `statsQ.data`/`tipsQ.data`/`personnelQ.data`; `personnel.ratioPct = personnelRatioPct(laborCostCents, statsQ.summary.totalCents)`; `staffWithoutRateNames` über `personnel.perStaff` mappen.
  - `dailyRevenue = statsQ.data.daily`.
  - `comparison`: Index-Zip über `locations` × `revQueries`/`tipQueries`/`perQueries`. Nur Standorte aufnehmen, deren alle drei Queries `data` haben; `ratioPct` via `personnelRatioPct`; `hasMissingRate = per.staffWithoutRate.length > 0`.
  - `const { doc, fileName } = await generateStatistikPdf(data); doc.save(fileName);`.
- Button-Platzierung: in der Filter-Card oben rechts (`ml-auto`), Label „PDF" mit `Download`-Icon.
- `disabled` solange `!statsQ.data || !tipsQ.data || !personnelQ.data` oder Compare noch lädt / Fehler hat — kein PDF aus halben Daten.

## Stil / Fallen
- Kein `any` außer dokumentierter `lastAutoTable`-Cast.
- Kein `Buffer`, kein `node:`-Import.
- Keine `hsl(var(--…))`-Farben im PDF (jsPDF nutzt RGB).
- Compare-Queries existieren genau einmal — keine Doppel-Queries.

## Nicht angefasst
- `src/lib/statistics/*`-Berechnungen, Server-Fns, Schema, Migrationen.
- `src/lib/cash/pdfExport.ts` (nur Vorlage).
- U1–U3-Markup außer dem neuen Button und dem Prop-Durchreichen.

## Verifikation
- `bunx tsgo --noEmit`, `bunx eslint src/ --max-warnings=5`, `bunx vitest run` grün.
- `npx prettier --write src/` + `npx eslint --fix` vor Abschluss.
- Manueller E2E: Button erzeugt PDF mit allen sechs Abschnitten; Monat/Standort im Kopf korrekt; Personalquote-Fußnote + `staffWithoutRate`-Hinweis vorhanden; Vergleichstabelle listet alle Standorte; Button disabled bei unvollständigen Daten.
