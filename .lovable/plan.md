## Ziel

Im CI-Workflow `.github/workflows/ci.yml` einen expliziten, früh laufenden Schritt ergänzen, der genau `npx prettier --check docs/arbeitsweise.md` ausführt. So bricht CI bei Formatproblemen an dieser Datei sofort und mit klarer Fehlermeldung ab — bevor der breitere `bun run format:check`-Lauf (der ohnehin alles abdeckt) startet.

## Hinweis zur Code-Realität (Ehrlichkeitsregel)

Der existierende Schritt `bun run format:check` (= `prettier --check .`) prüft `docs/arbeitsweise.md` bereits mit. Der neue Schritt ist also **redundant in der Abdeckung**, aber nützlich als **früher, namentlich klar zugeordneter Gate-Schritt** ("Doku-Format: arbeitsweise.md"). Falls du stattdessen nur Umbenennung/Vorziehen ohne Dublette willst, sag Bescheid — dann lasse ich den globalen Schritt weg bzw. ordne nur um.

## Änderung

Datei: `.github/workflows/ci.yml`, Job `format` — neuer Step **vor** `bun run format:check`:

```yaml
      - name: Doku-Format prüfen (arbeitsweise.md)
        run: npx --yes prettier@3.7.3 --check docs/arbeitsweise.md
```

Version an `package.json` (`prettier ^3.7.3`) gepinnt, damit lokal und in CI identisch formatiert wird. `--yes` unterdrückt den npx-Prompt.

Optional analog im Job `check` direkt nach `actions/checkout` — dort läuft `bun run format:check` ebenfalls; ich würde es **nicht** doppeln und nur im `format`-Job hinzufügen, da der `format`-Job genau dafür da ist.

## Nicht angefasst

- `package.json`-Scripts
- `.prettierrc` / `.prettierignore`
- der bestehende `bun run format:check`-Step
- der `check`-Job
