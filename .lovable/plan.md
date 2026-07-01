## Ziel
Der Admin kann eine bereits abgeschlossene Session (Status `finalized`) auf einem Vortag wieder auf `open` setzen, um alle Felder erneut zu bearbeiten. Bei `locked` bleibt die Session gesperrt (Waterline schützt das Bank-Deposit).

## Flow im Alltag
1. Admin öffnet `/admin/kasse`.
2. Oben über den `DateSelector` das gewünschte Datum (z. B. gestern) wählen.
3. Ist die Session `finalized`, erscheint neben dem Status-Badge ein neuer Button **„Session wieder öffnen"**.
4. Klick öffnet einen Bestätigungsdialog mit Hinweis, dass die Aktion protokolliert wird.
5. Nach Bestätigung ist die Session `open`, alle Felder editierbar (inkl. Auto-Save wie gehabt).
6. Wenn die Session `locked` ist (Waterline erreicht), bleibt nur der Read-Only-Modus — der Button erscheint nicht.

## Umsetzung

**Backend — `src/lib/cash/cash.functions.ts`**
- Neue Server-Fn `reopenSession` + `reopenSessionCore`:
  - `requireSupabaseAuth` + `loadAdminCaller(..., "admin")` (nur Admin, wie gewünscht).
  - Session laden, Guard: nur wenn `status === "finalized"` **und** `businessDate > cashLockedThroughDate` (nicht unter Waterline).
  - Update `status='open'`, `finalized_at=null`, `finalized_by=null`.
  - Audit-Log: `cash.session.reopened` mit `businessDate`, `previousFinalizedAt`.

**UI — `src/routes/_authenticated/admin/kasse.tsx`**
- Neuen `reopenMut` mit `useMutation` an `callReopenSession` binden.
- Button „Session wieder öffnen" rendern, wenn:
  - `caller.role === 'admin'`
  - `sessionStatus === 'finalized'`
  - `!underWaterline`
- Bestätigungsdialog (bestehendes `AlertDialog`-Pattern) mit Text: „Die abgeschlossene Session vom TT.MM. wird wieder auf ‚offen' gesetzt. Alle Felder sind danach erneut bearbeitbar. Die Aktion wird protokolliert."
- Nach Erfolg: `invalidateQueries(["cash"])`, Toast „Session wieder geöffnet".

**Kein Migrations-Bedarf** — `sessions.status` erlaubt bereits `open`, Audit-Log-Tabelle existiert, keine Schemaänderung.

## Nicht enthalten
- Kein Reopen bei `locked` (Waterline schützt Bank-Deposit).
- Kein Zugriff für Manager (nur Admin, wie beantwortet).
- Kein Bulk-Reopen; Datum-für-Datum via DateSelector.
