## VA-UI: Inline-Bearbeitung EK + Klick auf Namen öffnet Dialog

Kleine UI-Anpassung in `src/routes/_authenticated/admin/bestellung.verkaufsartikel.tsx`. Keine Server-/Schema-Änderungen.

### Änderungen

1. **EK-Spalte inline editierbar (nur admin)**
   - Bisher reine Anzeige. Neu: gleiche `PriceCell`-Komponente wie Preis/Mitnahme, gebunden an `ekPriceCents`.
   - `PriceCell` bekommt einen dritten `field`-Wert `"ekPriceCents"` (Typ `PriceField` erweitern).
   - Speichern via bestehender `updateSalesArticle`-Mutation (`{ id, ekPriceCents }`). Server-seitige Admin-Prüfung (§VA3) bleibt unverändert.
   - Marge-Tooltip bleibt erhalten, wandert an die inline-Zelle.

2. **Spalte „Bearb." entfernen**
   - `<TableHead>` „Bearb." und die zugehörige `<TableCell>` mit dem Ghost-Button entfallen.

3. **Klick auf Artikelnamen öffnet Bearbeiten-Dialog**
   - Name-Zelle wird zu einem `button`, `onClick={() => setEditRow(row)}`.
   - Styling: linksbündig, `font-medium`, `hover:underline`, Fokus-Ring — bleibt visuell wie eine Zeile, wirkt aber klickbar.
   - `EditGroupsDialog` bleibt unverändert (Hierarchie + EK weiterhin dort editierbar für strukturelle Änderungen).

### Nicht angefasst

- `sales-articles.functions.ts`, Migrations, Typen, Auth.
- Aktiv-Switch bleibt.
- Preis/Mitnahme-Zellen (schon inline).

### Erfolgs-Gate

- `tsc`, `eslint`, `prettier`, `vitest` grün.
- Manuell: als Admin EK inline ändern → speichert; als Manager EK-Spalte fehlt weiterhin; Klick auf Namen öffnet Dialog; „Bearb."-Spalte weg.