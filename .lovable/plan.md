## H1b — CI-Selbstauslösung nach Prettier-Autofix

Nur `.github/workflows/ci.yml` anfassen.

### Änderungen

1. **`on:`-Block erweitern** — `workflow_dispatch:` ergänzen (push-Block unverändert), mit Kurzkommentar, dass dies der dokumentierte Ausweg aus dem GITHUB_TOKEN-Rekursionsschutz ist und der `autoformat`-Job wegen `github.event_name == 'push'` in dispatchten Runs übersprungen wird (keine Endlosschleife).

2. **`autoformat`-Job `permissions:`** — `actions: write` zusätzlich zu `contents: write`.

3. **Neuer Step nach `git push origin HEAD:main`** im „Commit & push, falls Diff"-Step:
   ```yaml
   gh workflow run ci.yml --ref main
   ```
   mit `GH_TOKEN: ${{ secrets.GITHUB_TOKEN }}`.

### Nicht anfassen

- `format`, `check`, `db-integration`, `e2e` (inkl. `continue-on-error`)
- Bestehende `if:`-Bedingung des `autoformat`-Jobs (beginnt mit `github.event_name == 'push'` → dispatch-Run überspringt den Job automatisch)
- Alle anderen Dateien

### Vor Commit

`npx prettier --write .github/workflows/ci.yml`.

### Erfolgs-Gate

- Diff ausschließlich in `.github/workflows/ci.yml`
- `check`-Job dieses Commits grün
- Beim nächsten natürlich auftretenden Autofix bekommt der Bot-Commit einen eigenen vollständigen CI-Run
