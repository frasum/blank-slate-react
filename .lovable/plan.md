## Ziel
PostgREST-Filter-Injection im namensbasierten PIN-/Passwort-Login schließen: `firstName` wird strikt per Unicode-Allowlist validiert; ungültige Eingaben führen zur generischen Ablehnung. Die `.or()`-Query bleibt strukturell unverändert — die Interpolation ist sicher, weil der Wert garantiert keine PostgREST-DSL- oder Wildcard-Zeichen (`, . ( ) : * % _ \`) mehr enthält.

Verhalten bleibt: Treffer auf `first_name` ODER `display_name`, case-insensitive, exakt (ilike ohne Wildcards = exakter Vergleich). Fehlermeldung „Anmeldung fehlgeschlagen" bleibt einheitlich.

## Änderungen

### 1) `src/lib/auth/auth-flows.server.ts`
- `toPostgrestIlikeLiteral` entfernen.
- Neu exportieren:
  ```ts
  export function validatePinLoginName(value: string): string | null {
    const trimmed = value.trim();
    return /^[\p{L}][\p{L} \-]*$/u.test(trimmed) ? trimmed : null;
  }
  ```

### 2) `src/lib/auth/auth-flows.functions.ts`
- Import `toPostgrestIlikeLiteral` → `validatePinLoginName`.
- Im `validatePin`-Handler vor der Kandidaten-Query:
  ```ts
  const term = validatePinLoginName(data.firstName);
  if (!term) {
    console.error("[pin-login] invalid name input");
    failed();
  }
  ```
- `.or(`first_name.ilike.${term},display_name.ilike.${term}`)` bleibt unverändert (sicher durch Allowlist).

### 3) Neuer Test `src/lib/auth/auth-flows.server.test.ts`
- Gültige Namen unverändert (`"Anna"`, `"Anna-Maria"`, `"Lara Müller"`, `"Renée"`).
- Trimmt umschließende Leerzeichen.
- Lehnt mit `null` ab: `"a%"`, `"x.eq.1"`, `"a,b"`, `"a*"`, `"a(b)"`, `"a:b"`, `""`, `"   "`, `"a\\b"`.

## Nicht angefasst
- `resolveBadgeToken`, `tryStaffPasswordLogin`, PIN-Loop, `pin-validation.test.ts`.

## Verifikation
- `npx prettier --write` + `npx eslint --fix` auf geänderten/neuen Dateien.
- `tsc --noEmit`, `eslint .`, `prettier --check .`, `vitest run` alle grün.
- `grep -rn "toPostgrestIlikeLiteral" src/` → 0 Treffer.
