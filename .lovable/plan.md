## Ergebnis: Alles standortspezifisch — kein Bau nötig

Die vier von dir genannten Ebenen sind bereits pro Standort abgebildet:

1. **Kundennummer je Lieferant je Standort**
   - Tabelle `supplier_locations(supplier_id, location_id, customer_number, is_active)`.
   - Auflösung in `src/lib/bestellung/customer-number.ts` (`resolveCustomerNumber`): Standort-Wert gewinnt, sonst Fallback auf org-weites `suppliers.customer_number`.
   - Verwendet in Betreff und Body der Bestellmail (`src/lib/bestellung/send-order-email.server.ts`).

2. **Lieferadresse je Standort**
   - Wird beim Anlegen der Bestellung aus dem gewählten Standort in `orders.delivery_address` geschrieben (Cart→Order-Funktion, Migration `20260706054351…`) und so an den Lieferanten verschickt.

3. **Bestellung selbst ist standortgebunden**
   - `carts.location_id` → `orders.location_id`; jede Bestellung gehört genau einem Standort.
   - Cart→Order blockt Lieferanten, die am Standort auf `is_active = false` stehen (Fehlercode P0007).

4. **Antworten der Lieferanten (Inbound-Mail)**
   - MailerSend-Webhook matcht über `orders.order_number` (`src/routes/api/public/mailersend/webhook-core.ts`).
   - Reply wird an die passende Bestellung gehängt → implizit standortgebunden über `orders.location_id`.

**Pflegepunkt (kein Bug):** Damit Spice Ry und Yum jeweils ihre eigene Kundennummer nutzen, muss pro Lieferant × Standort eine Zeile in `supplier_locations` mit der Standort-Kundennummer gepflegt sein (UI: Lieferantenpflege). Fehlt sie, greift der org-weite Fallback aus `suppliers.customer_number`.

Kein Codeänderungsschritt geplant.
