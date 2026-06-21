## Teil A — Toten Demo-Code entfernen
- `src/lib/api/example.functions.ts` löschen.
- `src/lib/config.server.ts` löschen (einziger Importeur ist `example.functions.ts`).
- `src/lib/api/` entfernen (dann leer).

## Teil B — `makeAuditWriter` zentralisieren
- In `src/lib/admin/audit.ts` `export function makeAuditWriter(caller)` mit kanonischem Body anlegen.
- Lokale Kopien in **15** Dateien entfernen und stattdessen importieren:
  - `admin/*` (7): `account`, `badges`, `locations`, `pin`, `staff` → `from "./audit"`
  - `bestellung/*` (6): `articles`, `easyorder-admin`, `inventory`, `order-units`, `orders`, `suppliers` → `from "@/lib/admin/audit"`
  - `cash/cash.functions.ts`, `roster/leave.functions.ts`, `roster/roster.functions.ts`, `time/time-admin.functions.ts` → `from "@/lib/admin/audit"`
- Vor jeder Ersetzung Body byte-vergleichen; bei Abweichung stoppen + Datei melden (Stop-Bedingung).

Hinweis: Liste enthält neben den im Briefing genannten Dateien zusätzlich `bestellung/articles`, `inventory`, `order-units`, `orders`, `suppliers` — diese tauchen ebenfalls in `grep -rln "function makeAuditWriter" src/lib` auf, das deckt sich mit der „und alle weiteren"-Klausel im Briefing.

## Teil C — Geld-Formatierung deduplizieren

### C.2 (sicher, wird ausgeführt)
- `src/routes/_authenticated/admin/trinkgeld-rest.tsx`: lokales `fmtCents` (Z. 20) entfernen, `import { fmtCents } from "@/lib/format"` ergänzen. Body ist byte-identisch mit `format.ts`, JSX hängt selbst `" €"` an → kein Verhaltensunterschied.

### C.1 (Konflikt → Rückfrage statt stiller Änderung)
`src/lib/cash/pdfExport.ts` `fmtEur` weicht vom kanonischen `fmtCents` ab:

```ts
// pdfExport.fmtEur:
new Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" }).format(v)
// → "1.234,56 €"

// format.ts fmtCents:
v.toLocaleString("de-DE", { minimumFractionDigits: 2, maximumFractionDigits: 2 })
// → "1.234,56"  (kein €-Symbol)
```

Per Stop-Bedingung im Briefing („NICHT auf gut Glück tauschen") wird hier nichts blind getauscht. Drei Optionen — bitte entscheiden, bevor ich Teil C.1 anfasse:

1. **Überspringen** — `pdfExport.fmtEur` bleibt, da PDF-Spalten das „€"-Symbol mitführen.
2. **`fmtCents` angleichen** auf `Intl.NumberFormat("de-DE", { style: "currency", currency: "EUR" })`. Bricht aber alle Aufrufer, die selbst „ €" anhängen (mind. `trinkgeld-rest.tsx`, vermutlich weitere) → wäre Verhaltensänderung, nicht reines Refactoring.
3. **Zweite Helper-Funktion** `fmtEuroSymbol` in `format.ts` ergänzen und `pdfExport` darauf umstellen. Trinkgeld bleibt bei `fmtCents`.

Meine Empfehlung: **Option 1** (überspringen) für diesen Refactor-Schritt, sauberer als „Symbol-Variante" jetzt mit einzuführen.

## Gate & Commit
- `prettier --write src/`, `eslint --fix src/`, `tsc --noEmit`, `eslint .`, `vitest run` muss bei 738 grün bleiben.
- Ein Commit: `Refactor: toten Demo-Code entfernt, makeAuditWriter + fmtCents zentralisiert`.

## Offene Frage
Welche Option für Teil C.1 (pdfExport `fmtEur`)? Ohne Antwort führe ich nur A, B und C.2 aus.
