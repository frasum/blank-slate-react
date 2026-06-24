# COCO Fix #2c — Cart-Drafts atomar via SECURITY DEFINER-RPC

## Ziel
Zwei mehrstufige, nicht-transaktionale Draft-Flows (`saveCartAsDraft`, `loadDraftIntoCart`) durch je eine `SECURITY DEFINER`-plpgsql-RPC ersetzen. Bei Fehler automatischer Rollback (kein leerer Draft, kein leerer Warenkorb). Org/User-Scoping hart in SQL — RLS-Bypass dadurch unkritisch.

## Schritt 1 — Migration (`supabase--migration`)

Zwei neue plpgsql-Funktionen 1:1 wie in der Anweisung:
- `public.save_cart_as_draft(p_cart_id, p_organization_id, p_user_id, p_name, p_notes)` → `uuid` (Draft-ID)
  - Guards: Cart gehört `(org, user)`; Cart nicht leer.
  - `INSERT cart_drafts` aus `carts`-Meta + `INSERT cart_draft_items` aus `cart_items` in einer Transaktion.
- `public.load_draft_into_cart(p_draft_id, p_cart_id, p_organization_id, p_user_id, p_replace)` → `void`
  - Guards: Draft + Cart gehören `(org, user)`.
  - Optional `DELETE cart_items` (replace), `INSERT cart_items` aus `cart_draft_items`, `UPDATE carts`-Meta aus Draft — alles transaktional.

Berechtigungen: `REVOKE ALL … FROM PUBLIC, anon, authenticated`, `GRANT EXECUTE … TO service_role` für beide.

Migration kommt zuerst und blockiert auf Approval. Erst nach Approval+Types-Regenerierung wird die TS-Datei angefasst (sonst `rpc("save_cart_as_draft" / "load_draft_into_cart")` nicht typsicher).

## Schritt 2 — Server-Functions umstellen (`src/lib/bestellung/cart.functions.ts`)

**`saveCartAsDraft`** — `ensureCart` davor unverändert. Den Block ab `cart_items`-Load bis `cart_draft_items`-Insert ersetzen durch einen einzigen `supabaseAdmin.rpc("save_cart_as_draft", { p_cart_id, p_organization_id, p_user_id, p_name, p_notes })`-Aufruf; Rückgabe weiterhin `{ draftId }`.

**`loadDraftIntoCart`** — `ensureCart` davor unverändert. Den Block ab `cart_drafts`-Lookup über Delete/Insert/Cart-Meta-Update ersetzen durch einen `supabaseAdmin.rpc("load_draft_into_cart", { p_draft_id, p_cart_id, p_organization_id, p_user_id, p_replace })`-Aufruf; Rückgabe weiterhin `{ ok: true as const }`.

**Nicht angefasst:** `ensureCart`, `getActiveCart`, `setCartMeta`, `addCartItem`, `updateCartItem`, `removeCartItem`, `clearCart`, `listCartDrafts`, `deleteCartDraft`. Signaturen, Input-Validatoren, Middleware, `loadAdminCaller`/`ALLOWED_ROLES` bleiben.

## Schritt 3 — Pre-Commit
`bunx prettier --write` + `bunx eslint --fix` über die geänderte Datei (inkl. Leerzeile am Dateiende).

## Erfolgs-Gate
- `bunx tsgo --noEmit` grün (Types regeneriert)
- `bunx eslint . --max-warnings=5` grün
- `bunx prettier --check .` grün
- `bunx vitest run` — 738 Tests, keine wegfallenden
- Beide neuen RPCs: 0 Rechte für `anon`/`authenticated`, nur `service_role`

## Nicht im Scope
Account-Flows (#2d), andere Tabellen/Policies/UI, neue DB-Integrationstests (empfohlen, aber non-blocking).
