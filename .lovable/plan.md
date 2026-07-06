# SL1 — Standort-Lieferanten

Umsetzung 1:1 nach Vorgabe. Kernsemantik konstant: **fehlende `supplier_locations`-Zeile = aktiv, Fallback auf `suppliers.customer_number`**. Kein Backfill.

## Schritte (Reihenfolge = Committreihenfolge)

### 1. Migration `supplier_locations` (deny-all wie `article_locations`)
- Tabelle mit `unique (supplier_id, location_id)`, `is_active default true`, `customer_number text nullable`.
- Indizes auf `supplier_id`, `location_id`.
- `grant all … to service_role`, RLS on, **keine** Client-Policies.
- Erwartet in RLS-Inventur: siebte gewollte deny-all-Tabelle.

### 2. Migration `create_order_from_cart` (4-Param-Variante) — Guard 1+2
- DROP+CREATE nur der 4-Param-Signatur (`p_supplier_id default null`); 3-Param-Variante unangetastet.
- `SECURITY DEFINER`, `set search_path=public`, `REVOKE PUBLIC/anon/authenticated`, `GRANT execute … TO service_role`.
- Guard 1 vor der Loop: fehlende `article_locations`-Zeile am `v_cart.location_id` → `P0006`, Meldung deutsch: `'Nicht bestellbar am gewählten Standort: %'` (Freitext `article_id IS NULL` ausgenommen).
- Guard 2: `supplier_locations.is_active=false` am Cart-Standort → `P0007`, deutsch: `'Lieferant am gewählten Standort deaktiviert: %'` (fehlende Zeile = aktiv). Ton wie bestehende Meldungen („Standort wählen, bevor du bestellst.").

### 3. Reine Helper `src/lib/bestellung/customer-number.ts` + Test
- `resolveCustomerNumber(orgWide, perLocation)`: leerer/`null` `perLocation.customer_number` → Fallback org-weit.
- `customer-number.test.ts`: Fallback-Matrix (Zeile mit Nummer / mit NULL / mit Leerstring / keine Zeile) × (org-weit gesetzt / NULL).

### 4. `src/lib/bestellung/supplier-locations.functions.ts`
- `listSupplierLocations({ supplierId })` — `loadAdminCaller(caller, "manager")`, prüft `suppliers.organization_id`, liefert existierende Zeilen.
- `setSupplierLocation({ supplierId, locationId, customerNumber, isActive })` — Cross-Org-Check (Lieferant + Standort in Aufrufer-Org, Muster aus `easyorder-admin.functions.ts`), Upsert `onConflict "supplier_id,location_id"`, `runGuarded` + Audit `supplier_location.set` mit `{ supplierId, locationId, customerNumber, isActive }`.

### 5. Lieferanten-Dialog (`bestellung.lieferanten.tsx`)
- Bestehendes Feld beschriften: „Kundennummer (Standard, wenn kein Standort-Wert)".
- Neuer Abschnitt „Standorte": pro aktivem Standort (via bestehendem `listLocations`) eine Zeile mit Kundennummer-Input (Placeholder = org-weiter Wert) + Aktiv-Switch. Zustand ohne DB-Zeile: aktiv + leer.
- Save ruft `setSupplierLocation` je **geänderter** Zeile, danach `invalidate` der Katalog-Query.

### 6. Admin-Katalog: Standort-Pill + Filter (`bestellung.lieferanten.tsx`)
- `LocationPills` oberhalb der Suche, Init = `carts.location_id` sonst erster aktiver Standort. **Keine „Alle"-Option.**
- Pill-Wechsel ruft bestehendes `setCartMeta({ locationId })` — Pill und Warenkorb-Standort sind ein Zustand.
- Artikel-Filter: Inner-Join-Muster wie `getEasyOrderCatalogCore` (nur Artikel mit `article_locations`-Zeile am gewählten Standort).
- Lieferanten-Filter: `supplier_locations.is_active=false` am Standort → aus (fehlende Zeile = sichtbar).
- `SendOrderDialog` unverändert (folgt Cart-Standort).

### 7. `send-order-email.server.ts` — standort-genaue Kundennummer
- Zusätzliche `supplier_locations.maybeSingle()`-Abfrage mit `(order.supplier_id, order.location_id)`.
- `customerNumber` via `resolveCustomerNumber(supplier.customer_number, row)`.
- Alles Andere (Testmodus, MailerSend-Call, `order-email.ts` Templates, Status-Update, Audit) Zeichen für Zeichen unverändert. EasyOrder profitiert automatisch (BFIX1).

### 8. `getEasyOrderCatalogCore` (`easyorder.functions.ts`)
- Zusätzlicher Filter: Lieferanten mit `supplier_locations.is_active=false` am angefragten Standort ausblenden. `staff_easyorder_suppliers`-Whitelist und `article_locations`-Filter bleiben unverändert.

### 9. DB-Tests (`*.db.test.ts`)
- Neue Datei `supplier-locations.db.test.ts`. Skip-Mechanismus **1:1 aus `easyorder.db.test.ts` übernehmen** (Flag heißt `SUPABASE_DB_TESTS`, durchgehend groß — der Prompt-Tippfehler `SUPabase_DB_TESTS` ist nicht zu übernehmen).
- (a) **Deny-all-Check** nach Hausmuster: via `service_role` eine `supplier_locations`-Zeile seeden, dann mit anon/authenticated-Client `select` → **Assertion auf 0 Zeilen** (kein Error erwartet; RLS ohne Policies liefert leer, wirft nicht). Vorlage: bestehende deny-all-Tests in `easyorder-admin.db.test.ts` / `inventory.db.test.ts`.
- (b) RPC `create_order_from_cart` mit nicht freigegebenem Artikel → wirft `P0006`.
- (c) RPC mit standort-deaktiviertem Lieferanten (`is_active=false`-Zeile) → wirft `P0007`.
- (d) Fehlende `supplier_locations`-Zeile blockt nicht (RPC läuft durch).

### 10. Format + Gate
- `npx prettier --write` + `npx eslint --fix` über alle geänderten Dateien.
- Erfolgs-Gate: `tsc --noEmit` 0, `eslint --max-warnings=0` 0, `prettier --check .` clean, `vitest run` grün, `grep -rn "api.mailersend.com" src` = 1 Treffer.

## Technische Details

- **Migrations-Reihenfolge kritisch**: erst Tabelle (Schritt 1), warten auf Types-Regeneration, dann Server-Fns/UI (5-8), dann RPC-Guard-Migration (Schritt 2) mit `supplier_locations`-Referenz.
- **Cross-Org-Validierung**: Muster aus `easyorder-admin.functions.ts` (assertLocationInOrg) übernehmen — nicht neu erfinden.
- **`resolveCustomerNumber`** ist reine Datenlogik in eigener Datei (nicht in `.functions.ts`, nicht in `.server.ts`) → im Browser und Server importierbar.
- **Audit-Payload**: `customer_number` ist keine Personaldate → darf ins `meta` (kein Redact-Bedarf).
- **RPC-Grants nicht regressieren**: bei DROP+CREATE zwingend `REVOKE … FROM PUBLIC, anon, authenticated;` + `GRANT EXECUTE … TO service_role;` wieder setzen (Sicherheits-Fix #1).
- **RLS-Ablehnung**: „deny-all" heißt in Postgres **stille Leerantwort**, nicht Exception — Tests entsprechend schreiben.
- **Guard-Meldungen deutsch**, gleicher Ton wie bestehende `create_order_from_cart`-Fehler (P0001–P0005).

## Commit-Reihenfolge

```text
1. migration: create supplier_locations (deny-all)
2. feat(lib): customer-number helper + test
3. feat(lib): supplier-locations.functions.ts
4. feat(email): standort-genaue Kundennummer
5. feat(easyorder): supplier_locations-Filter
6. feat(admin): Lieferanten-Dialog Standort-Sektion
7. feat(admin): Katalog Standort-Pill + article/supplier-Filter
8. migration: create_order_from_cart Guard 1+2 (4-Param)
9. test(db): supplier-locations RLS + RPC-Guards
10. chore: prettier/eslint sweep
```
