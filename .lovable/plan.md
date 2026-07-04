## Ziel

Roter Punkt (Badge) im Admin-Header bei „Stammdaten & Dokumente" (Unter-Nav in „Mitarbeiter"), sobald etwas zum Freigeben ansteht. Zusätzlich je ein roter Punkt auf den Tabs „Anträge" und „Dokumente" innerhalb der Seite, damit sofort erkennbar ist, wo die offenen Vorgänge liegen.

Telegram-Benachrichtigung ist ausdrücklich **nicht Teil** dieses Schritts (folgt später, wenn Frank den Bot einrichtet).

## Was zählt als „zum Freigeben"

- **Anträge:** offene Stammdaten-Änderungsanträge (`staff_data_change_requests.status = 'pending'`) — bereits durch `listOpenChangeRequests()` abgedeckt.
- **Dokumente:** hochgeladene Personaldokumente ohne Prüfung (`staff_documents.verified_at IS NULL`) — bereits durch `listAllDocuments()` abrufbar, dort per Filter auf `verifiedAt === null` reduzierbar.

Beides ist Admin-only, passt also zur bestehenden Sichtbarkeit des Menüpunkts.

## Umsetzung

1. **Neue Server-Fn `getReviewPendingCounts`** in `src/lib/profile/profile-admin.functions.ts`:
   - admin-only (bestehende `assertAdmin`-Logik der Datei nutzen),
   - liefert `{ pendingRequests: number; pendingDocuments: number }` per zwei schlanken `count`-Queries — kein Nachladen der vollständigen Listen.

2. **Query-Hook im Admin-Layout** (`src/routes/_authenticated/admin/route.tsx`):
   - nur laden, wenn `role === 'admin'`,
   - `refetchInterval` ~60 s + `refetchOnWindowFocus`,
   - Ergebnis an die Sub-Nav-Renderung durchreichen.

3. **Roter Punkt in der Sub-Nav**:
   - Kleines `<span className="ml-1 inline-block h-2 w-2 rounded-full bg-destructive" aria-hidden />` neben dem Label „Stammdaten & Dokumente", wenn `pendingRequests + pendingDocuments > 0`.
   - `aria-label` des Links um „(offene Vorgänge)" ergänzen, damit Screenreader es ansagen.
   - Rendering nur, wenn Sub-Item auch sichtbar ist (unverändertes Rolle-Gate).

4. **Rote Punkte auf den Tab-Triggern** in `personal-antraege.tsx`:
   - dieselbe Server-Fn direkt in der Seite abfragen (oder aus den vorhandenen Queries `q.data.length` bzw. gefilterte Dokument-Liste ableiten — kein Extra-Roundtrip nötig),
   - Punkt neben „Anträge" wenn offene Anträge > 0,
   - Punkt neben „Dokumente" wenn ungeprüfte Uploads > 0.

5. **Cache-Invalidierung**: nach erfolgreichem `decideChangeRequest`, `verifyDocument`, `deleteDocument` zusätzlich `queryClient.invalidateQueries({ queryKey: ["admin", "review-pending-counts"] })` — damit der Punkt verschwindet, sobald die letzte offene Sache erledigt ist.

## Bewusst NICHT enthalten

- Telegram-Anbindung: kommt in einem separaten Schritt, sobald Bot-Token/Chat-ID stehen (Connector `telegram`, Server-Fn beim Eintreffen neuer Anträge/Uploads).
- Punkte bei anderen Modulen (Aufgaben, Urlaub, Bestellung) — dieser Auftrag betrifft nur Stammdaten & Dokumente.
- Zahl im Badge: Frank hat explizit einen „kleinen roten Punkt" gewünscht, keine Zählpille.

## Bestätigung erbeten

Sub-Nav trägt den Text „**Stammdaten & Dokumente**" (unter „Mitarbeiter"). Es gibt daneben eine gleichnamige Oberkategorie „Stammdaten" (nur Standorte). Ich setze den Punkt **nur** an „Stammdaten & Dokumente", weil nur dort etwas freizugeben ist — bitte kurz bestätigen, ob das so passt oder ob zusätzlich der Menüpunkt „Stammdaten" markiert werden soll.
