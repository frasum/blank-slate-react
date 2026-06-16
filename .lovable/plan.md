## Ziel

Im Admin-Bereich `/admin/locations` sollen pro Standort Adresse, Telefonnummer und Kontaktperson (Name + Telefon) gepflegt werden können. Die Adressspalten `street`, `postal_code`, `city`, `delivery_notes` existieren bereits in `public.locations` (bisher nur über `create_order_from_cart` als Lieferadresse genutzt), sind aber im UI nicht editierbar.

## Schritte

### 1. Migration: neue Spalten auf `public.locations`
- `phone text` (Standort-Telefon)
- `contact_name text` (Kontaktperson)
- `contact_phone text` (Telefon Kontaktperson)
- Alle nullable, kein Default. Bestehende Grants/RLS unverändert (Spalten erben Policies).

### 2. Server-Funktionen `src/lib/admin/locations.functions.ts`
- `listLocations`: Select um `street, postal_code, city, delivery_notes, phone, contact_name, contact_phone` erweitern.
- `createLocation`: Optionale Felder im Zod-Schema (`.trim().max(...).optional().nullable()`), leere Strings → `null`. Insert mit den neuen Feldern. Audit-Meta nur mit `name` (keine PII im Audit-Log).
- `updateLocation`: Gleiches Schema, Update mit allen Feldern. Audit-Meta `{ name }`.
- Längenlimits: `street` 200, `postal_code` 20, `city` 120, `delivery_notes` 500, `phone`/`contact_phone` 40, `contact_name` 120.

### 3. UI `src/routes/_authenticated/admin/locations.tsx`
- Anlegen-Formular und Bearbeiten-Zeile um Eingabefelder erweitern: Name, Telefon, Kontaktperson (Name), Kontaktperson (Telefon), Straße, PLZ, Ort, Lieferhinweise.
- Listenansicht zeigt Adresse + Telefon kompakt unter dem Namen.
- Keine clientseitige Validierung über Pflichtlängen hinaus; Zod auf dem Server ist die Quelle der Wahrheit.

### 4. Tests / Verifikation
- `bun run typecheck` und `bunx prettier --check .` müssen grün bleiben.
- Bestehender Test `src/lib/bestellung/create-order-from-cart.db.test.ts` darf nicht brechen (nutzt `street/postal_code/city/delivery_notes`).
- Manuell: Standort anlegen → bearbeiten → Felder bleiben gespeichert; in der Bestellung erscheint die Adresse weiterhin korrekt als Lieferadresse.

## Nicht im Scope

- Keine Nutzung der neuen `phone`/`contact_*`-Felder an anderen Stellen (Bestellung, Display etc.) — das folgt erst, wenn die konkrete Verwendungsstelle beauftragt wird.
- Keine Änderungen an `staff_personal_details`, `suppliers` o. ä.
- Kein Telefon-Format-Parsing; freier Text.
