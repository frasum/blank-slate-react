# Bestelllogik vereinfachen

Ziel: Bestellen passiert dort, wo Artikel ausgewählt werden — kein Tab-Wechsel mehr. Der separate „Warenkorb"-Tab entfällt; sein Inhalt lebt als Drawer überall mit.

## Neuer Flow

```
Lieferanten-Seite
├── pro Lieferant: Header zeigt Korb-Badge (X Artikel · Y €)
│   └── Button „Bestellen" → Vorschau-Dialog → Senden
└── Floating-Button unten rechts: „Warenkorb · N Lieferanten"
    └── Drawer: alle Lieferanten mit offenem Korb, je Block „Bestellen"
```

## Bauplan

### 1. Backend: Checkout pro Lieferant
- `createOrderFromCart` erweitern um optionales `supplierId`. Die Postgres-Funktion `create_order_from_cart` muss einen Filter `WHERE supplier_id = p_supplier_id` bekommen (neue Migration, additive Signatur mit Default NULL → bestehende Aufrufe bleiben gültig).
- Tests in `create-order-from-cart.db.test.ts` ergänzen: ein Lieferant gefiltert vs. alle.

### 2. Wiederverwendbare Komponenten
- `SupplierCartSummary` (Header-Badge): liest `cartQ` gefiltert nach `supplier_id`, zeigt Anzahl + Summe + Button „Bestellen".
- `OrderPreviewDialog`: zeigt Lieferant, Empfänger-E-Mail (aus Supplier), Positionen mit Menge/Einheit/Preis, Summe, optionales Notiz-Feld. Buttons „Abbrechen" / „Verbindlich senden". Bei Klick: `createOrderFromCart({ supplierId })` → bei Erfolg `sendOrderEmail({ orderId })` → Toast → Cart-Query und Orders-Query invalidieren.
- `CartDrawer`: Floating-Button (rechts unten, fix) + Sheet von rechts. Pro Lieferant ein Block (gleicher `SupplierCartSummary`-Mechanismus), darunter Positionsliste mit Mengen-Editor (re-use vorhandene `updateCartItem`/`removeCartItem`-Mutations).

### 3. Integration in `bestellung.lieferanten.tsx`
- Im aufgeklappten Lieferanten-Header rechts neben „Bearbeiten" `SupplierCartSummary` einsetzen (auch sichtbar wenn eingeklappt, sobald Korb gefüllt).
- Bestehender Inline-Korb-Mechanismus (Plus/Minus pro Artikel) bleibt unverändert.

### 4. Drawer global
- `CartDrawer` in `bestellung.tsx` (Layout) rendern, damit er auf allen Bestellung-Unterseiten verfügbar ist (EasyOrder, Lieferanten, Wein …).

### 5. Warenkorb-Tab entfernen
- `SubLink` „Warenkorb" aus `bestellung.tsx` entfernen.
- Datei `bestellung.warenkorb.tsx` löschen.
- Falls noch andere `<Link to="/admin/bestellung/warenkorb">` existieren → auf Drawer-Open umstellen (globaler Zustand via Zustand/`useState` im Layout oder URL-Search-Param `?cart=open`).
- Falls Funktionalität existiert, die *nur* dort lebt (Entwurf speichern, Notiz, „komplett bestellen"-Button für alle Lieferanten gleichzeitig): in den Drawer übernehmen — vor dem Löschen `bestellung.warenkorb.tsx` durchgehen und unique Features migrieren.

### 6. Bestätigungs-Verhalten
- `OrderPreviewDialog` ist Pflicht-Zwischenschritt (Wahl: Vorschau).
- Nach Versand: Drawer/Header-Badge aktualisiert sich automatisch (Cart wird durch RPC geleert), Erfolgs-Toast verlinkt auf `/admin/bestellung/bestellungen`.

## Offene Punkte vor Bau
- Hat `bestellung.warenkorb.tsx` Funktionen, die im Drawer fehlen würden (Entwürfe via `saveCartAsDraft`/`listCartDrafts`)? Falls ja: Drawer bekommt zusätzlich Tab/Bereich „Entwürfe".
- Soll der Floating-Button auch auf Nicht-Bestellung-Seiten (z. B. Dashboard) sichtbar sein? Vorschlag: nein, nur innerhalb `bestellung.*`.

## Out of Scope
- EasyOrder/EasyOrder-Verwaltung-Zusammenführung (Variante C wurde nicht gewählt).
- Bestellschluss-Sortierung (Variante D wurde nicht gewählt).
