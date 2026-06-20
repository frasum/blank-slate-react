## Ziel
Verschluckten DB-Fehler im Auto-Ausstempel-Pfad von `submitWaiterSettlementCore` beheben, um doppelte Ausstempelung bei transienten Update-Fehlern zu verhindern.

## Änderung
Genau ein Block in `src/lib/cash/cash.functions.ts` (ca. Zeile 1457–1463):

```ts
if (autoClockoutId) {
  const { error: linkErr } = await supabaseAdmin
    .from("waiter_settlements")
    .update({ auto_clockout_time_entry_id: autoClockoutId })
    .eq("id", settlementId)
    .eq("organization_id", caller.organizationId);
  if (linkErr) throw linkErr;
}
```

Analog zum bestehenden Muster in derselben Datei (`if (error) throw error;`).

## Nicht angefasst
- Alles andere in `cash.functions.ts`
- Keine weiteren Refactorings, keine Tests-/Typänderungen

## Verifikation
- `tsc` grün
- `eslint .` grün
- `vitest` grün (insb. `cash-submit.db.test.ts` Happy-Path + Idempotenz unverändert)
