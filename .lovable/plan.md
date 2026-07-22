## TB-4 — Vierer-Testblock (freigegeben, unverändert)

Reine Test-Arbeit, null Produktivlogik. Diff nur `*.test.ts` (+ `skipIf` in bestehender Datei).

**Zur SL2-R-Rückfrage:** ok, nur die zwei genannten Suiten umbauen. Beim Sichten fiel `src/lib/bestellung/order-replies-rls.db.test.ts` (SEC-02) mit ebenfalls ungeschütztem `beforeAll`-Seed auf — **wird gemeldet, NICHT still miterweitert**.

### 1) RN1-T (§107)

Neue Datei `src/lib/time/payroll-recurring-notes-rls.db.test.ts` nach Muster `order-replies-rls.db.test.ts`.

Seed via `org.service` (bypasst RLS): eine Zeile `payroll_recurring_notes` mit `organization_id`, `staff_id`, `kind: "note"`, `first_period_start: "2026-07-01"`, `text: "seed"`.

Assertions (Manager-Client aus `signInAsUser`):
- **(a) DIREKT-INSERT** wird abgelehnt: `.insert({ organization_id, staff_id, kind, first_period_start, text })` → `error !== null`; Service-Recount zeigt keine neue Zeile.
- **(b) DIREKT-UPDATE** wird abgelehnt: `.update({ text: "x" }).eq("id", seededId)` → `error !== null` oder betroffene Zeilen = 0; Service-Recheck zeigt `text` unverändert.

Positiv-Gegenprobe über Server-Fn wird **weggelassen** (Auth-Middleware-Aufbau außerhalb des Musters) — im Commit-Body erwähnt.

Cleanup: `service.from("payroll_recurring_notes").delete().eq("organization_id", org.orgId)` vor `org.cleanup()`.

### 2) SL2-R (§103)

Nur `src/lib/bestellung/order-replies.db.test.ts` und `src/lib/bestellung/order-replies-per-location.db.test.ts`.

Umsetzung: file-lokaler `retry(label, op)` (bis zu 3 Versuche, 500 ms Pause, erkennt `invalid response was received from the upstream server` analog `withDbInsertRetry` in `src/test/db-setup.ts`). Alle Service-Client-Seed-`.insert(...).select().single()`-Aufrufe in `beforeAll` und in den Test-Bodies (Reply-Inserts, Order-Inserts, Supplier-Inserts) werden in `retry(...)` gewrappt. Keine Assertion-Änderungen, keine `it`-Umschichtungen, kein neuer Export.

### 3) CP1 (§106)

Nur `src/lib/bank/bank-csv-parser.test.ts`, `describe("decodeCp1252")`-Block:

```ts
const hasCp1252 = (() => {
  try { new TextDecoder("windows-1252"); return true; } catch { return false; }
})();
// Lovable-Sandbox kennt kein 'windows-1252'-Label — dort sichtbar „skipped",
// CI/Prüfer laufen den Test voll.
it.skipIf(!hasCp1252)("dekodiert Umlaute korrekt (nicht als U+FFFD)", () => { … });
```

### 4) PY2-T (§105)

Datei existiert (`src/lib/time/buchhaltung-export-columns.test.ts`). Ein zusätzlicher Fall:

```ts
it("absenceNote ist niemals eine Spalte (nur Merge in 'besonderheiten')", () => {
  for (const mode of ["simple", "section3b"] as const) {
    expect(columns(mode).map((c) => c.key)).not.toContain("absenceNote");
  }
});
```

### Nicht anfassen

Produktivlogik, Migrationen, Policies, UI, Server-Fn, Router, `buchhaltung-export.ts`.

### Vor dem Commit

`npx prettier --write` + `npx eslint --fix` auf die geänderten Dateien. Dann Gates: `npx tsc --noEmit` (0), `npx eslint . --max-warnings=0`, `npx vitest run` (grün; cp1252 „skipped" in Sandbox), `npx prettier --check .`. Jede Abweichung wird VOR dem Commit gemeldet.

### Erfolgs-Gate

- Diff nur in Test-Dateien (+ `skipIf`-Gating).
- Lovable-Sandbox: cp1252 „skipped", Rest grün.
- CI `check` + `db-integration` grün.
- Vier §-Merkposten streichbar; separate Meldung zu `order-replies-rls.db.test.ts`-Seeds im Commit-/Chat-Report.
