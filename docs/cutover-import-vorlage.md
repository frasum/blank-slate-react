# Import-SQL-Vorlage — §5-Voll-Reimport Kasse (Cutover T0 = 26.07.2026)

→ FALL 1: VON FRANK AUSFÜHREN, in der COCO-Datenbank (Supabase-Editor) — am T0, nach dem
Einfrieren der Quelle. Diese Vorlage ist das Phase-1-Ergebnis (Mapping verifiziert am
15.07. gegen Stand `6c1acdb3`); die konkreten Werte-Blöcke werden in Phase 2 aus den
frischen Exporten generiert.

Verbindliche Rahmenregeln (aus §37, §5, §10, §96): ids 1:1 aus der Quelle · Geld ×100 →
`*_cents` · Batches ≤ ~2000–2500 Zeilen/Datei · Standortname prominent in Dateiname UND
Header jeder SQL-Datei · laufenden Geschäftstag NIE importieren (Stichtag = T0−1) ·
alles idempotent via `WHERE NOT EXISTS` · destruktive Schritte nach Regel A/B getrennt
geliefert.

## Schritt 0 — Preflight (rein lesend, MUSS vor jedem Commit-Lauf leer/plausibel sein)

**Q1 — Unaufgelöste Mitarbeiter (MUSS 0 Zeilen liefern):** Namens-Join
`upper(quelle.name)` gegen `upper(staff.display_name)` mit den Overrides GUNC→GUNG,
PAE→SUMITR, jirawut.saechiang→COCO, KRIS→KRISS, (GIG SERVICE)→staff_id
`93e44abe-d1d8-4763-b0a6-63cea7313687`. Jede unaufgelöste Zeile ist ein Blocker (der
Join lässt sie sonst STILL fallen — §37-Lektion).

**Q2 — Leere native Hüllen (Ergebnis dokumentieren):** Tage, an denen COCO eine Session
führt, deren INHALT leer ist (`vectron=0` UND 0 Zeilen in allen vier Kindtabellen),
während die Quelle echte Zahlen hat. Erkennung über Inhalt, NIE über Session-Existenz
(Hüllen-Falle §5).

**Q3 — Kanal-/Terminal-Stammdaten vollständig:** je Standort existieren die
Auto-Seed-Kanäle (`pos`/`delivery_souse`/`delivery_wolt`/`delivery_vectron`) und die
Terminals inkl. `is_gl`-Markierung (Spicery `16ba431d…`, YUM `fcf379d8…`).

## Schritt 1 — Guarded Replace der leeren Hüllen (destruktiv → Regel A/B: eigene Lieferung)

Je Q2-Fund: Hülle nur löschen, wenn kinderlos (`NOT EXISTS` auf alle vier
Kindtabellen, eigene Legacy-id per `id <> …` ausgenommen), atomar in `BEGIN…COMMIT`,
Rest-Check im SELBEN Editor-Lauf (§10). Wird in Phase 2 als separates Skript mit den
konkreten Session-IDs geliefert.

## Schritt 2 — sessions (Batch je Standort)

```sql
-- CUTOVER-IMPORT <STANDORT> — sessions (Quelle: tagesabrechnung, Stand T0-1)
INSERT INTO public.sessions (id, organization_id, location_id, business_date,
  vectron_daily_total_cents, guest_count, einladung_cents, finedine_vouchers_cents,
  vorschuss_cents, sonstige_einnahme_cents, vouchers_sold_cents, vouchers_redeemed_cents,
  status, tip_pool_settlement_only, opentabs_deduction_cents,
  cash_actual_cents, opening_balance_cents)
SELECT ... -- Werte-Block aus Export; Konstanten: status='open',
           -- tip_pool_settlement_only=true, opentabs_deduction_cents=0 (bis N15b-Drop),
           -- cash_actual/opening_balance = NULL (Tresor startet bei null, §37)
WHERE NOT EXISTS (SELECT 1 FROM public.sessions s WHERE s.id = <legacy_id>);
```

Standort-Auflösung: `restaurant_id` `3065f458…`→YUM, `a1710390…`→Spicery (TSB hat
keine Quell-Sessions).

