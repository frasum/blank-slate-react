## Ausgangslage

Sumitr (`2e52c42f-…`, Rolle `planer`) hat aktuell für **Küche @ spicery** und **Küche @ YUM** bereits:

- `roster.shift.manage` (Dienstplan bearbeiten)
- `roster.absence.manage` (Abwesenheiten pflegen)

Was fehlt, damit er in `/admin/urlaub` (Urlaubsanträge + Schichttausch) und im Jahresplaner (Urlaubspläne) etwas sieht: die beiden Sicht-Rechte, jeweils gescoped auf Küche × beide Standorte. Die PL1-Infrastruktur (`resolvePlanerScope` in `leave.functions.ts`, `swap.functions.ts`, `vacation-planner.functions.ts`) filtert dann automatisch auf genau seinen Scope.

## Änderung

Eine Migration, die vier `permission_overrides`-Zeilen anlegt (idempotent via `delete + insert`, entsprechend dem bestehenden Muster aus `setPermissionOverride`):

| Recht                       | Standort  | Bereich | Effekt |
| --------------------------- | --------- | ------- | ------ |
| `roster.leave.view_all`     | spicery   | kitchen | allow  |
| `roster.leave.view_all`     | YUM       | kitchen | allow  |
| `roster.swap.view_pending`  | spicery   | kitchen | allow  |
| `roster.swap.view_pending`  | YUM       | kitchen | allow  |

`roster.leave.view_all` deckt sowohl `/admin/urlaub` (Anträge-Liste) als auch den Jahresplaner ab — beide rufen dieselbe Permission ab.

## Konsequenzen im UI (schon vorhanden)

- `/admin/urlaub` (Tab „Urlaubsantrag / Schichttausch") wird für Sumitr sichtbar; sieht nur Küchen-Anträge und Küchen-Tauschanfragen aus spicery + YUM (Service-Anträge desselben Standorts bleiben unsichtbar).
- Jahresplaner zeigt nur den Küche-Block seiner beiden Standorte.
- Badge-Zähler oben (`getReviewPendingCounts`) berücksichtigen den gleichen Scope.
- Dienstplan & Abwesenheiten bleiben unverändert (bestehende `manage`-Overrides).

## Bewusst nicht enthalten

- **Keine Entscheid-Rechte** (`roster.leave.decide`, `roster.swap.decide`). Anfragen sind sichtbar, aber nicht entscheidbar. Sag Bescheid, falls Sumitr auch entscheiden können soll — dann kommen zwei weitere Overrides dazu.
- **Kein Rollen- oder Katalogumbau** — reine Datenänderung.
- **TSB** wird nicht ergänzt (Anweisung: „von beiden Standorten" = spicery + YUM).

## Erfolg

- SQL läuft, vier neue Zeilen in `permission_overrides` vorhanden.
- Manuell (Frank): Login als Sumitr → `/admin/urlaub` sichtbar, listet Küchen-Anträge/Tauschanfragen aus spicery + YUM; Service-Einträge desselben Standorts unsichtbar; Jahresplaner zeigt nur Küche.
