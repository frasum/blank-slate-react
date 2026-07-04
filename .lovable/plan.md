## Ziel

Im Standort **YUM** wird die Zeile „Finedine-Gutscheine" in der Tagesabrechnung nicht mehr angeboten (sie gehört nur zu spicery). Andere Standorte bleiben unverändert.

## Änderungen

1. **`src/components/cash/SessionFieldsCard.tsx`**
   - Neues optionales Prop `locationName?: string` in die Prop-Signatur aufnehmen.
   - Im Block „Gutscheine & Sonstiges" die `ExcelInputRow` für „Finedine-Gutscheine" nur rendern, wenn `locationName !== "YUM"`.
   - Für YUM wird `misc.finedineVouchers` weiterhin mit dem Session-Wert initialisiert (falls historisch >0), aber ohne UI-Zeile — der Wert fließt unverändert in `finedine_vouchers_cents` im Save-Payload. Damit bleiben bestehende Datensätze/Migration unangetastet.

2. **`src/routes/_authenticated/admin/kasse.tsx`**
   - Beim Aufruf von `<SessionFieldsCard ... />` (Z. ~536) `locationName={currentLocation?.name}` mitgeben (Variable existiert bereits, Z. 170).

## Bewusst NICHT anfassen

- Kein Schema-/Migrations-Change, keine RLS-Anpassung.
- `pdfExport.ts` (versteckt die Zeile ohnehin schon, wenn Wert = 0), `cash-ledger`, `session-channels`, `telegram-report.server`, `bargeld-export` — alle unverändert.
- Andere Standorte (spicery, TSB) unverändert.
- Keine Umbenennung, kein neues Location-Feature-Flag (Detektion per Name reicht für diesen Einzelfall; falls YUM je umbenannt wird, kann eine Config-Spalte nachgereicht werden).

## Erfolgs-Gate

- `tsc --noEmit` 0, `eslint --max-warnings=0` 0, `prettier --check` sauber, `vitest run` grün (keine neuen Tests nötig, reine UI-Sichtbarkeit).
- Manueller E2E: Standort YUM auswählen → in „Gutscheine & Sonstiges" fehlt die Finedine-Zeile; spicery auswählen → Zeile ist da wie bisher.
