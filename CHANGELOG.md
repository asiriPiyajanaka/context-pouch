# Changelog

## 0.4.1 — Unreleased

- Fix the composer connection failing with a circular JSON error when Codex requests library state before ConPin has activated. Activate ConPin explicitly and keep live webview objects out of the command transport.

## 0.4.0

- Rename Context Pouch to **ConPin**, with package name `conpin` and `conpin.*` commands and settings.
- Preserve rule-pack formats and patch backups; migrate the previous local SQLite library without changing its source.
- Explain Codex bundle modifications and recovery before enabling integration.
- Restrict activation to trusted, local desktop workspaces.
- Add standalone backup-validated recovery, standard VSIX packaging, package-content verification, and CI.
- Add license, privacy, security, support, and release documentation.

## Earlier local builds

Versions through 0.3.3 were distributed as Context Pouch for Codex. Consult Git history for their detailed development history. Version 0.4.0 uses a new extension identity rather than an in-place Marketplace upgrade.
