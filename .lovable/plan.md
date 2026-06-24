## Änderung

In `src/routes/_authenticated/admin/staff.index.tsx`, Zeile ~431, in der Namens-Spalte der Mitarbeiter-Matrix:

Die zweite Zeile unter dem `displayName` (aktuell `{staff.email ?? "—"}`) zeigt künftig **Vorname + Nachname** statt der E-Mail-Adresse.

```tsx
// vorher
<span className="truncate">{staff.email ?? "—"}</span>

// nachher
<span className="truncate">
  {[staff.firstName, staff.lastName].filter(Boolean).join(" ") || "—"}
</span>
```

`firstName` und `lastName` werden bereits von `listStaff` zurückgegeben (siehe `src/lib/admin/staff.functions.ts`), kein Server- oder Query-Umbau nötig.

## Nicht angefasst

- Die E-Mail-Adresse bleibt in der Detailseite (`staff.$staffId.tsx`) und im Konto-Dialog unverändert sichtbar.
- Datenmodell, Server-Functions, Sortierung/Suche bleiben gleich (Suche filtert weiter über `displayName` + `email`).
- Keine anderen Spalten/Seiten verändert.

## Erfolgs-Gate

`bunx prettier --check .`, `bunx tsgo --noEmit`, `bunx eslint . --max-warnings=5`, `bunx vitest run` — alle grün.
