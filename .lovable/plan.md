## Ziel

In `/admin/einstellungen` einen neuen Abschnitt **„Testmodus Bestellungen"** ergänzen: eine E-Mail-Adresse hinterlegen und per Toggle aktivieren. Solange der Testmodus an ist, gehen **alle** Bestell-Mails (Manager-Flow *und* EasyOrder-Auto-Versand) an diese Test-Adresse statt an die Lieferanten-Adresse. Lieferanten erhalten in diesem Modus nichts.

## Umfang

1. **Migration** — `organization_settings` um zwei Spalten erweitern:
   - `test_mode_enabled boolean NOT NULL DEFAULT false`
   - `test_mode_email text NULL`
   (Keine neue Tabelle, keine RLS-Änderung — Settings sind bereits org-scoped.)

2. **`src/lib/admin/org-settings.functions.ts`**:
   - `OrgSettings`-Typ um `testModeEnabled: boolean` und `testModeEmail: string | null` erweitern.
   - `getOrgSettings` liest die zwei neuen Spalten mit.
   - `updateOrgSettings`-Schema erweitern: `testModeEnabled` (bool), `testModeEmail` (optional, beim Aktivieren Pflicht + gültige E-Mail via `z.string().email()`; bei deaktiviert leerer String → `null`).
   - Audit-Log-Meta um die neuen Werte ergänzen (Adresse selbst wird mitgeloggt — bewusste Admin-Aktion, kein Personaldatum).

3. **`src/lib/bestellung/send-order-email.server.ts`** — Empfänger-Override:
   - Vor dem `fetch` Settings der Organisation lesen (`test_mode_enabled`, `test_mode_email`).
   - Wenn `enabled && email` gültig: `to` wird `[{ email: testEmail, name: "TEST – " + supplier.name }]`, Subject bekommt Präfix **`[TEST]`**, und im HTML/Text-Body wird ein kleiner Banner ergänzt („Testbestellung — würde regulär an `<supplier.email>` gehen"). Lieferanten-Adresse wird **nicht** als CC/BCC verwendet.
   - Wenn `enabled` aber keine gültige Test-Adresse hinterlegt → Fehler `"Testmodus ist aktiv, aber keine Test-E-Mail hinterlegt."` (verhindert versehentlichen Versand an Lieferanten).
   - `orders.email_sent / email_sent_at / status='sent'` bleiben unverändert — Bestellung gilt als versendet.

4. **`src/lib/bestellung/order-email.ts`**:
   - Optionaler Parameter/Flag in `buildOrderEmailHtml` / `buildOrderEmailText` / `buildOrderEmailSubject` für den Testmodus-Banner bzw. das `[TEST]`-Präfix. Reine Builder bleiben pur und getestet.
   - Neue Unit-Tests in `order-email.test.ts`: Subject mit `[TEST]`, HTML/Text enthalten Banner mit Original-Lieferanten-Mail.

5. **UI `src/routes/_authenticated/admin/einstellungen.tsx`** — neue Sektion **„Testmodus Bestellungen"**:
   - Toggle (Checkbox/Switch) „Testmodus aktiv".
   - Textfeld „Test-E-Mail-Adresse" (type=email).
   - Hinweistext: „Solange der Testmodus aktiv ist, gehen alle Bestell-Mails ausschließlich an diese Adresse. Lieferanten erhalten nichts."
   - Client-Validierung: bei Aktivierung muss eine gültige Adresse stehen.
   - Speichern über bestehendes `updateOrgSettings` (eine gemeinsame Mutation für alle Settings).

6. **Tests / Gates**:
   - `npx vitest run` grün (bestehende + neue Mail-Builder-Tests).
   - `npx tsc --noEmit` 0 Fehler.
   - `npx eslint . --max-warnings=5` 0 Fehler.
   - Manuell: Testmodus an + eigene Adresse → eine Bestellung versenden → Mail kommt nur auf Test-Adresse an, Subject `[TEST] …`, Banner zeigt Original-Lieferanten-Adresse; Testmodus aus → Mail geht wieder an Lieferant.

## Bewusst nicht enthalten

- Keine Änderung an den orders-Daten (kein „Testmodus"-Flag auf der Bestellung selbst) — der Modus ist eine reine Versand-Eigenschaft zum Zeitpunkt des Sendens.
- Kein separater „Test-Sender" / kein zweiter MailerSend-Account.
- Keine UI-Markierung der Bestellung im Bestell-Verlauf (kann später nachgezogen werden, falls gewünscht).
