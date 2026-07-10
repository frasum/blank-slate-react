# BK1 — Auswertungs-Tab „Bankkonto" (CSV-Import + Monats-/Kategorie-Auswertung)

Neuer admin-only Bereich unter `Auswertungen → Bankkonto`: CSV-Import aus Deutsche-Bank-Export (YUM), Dedupe per `Laufende Nummer`, Kategorisierung via Regeln + Overrides, Monats-/Kategorie-Auswertung. Mehrkonten-fähig, Cash-Modul bleibt unberührt.

## Schritte

### 1. Migration (replayfähig, §72)
Neue Migration mit vier Tabellen inkl. Grants (`authenticated` + `service_role`), RLS-Enable und Policies (Muster `bwa_monthly`):
- `bank_accounts` (org, iban, name, location_id) — UNIQUE (org, iban)
- `bank_categories` (org, name, sort_order) — UNIQUE (org, name)
- `bank_category_rules` (org, category_id, match_field ∈ {name,zweck}, pattern, priority)
- `bank_transactions` (org, account_id, laufende_nummer, buchungstag, wertstellungstag, betrag_cents BIGINT, saldo_cents, gegenpartei, verwendungszweck, bank_kategorie, bank_unterkategorie, override_category_id) — **UNIQUE (account_id, laufende_nummer)** = Idempotenz-Anker
- Index `bank_transactions(org, account_id, buchungstag DESC)`
- RLS SELECT: `organization_id = current_organization_id() AND has_min_permission('admin')`
- Seed: YUM-Konto (IBAN `DE53700700240052787900`, org `77838674-…`, location `14c2d773-…`) + Seed-Kategorien und Regeln aus der Spec-Tabelle

### 2. Pure Kern-Module (getestet, ohne IO)
- `src/lib/bank/bank-csv-parser.ts` — Windows-1252-Decode, `;`-CSV mit Quotes, Header-Erkennung nach Spaltennamen, Betrag/Saldo string-basiert → BIGINT cents, Datum `d.M.yyyy` → ISO, Dedupe über `Laufende Nummer`. Rückgabe: `{ rows, rohZeilen, eindeutig, zeitraum, summeEinCents, summeAusCents, saldoDeltaCents, saldoAbgleichOk }`.
- `src/lib/bank/bank-categorize.ts` — Präzedenz Override > Regel (priority asc, dann Name) > „Ohne Kategorie". Case-insensitives Substring auf `gegenpartei` (`name`) bzw. `verwendungszweck` (`zweck`). Bank-Kategorie NICHT als Fallback.
- `src/lib/bank/bank-stats-core.ts` — Monatsaggregate Ein/Aus/Netto, Kategorie×Monat-Matrix, Top-Gegenparteien.

**Tests:** Sammelbuchungs-Dublette (gleiche laufende Nr. → 1), cp1252-Umlaut-Roundtrip, `-687,50 → -68750`, `306.234,05 → 30623405`, Saldo-Abgleich, fehlende/vertauschte Spalten → Fehler; Categorize-Präzedenz; Stats-Aggregat.

### 3. Server-Fns (`src/lib/bank/bank.functions.ts`, Muster `bwa.functions.ts`)
Alle mit `loadAdminCaller(..., ["admin"])`, org-gescoped, Zod-validiert:
- `listBankAccounts`
- `importBankTransactions` — bekommt geparste Zeilen + `account_iban`, legt Konto bei Bedarf an, Upsert `onConflict: account_id,laufende_nummer` mit `ignoreDuplicates`, gibt `{ inserted, skippedExisting }`
- `listBankTransactions` — Filter Konto/Zeitraum/Kategorie/Suche, paginiert, mit aufgelöster Kategorie + Quelle (override/rule/none)
- `getBankStats` — **nimmt Konto + Zeitraum als Parameter** (gleicher Filterkopf wie `listBankTransactions`), niemals hart „alles"
- `setBankTransactionCategory` / `clearBankTransactionCategory`
- `createBankCategory` / `renameBankCategory`
- `deleteBankCategory` — **explizite Nutzungsprüfung vor Delete**: lehnt ab, wenn die Kategorie in `bank_transactions.override_category_id` ODER in `bank_category_rules.category_id` referenziert ist. Nicht auf `ON DELETE CASCADE` der Regeln verlassen (würde Regeln stillschweigend mitlöschen).
- `createBankCategoryRule` / `deleteBankCategoryRule`
- Audit-Log-Einträge via `makeAuditWriter` bei Schreibpfaden (bwa-Muster)

### 4. UI (`src/routes/_authenticated/admin/bankkonto.tsx`)
`beforeLoad`-Admin-Gate (redirect `/admin`). Vier interne Tabs:
- **Übersicht:** Filterkopf (Konto + Zeitraum) speist `getBankStats`. Kopfkarten (Zeitraum, Ein/Aus/Netto/Endsaldo), Monats-Chart (recharts, Balken Ein/Aus + Netto-Linie), Kategorie×Monat-Tabelle mit „Ohne Kategorie" prominent, Top-Gegenparteien Ein/Aus getrennt. Konto-Select nur bei >1 Konto.
- **Buchungen:** Liste mit Filtern (identischer Filterkopf), Betrag rechtsbündig €, Kategorie-Badge mit Popover-Override (Quelle Regel/manuell erkennbar), Bank-Kategorie als Detail.
- **Regeln:** Kategorien-CRUD + Regel-Liste (Feld/Pattern/Priorität) mit „trifft n Buchungen". Löschen-Button einer Kategorie ist disabled/mit Hinweis, solange Regeln oder Overrides referenzieren.
- **Import:** PV2-Muster — Dropzone `.csv`, Parsen im Browser (nur geprüfte Zeilen zum Server), Review-Screen mit Parser-Kennzahlen inkl. Saldo-Abgleich grün/rot und Neu-vs.-bereits-vorhanden, dann Import-Button.

### 5. Sub-Nav (`src/routes/_authenticated/admin/route.tsx`)
Nur EIN Eintrag unter Auswertungen ergänzen: Prefix `/admin/bankkonto` + `{ to: "/admin/bankkonto", label: "Bankkonto", roles: ["admin"] }`. Keine Änderung an `permission_role_defaults` (PL2-Lektion).

### 6. Nicht anfassen
Statistik-Tabs, BWA, Bilanz, POS, import-zuordnungen, Cash-Modul, Frag-COCO-Tools (Bankdaten bleiben bewusst nicht exponiert), bestehende Migrationen.

## Erfolgs-Gate
- tsc / vitest / eslint / Prettier grün
- Parser-Fixture (synthetisch, keine Echtdaten!) reproduziert 1221→1101; Netto == Saldo-Delta
- Zweiter identischer Import → `{ inserted: 0 }`
- `deleteBankCategory` mit referenzierenden Regeln ODER Overrides → Fehler, keine Löschung
- RLS-Test: nur Admin derselben Org sieht `bank_*`
- Manuelle Abnahme Frank: 1101 Buchungen, Netto −237.326,35 €, Saldo grün, „Ohne Kategorie" < 10 % Volumen
