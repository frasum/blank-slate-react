## Ziel
In `/admin/bestellung/bestellungen` einen Filter **„Nur offen (nicht gesendet)"** ergänzen, der exakt die Bestellungen zeigt, die auch der TRMNL-Zähler verwendet: `email_sent = false` UND `status ≠ cancelled`.

## Warum nicht der bestehende Status-Filter reicht
Der Status-Filter kennt nur `pending/sent/confirmed/cancelled`. „Unsent" ist orthogonal — eine Bestellung mit `status = pending` kann bereits versendet worden sein (oder umgekehrt). Wir müssen gezielt auf `email_sent = false` filtern, damit die Zahl 1:1 zum TRMNL-Display passt.

## Umfang (nur diese Liste, sonst nichts)

### 1. Server-Fn `listOrders` erweitern
`src/lib/bestellung/orders.functions.ts`
- Input-Schema um `onlyUnsent: z.boolean().optional()` erweitern.
- Wenn `true`: Query zusätzlich um `.eq("email_sent", false).neq("status", "cancelled")` ergänzen.
- `status` bleibt unabhängig — Server-Fn bleibt rückwärtskompatibel.

### 2. UI-Filter
`src/routes/_authenticated/admin/bestellung.bestellungen.tsx`
- Status-Dropdown um Option **„Nur offen (nicht gesendet)"** mit lokalem Sentinel-Wert `"__unsent"` (bewusst kein DB-Status).
- Wenn `"__unsent"` gewählt: `onlyUnsent: true` an die Server-Fn, `status` bleibt leer.
- Query-Key um `onlyUnsent` ergänzen (sonst greift der bestehende Cache-Eintrag fälschlich).
- Sichtbarer Zähler neben dem Filter im `__unsent`-Modus: „N offen" = `ordersQ.data.length`.
  - Code-Kommentar: zählt geladene Zeilen; falls `listOrders` künftig Paging/Limit bekommt, MUSS der Zähler auf `count: "exact"` umgestellt werden.

### 3. Deep-Link via Search-Param
- `validateSearch` mit `zodValidator` einführen: `{ view: fallback(z.string(), "").default("") }` (nur `"unsent"` wird interpretiert, alles andere ignoriert).
- Beim ersten Render: wenn `view === "unsent"` → `statusFilter` initial auf `"__unsent"`.
- URL: `/admin/bestellung/bestellungen?view=unsent`.

### 4. Kein Schema-Change
`email_sent` existiert bereits und wird im Select bereits geladen — keine Migration nötig.

## Nicht anfassen
- Bulk-Send-UI, Detailansicht, Terminierung.
- TRMNL-Route (`trmnl-tasks.$token.ts`), Zähler-Logik des Displays.
- Kein Redesign — minimal-invasiv als zusätzliche Option im vorhandenen Filter.

## Vor Commit
- `npx prettier --write .` + `npx eslint --fix` über geänderte Dateien.

## Erfolgs-Gate
- `npx tsc --noEmit` → 0 Fehler
- `npx eslint .` → 0 Fehler
- `npx prettier --check .` → sauber
- `npx vitest run` → alle grün (Bestand 1628)
- Manuell nach Publish: Zähler in der Liste passt zur Badge auf dem TRMNL-Board; `?view=unsent` öffnet die gefilterte Ansicht direkt.