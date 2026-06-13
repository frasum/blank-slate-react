# Golden-Master Kasse (B3a)

## Arbeitsteilung (Entscheidung 13.06.2026)

Die echte Fixture `cashBalance.json` wird vom **unabhängigen Prüfer** aus
den Altdaten erzeugt — mit der Original-Logik (`useCashBalanceData` +
`compute_carry_over` aus `tagesabrechnung-main`) und Pseudonymen
`KELLNER_01…`. Der Erbauer dieses Moduls (Lovable) liefert die Fixture
nicht selbst, weil sonst Test und Modul aus derselben Quelle stammen
(zirkulärer Test).

Bis die echte Fixture geliefert ist, liegt hier eine kleine,
**handgerechnete** synthetische Platzhalter-Fixture (5 Tage, alle
Beträge in Cents als Integer). Sie dient ausschließlich als Smoke-Test,
dass Format und Harness funktionieren.

## Format

`cashBalance.json` enthält:

- `meta`: Beschreibung der Quelle (synthetisch vs. echt).
- `openingBalanceCents`: Eröffnungssaldo der Kette (Integer Cents).
- `days[]`: Tage in aufsteigender Reihenfolge mit Eingaben, Satelliten,
  Kellner-Settlements und `expected`-Werten (delta, balance,
  deficitCarriedFromPrevious).

Format-Wechsel zwischen Platzhalter und echter Fixture: **keiner** —
der Harness läuft unverändert weiter.

## Rechenweg der Platzhalter-Fixture

`kitchenTipRate` = 0.02. Eröffnungssaldo 500_00 Cents.

| Tag        | gross   | vSold | vRedm | fineD | exp    | adv    | dep    | tIn    | tOut   | Δ       | Saldo   |
| ---------- | ------- | ----- | ----- | ----- | ------ | ------ | ------ | ------ | ------ | ------- | ------- |
| 2026-06-01 | 800_00  | 0     | 0     | 0     | 50_00  | 0      | 0      | 0      | 0      | 750_00  | 1250_00 |
| 2026-06-02 | 900_00  | 50_00 | 30_00 | 0     | 0      | 100_00 | 400_00 | 0      | 0      | 420_00  | 1670_00 |
| 2026-06-03 | 600_00  | 0     | 0     | 20_00 | 25_00  | 0      | 500_00 | 0      | 0      | 55_00   | 1725_00 |
| 2026-06-04 | 50_00   | 0     | 0     | 0     | 400_00 | 0      | 0      | 200_00 | 0      | -150_00 | 1575_00 |
| 2026-06-05 | 1000_00 | 0     | 0     | 0     | 0      | 0      | 0      | 0      | 100_00 | 900_00  | 2475_00 |

Kellner Tag 1 (`KELLNER_01`): pos=400_00, card=300_00, hilf=5_00,
open=10_00, rate=0.02 → differenz = 40000+500−1000−30000 = 9500,
kitchen_tip = round(40000\*0.02) = 800.
