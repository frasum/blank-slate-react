## Problem

Der Lohn-Tab im Mitarbeiter-Detail (`/admin/staff/$staffId`, Tab „Lohn") zeigt „Noch keine Lohnabrechnungen hinterlegt", obwohl im Storage-Bucket `payslips` Dateien unter `{org_id}/{staff_id}/...` liegen (per Sammel-Upload aus Lohn-Verteilung erzeugt). Pfad-Konvention und Server-Fn `listStaffPayslips` sehen formal korrekt aus — d.h. die Daten landen, werden aber im UI nicht gelistet.

## Vorgehen

1. **Reproduktion & Diagnose** an einem Mitarbeiter, bei dem laut DB eine Datei im Ordner liegt (z. B. `b209bc94-…`):
   - Server-Fn `listStaffPayslips` mit dieser staff_id über die Konsole aufrufen und Rückgabe prüfen.
   - Falls leer: in `src/lib/payslips/payslips.functions.ts → listFolder()` testweise loggen, was `supabaseAdmin.storage.from("payslips").list(folder, …)` liefert (Anzahl, Fehler).
   - Häufigste Ursachen bei Supabase-Storage `list()`: (a) `sortBy.column: "created_at"` wird vom Storage-Endpoint je nach Version nicht akzeptiert und liefert leeres Array, (b) fehlender `limit`-Parameter führt zu 0 Treffern bei alten Clients, (c) `.list("a/b")` mit verschachteltem Pfad braucht auf manchen Versionen ein leeres `prefix` zusätzlich.

2. **Fix in `listFolder`** je nach Befund — wahrscheinlich:
   - `limit: 1000, offset: 0` ergänzen.
   - `sortBy` weglassen oder auf `{ column: "name", order: "asc" }` umstellen und clientseitig nach `created_at` sortieren.
   - Aufruferreihenfolge prüfen: `list(folder)` ohne führenden/abschließenden Slash.

3. **Selbe Korrektur** auf `listMyPayslips` und die Auflistung in `/lohn` (gleicher Helfer) anwenden, damit das Verhalten dort konsistent bleibt.

4. **Smoke-Test**:
   - Mitarbeiter mit bekannt vorhandener PDF (`b209bc94-676b-4d8d-b95e-f7ee768b4095`) öffnen → Datei muss erscheinen, „Öffnen" liefert signierte URL.
   - Neuer Upload über den Tab → Liste aktualisiert sich.
   - Lösch-Button entfernt die Datei.

5. **Kein Touch** an Bucket-Pfaden, RLS-Policies oder der Sammel-Splitter-Logik — die schreiben in den richtigen Ordner, das ist bereits verifiziert (20 Dateien sichtbar in `storage.objects`).

## Technische Notizen

- Datei: `src/lib/payslips/payslips.functions.ts` (Helper `listFolder`).
- Kein DB-Migrationsbedarf, kein neuer Tab — der Tab `Lohn` existiert bereits in `src/routes/_authenticated/admin/staff.$staffId.tsx` Z. 97 und rendert `PayslipsTab` (Z. 864 ff.) korrekt.
- Server-Fn nutzt `supabaseAdmin` → RLS auf `storage.objects` ist nicht die Ursache.
