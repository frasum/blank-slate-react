## Diagnose

Aktuell stehen **9 gleichrangige Tabs** in einer Reihe (Mitarbeiter, Zeitübersicht, Dienstplan, Kasse, Kassensaldo, Bestellung, Standorte, Migration, Zuordnungen) und die Verwaltungs-Startseite zeigt nochmal Karten für Mitarbeiter/Standorte — also doppelt zur Top-Nav. Zudem gehören mehrere Tabs offensichtlich zusammen:

- **Kasse + Kassensaldo** → ein Thema, zwei Klicks
- **Zeitübersicht + Dienstplan** → beides „Personalzeit"
- **Mitarbeiter** ist Stammdaten, steht aber gleichberechtigt zu Tools
- **Migration + Zuordnungen** sind reine Admin/System-Werkzeuge und sollten optisch hinten/leiser sein
- **Bestellung** hat als einziges Modul bereits eine saubere Sub-Nav — das wird zum Vorbild für alle anderen

## Vorschlag: 5 Bereiche, zweistufiger Header

Top-Nav reduziert sich auf **5 Bereiche**. Jeder Bereich rendert direkt darunter eine eigene **Sub-Nav-Zeile** (das Muster, das `bestellung.tsx` schon nutzt). So sieht man oben den Kontext, darunter sofort die Werkzeuge des Bereichs — keine versteckten Dropdowns, keine Doppel-Klicks.

```text
┌───────────────────────────────────────────────────────────────────────────┐
│  COCO  /  Verwaltung                                            ← Zurück   │
│                                                                            │
│  Personal   Kasse   Bestellung   Stammdaten      ·      System            │
│  ─────────                                                                 │
│  Mitarbeiter · Dienstplan · Zeitübersicht                                  │
└───────────────────────────────────────────────────────────────────────────┘
```

### Bereiche und Inhalte

| Bereich        | Sub-Nav                                                    | Ziel-Route (URL bleibt)                  |
| -------------- | ---------------------------------------------------------- | ---------------------------------------- |
| **Personal**   | Mitarbeiter · Dienstplan · Zeitübersicht                  | `/admin/staff`, `/admin/dienstplan`, `/admin/zeit-uebersicht` |
| **Kasse**      | Tagesabschlüsse · Saldo                                    | `/admin/kasse`, `/admin/kasse-saldo`     |
| **Bestellung** | Warenkorb · EasyOrder · EasyOrder-Verwaltung · Bestellungen · Lieferanten · Artikel · Inventur · Wein · Wein-Quiz | wie heute |
| **Stammdaten** | Standorte                                                  | `/admin/locations`                       |
| **System** (nur `admin`, optisch leiser, rechts nach Trenner) | Migration · Zuordnungen | `/admin/migration`, `/admin/import-zuordnungen` |

Payroll-Rolle: unverändert — nur `/admin/zeit-uebersicht`, keine Bereichs-Nav.

### Active-Logik

Der Top-Tab eines Bereichs ist aktiv, wenn der aktuelle Pfad mit einer seiner Routen beginnt (z. B. `/admin/staff*` → „Personal" aktiv). Active-Style: voller Foreground + Unterstrich, wie heute. Sub-Nav nutzt das bestehende `activeProps`-Muster.

### Default-Landingpage je Bereich

Klick auf „Personal" landet auf `/admin/staff` (häufigster Einstieg), „Kasse" auf `/admin/kasse`, „Stammdaten" auf `/admin/locations`. Bestellung behält `/admin/bestellung` (Übersicht). System landet auf `/admin/migration`.

### Verwaltungs-Startseite `/admin`

Wird zur **echten Übersicht**, nicht zur dritten Nav-Variante: die 5 Bereiche als Karten, jede mit den enthaltenen Werkzeugen als kurze Aufzählung. Keine Dopplung mehr zur Top-Nav, sondern die Karte erklärt, was drinsteckt:

```text
┌─────────────────────────────┐  ┌─────────────────────────────┐
│ Personal                  → │  │ Kasse                     → │
│ Mitarbeiter, Dienstplan,    │  │ Tagesabschlüsse, Saldo      │
│ Zeitübersicht               │  │                             │
└─────────────────────────────┘  └─────────────────────────────┘
┌─────────────────────────────┐  ┌─────────────────────────────┐
│ Bestellung                → │  │ Stammdaten                → │
│ Warenkorb, EasyOrder, …     │  │ Standorte                   │
└─────────────────────────────┘  └─────────────────────────────┘
                  ┌─────────────────────────────┐
                  │ System (admin)            → │
                  │ Migration, Zuordnungen      │
                  └─────────────────────────────┘
```

## Umsetzungs-Schritte (kein DB-/Routen-Umbau)

1. **`admin/route.tsx`**: Top-Nav neu schreiben — 5 Gruppen statt 9 Items. Helper `groupActive(prefixes: string[])` für Pfad-Prefix-Match. „System"-Gruppe nach einem `·`-Trenner, leicht gedimmt, nur für `admin`.
2. **Sub-Nav für die neuen Gruppen**: pro Gruppe eine kleine `<GroupSubnav>`-Komponente (Personal, Kasse, Stammdaten, System), gerendert direkt unter der Top-Nav-Zeile, sobald der Pfad zur Gruppe passt. Für „Bestellung" bleibt die existierende Sub-Nav in `bestellung.tsx` unverändert.
3. **`admin/index.tsx`**: 5 Bereichs-Karten statt 2; jede Karte verlinkt auf die Default-Route ihres Bereichs und listet die enthaltenen Werkzeuge.
4. **Keine URL-Änderungen**, keine Routen-Dateien verschoben, keine DB-Migration, keine Logik-Änderung. Payroll-Redirect bleibt.

## Offene Frage vor dem Bauen

Soll die Reihenfolge der 5 Bereiche so bleiben (Personal → Kasse → Bestellung → Stammdaten → System), oder hast du eine andere Priorität für den Alltag? Wenn keine Antwort, baue ich in dieser Reihenfolge.