## Schritt 3 — Kanäle & Terminals (MA2-konform: Auflösung NUR per Join)

```sql
-- channel_id wird IMMER über (location_id, kind) aufgelöst — nie als freie ID.
-- Der Join ist der Location-Guard (Import läuft an den Server-Guards vorbei, §96/MA2).
INSERT INTO public.session_channel_amounts (organization_id, session_id, channel_id, amount_cents)
SELECT <org>, <session_id>, rc.id, <betrag_cents>
FROM public.revenue_channels rc
WHERE rc.location_id = <location_id> AND rc.kind = '<kind>'   -- wolt→delivery_wolt,
                                                              -- takeaway→delivery_vectron,
                                                              -- ordersmart→delivery_souse
  AND <betrag_cents> <> 0                                     -- Null-Beträge: keine Zeile
  AND NOT EXISTS (SELECT 1 FROM public.session_channel_amounts x
                  WHERE x.session_id = <session_id> AND x.channel_id = rc.id);
-- Terminals analog über (location_id, label): 'Terminal 1', 'Terminal 2',
-- 'Kredit Karten GL' (is_gl-Zeile des Standorts).
```

## Schritt 4 — waiter_settlements

Wie §5: eine Zeile je Quell-`waiter_shifts`; `kassiert_brutto_cents = pos_sales`
(Entscheidung A); `kitchen_tip_rate = 0.0200`; `status='submitted'`; `submitted_at` aus
Quelle; `partner_staff_id`/`second_waiter_name` NULL; `additional_waiters='[]'`. Neu
seit 08.07. und bewusst NICHT befüllt: `open_invoices_details` (jsonb) — Default `'[]'`
greift. Staff-Auflösung über Q1-Join. Zusatzkellner erhalten KEINE Settlement-Zeile.
Idempotenz: `WHERE NOT EXISTS` auf Legacy-id.

## Schritt 5 — session_tip_pool_entries (F1-Entscheidung (b): Küchenzeiten mitnehmen)

**Service** (je Quell-`waiter_shifts` mit `participates_in_pool=true`):
`hours_minutes = round(hours_worked × 60)`; `shift_start`/`shift_end = NULL`;
`participates = NULL` (keine Übersteuerung).

**Küche** (je Quell-`kitchen_shifts`): `shift_start`/`shift_end` aus der Quelle
übernehmen; `hours_minutes` DARAUS ableiten mit Mitternachts-Wrap:
`minutes = (end − start)` in Minuten; wenn `< 0` → `+ 1440`. EINE Wahrheit — nicht das
Quell-Feld `hours_worked` parallel verwenden. Konsistenz-Gegenprobe im Abgleich
(Schritt 6): Σ abgeleitete Minuten je Monat ≈ Σ Quell-`hours_worked×60` (Differenzen
erklären, bekannter Fall: Wrap-Zeilen).

**Zusatzkellner** (`additional_waiters`/`second_waiter_name`): eigener Service-Eintrag
mit den Stunden des Primärkellners, `note='Zusatzkellner-Reimport T0'`.

`participates` bleibt überall NULL; Unique `(session_id, staff_id)` + `WHERE NOT EXISTS`
sichern Wiederholbarkeit.

## Schritt 6 — Abschluss-Abgleich (PFLICHT, Abbruchkriterium E5)

Eingebettete Soll-Zahlen je Monat × Standort (aus dem Export gezählt, in Phase 2
generiert): `sessions` · `waiter_settlements` · `tip_pool_entries` (Service/Küche
getrennt) · Kanal-/Terminal-Zeilen · Σ `vectron_daily_total_cents`. Jede unerklärte
Differenz = Abbruch (Cutover-Plan Phase 3, Kriterium 1). Danach Re-Import-Probe:
identischer Lauf muss 0 neue Zeilen liefern.

---

Offen bis Phase 2: konkrete Werte-Blöcke + Soll-Zahlen aus den frischen Exporten ·
Schritt-1-Skript mit den Q2-Session-IDs · finale Batch-Aufteilung. Diese Vorlage
wandert nach Franks Sichtung als `docs/cutover-import-vorlage.md` ins Repo (Doku-Prompt
folgt gebündelt mit dem Phase-1-Abschluss §97).
