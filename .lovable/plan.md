## Ziel

Nur Doku-Fix in `docs/arbeitsweise.md`. Kein Code, kein Schema, keine weiteren Dateien.

## Änderungen

**Datei:** `docs/arbeitsweise.md`

1. **Zeile 122 ersetzen:**

   Vorher:
   ```
   | D3 Öffentliches Display (Token-URL, Auto-Refresh, Rotation, Legende)                  | ⏳ offen |
   ```
   Nachher:
   ```
   | D3 Display — Token + Auto-Refresh + Daten ✅; Rotation/Legende/Geburtstag offen | 🔄 teilw. |
   ```

2. **Absatz Zeile 184 (`**Offen aus B3/B4** …`) komplett ersetzen** durch den reconciled-Block:

   ```markdown
   **Stand B3/B4 (reconciled 17.06.2026):**

   - **Trinkgeld-Pool-Verteilung — erledigt:** `src/lib/cash/tip-pool.ts` (reine Verteilung nach Stunden, getestet), `session_tip_pool_entries`, Küchen-/Mitarbeiter-Pool, `tip_pool_settlement_only`.

   - **Kassen-Saldo + Excel-Export — vorhanden:** `/admin/kasse-saldo` (`bargeld-export.ts`, „Export Excel").

   - **Wirklich offen:**
     - **Provision (wochenbasiert)** — umsatzbasierte Commission-Formel (`commissionPct`/`minRevenue`: Pool/Tag = Σ max(0,(Umsatz − minRevenue × Kellnerzahl) × %)). Kein Modul/Tabelle im Code. (= der separate „Provision"-⏳-Eintrag.)
     - **D-M2-1 Auto-Ausstempeln bei Abrechnungs-Abgabe** — im Code nicht vorhanden; erst damit stempelt das Team in COCO um.
     - **B3c-1 manuelles E2E** des Trinkgeld-/Abrechnungs-Pfads.
     - **D3-Display-Rest:** Bereichs-Rotation, Legende (X/–/U/K/B/♡), Geburtstags-Banner.
   ```

## Nach dem Edit

- `npx prettier --write docs/` ausführen.

## Nicht-Ziele

Alle anderen Tabellenzeilen, jeglicher Code, alle anderen Dateien — unangetastet. Insbesondere keine Änderungen an `gruendungsdokument.md` oder der Kasse-UI.

## Erfolgs-Gate

- `rg -n "Trinkgeld-Pool-Verteilung.*offen" docs/arbeitsweise.md` → keine Treffer.
- Zeile zu D3 enthält „teilw.".
- `tsc`/Build unverändert grün (reine Doku-Änderung).
