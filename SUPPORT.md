# ConPin support and recovery

Report ordinary bugs at [GitHub Issues](https://github.com/asiriPiyajanaka/context-pouch/issues). Include ConPin, Codex, VS Code and OS versions, steps, expected behavior, and a redacted error or screenshot. See [SECURITY.md](SECURITY.md) for vulnerabilities.

## Installation and updates

Use a trusted, local desktop VS Code window. Remote SSH, WSL, containers, virtual workspaces, and browser VS Code are unsupported. Install Codex (`openai.chatgpt`) locally to use composer integration. The rule library can be used without Codex.

Run **ConPin: Install / Repair Codex Button**, review the modification notice, then reload. If Codex's bundle layout is unsupported, the integration refuses installation. An unsupported session adapter keeps ordinary draft insertion available. Disable `conpin.autoRepatch` to stop automatic repair.

## Restore before disabling or uninstalling

Run **ConPin: Restore Codex**, reload, then disable or uninstall ConPin. This keeps your rule library. Disabling or uninstalling ConPin does not automatically undo its changes to Codex. A disabled extension cannot run its Restore command.

If ConPin is already disabled, re-enable it in a trusted local window and restore. If it is uninstalled, reinstall it and restore. If ConPin cannot activate, use the standalone recovery script below or reinstall a fresh copy of Codex through VS Code's Extensions view.

## Standalone recovery

Requires Node.js 22.15 or newer and a checkout of this repository; no npm dependencies are needed. Identify the installed Codex directory, normally under `~/.vscode/extensions` on macOS/Linux or `%USERPROFILE%\.vscode\extensions` on Windows. Insiders and custom extension directories differ.

Preview validates the installed extension identity and every backup before changing anything:

```sh
npm run recover -- "/absolute/path/to/openai.chatgpt-version-platform"
```

Close **all** VS Code windows, then restore the validated bundles:

```sh
npm run recover -- "/absolute/path/to/openai.chatgpt-version-platform" --apply
```

Start VS Code again. The script preserves libraries and refuses mismatched backups or externally changed files. It does not force recovery over a partial/corrupt bundle: reinstall Codex if integrity checks fail. If ConPin remains enabled, turn off `conpin.autoRepatch` before restarting to prevent automatic reinstallation.

## Migrating from Context Pouch

Restore Codex with the old extension, disable it, and reload before installing ConPin. Avoid running both integrations together. ConPin's new extension ID gives it separate VS Code state and secrets.

On first activation, if ConPin has no database, it snapshots `asiri-local.context-pouch-codex/pouch.sqlite` from the same VS Code profile's global storage. Rules, presets, closed projects, selections, and database preferences are copied, including committed WAL changes. The previous database stays intact. An existing ConPin database is never overwritten. Older global `rules.json` is copied when no old SQLite database exists.

Re-enter the API key, set `conpin.codexPath` if needed, select your active project, and enable integration again. Settings and SecretStorage are not copied. Another profile or publisher requires JSON export/import instead. Project packs retain `.context-pouch/rules.json` for compatibility. Internal patch markers, database filenames, and browser message identifiers also retain their legacy names.

## Backup and data removal

Use JSON exports for portable rules. To back up the complete database with local preferences, close all VS Code windows first and copy its storage directory. See [PRIVACY.md](PRIVACY.md) for removal instructions.
