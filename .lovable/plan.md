## Ziel
Neben der bestehenden Klammer mit Betriebszugehörigkeit (z. B. `ANDI (2-11)`) eine weitere Klammer mit dem aktuellen Alter des Mitarbeiters anzeigen: `ANDI (2-11) (34)`.

## Umsetzung

**1. Datenquelle erweitern** — `src/lib/admin/staff.functions.ts` (`listStaff`)
- Beim bestehenden `supabaseAdmin.from("staff_personal_details").select(...)` das Feld `date_of_birth` mit abfragen.
- Zweite Map `birthDates: Map<string, string | null>` befüllen.
- `StaffRow` (in derselben Datei) um `dateOfBirth: string | null` ergänzen und im Return-Mapping setzen.

**2. Reines Alters-Helferchen** — neu `src/lib/profile/age.ts` (+ Test `age.test.ts`)
- `computeAgeYears(birthDate: string | null, today?: Date): number | null` — Jahre gemäß Kalender (Geburtstag im laufenden Jahr berücksichtigt), `null` bei fehlendem/ungültigem Datum oder Zukunftsdatum. Testfälle: vor/nach Geburtstag, Schaltjahr 29.02., ungültige Eingabe, null.

**3. Anzeige** — `src/routes/_authenticated/admin/staff.index.tsx` (Zeilen 500–506)
- Direkt nach der Tenure-Klammer eine zweite `<span>` mit `({computeAgeYears(staff.dateOfBirth)})` rendern, sofern nicht null.
- Gleiche Optik: `ml-1 font-normal text-muted-foreground`.

## Nicht anfassen
Tenure-Formatierung, Sortierung, Berechtigungen, weitere Spalten. Kein neues Feld in Formularen — `date_of_birth` wird nur gelesen.

## Erfolgs-Gate
`tsc --noEmit` 0; `vitest run` grün (neue Age-Tests blockierend); UI zeigt hinter der Tenure-Klammer eine zweite Klammer mit dem Alter — fehlt das Geburtsdatum, erscheint keine zweite Klammer.