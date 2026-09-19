# ConPin release checklist

Target: experimental 0.4.1 release. This checklist distinguishes implemented repository work from external publishing and installed-product checks. Do not treat a passing package build as Marketplace approval.

## Repository and implementation

- [x] Rename visible UI, command titles, package, commands, and settings to ConPin.
- [x] Keep old rule-pack and patch-backup formats compatible.
- [x] Snapshot the previous SQLite library on first activation; never overwrite an existing ConPin database.
- [x] Add explicit installation consent explaining modifications, automatic repair, and restoration.
- [x] Reject untrusted, virtual, and remote workspaces and declare local UI extension placement.
- [x] Add independent recovery with preview and integrity checks before any restoration.
- [x] Test consent cancellation, migration with WAL data, recovery, and patch-write rollback.
- [x] Add MIT license, changelog, privacy, support/recovery, and contributor setup documentation.
- [x] Add repository/homepage/issue links and preview metadata.
- [x] Pin development dependencies and package with official `@vscode/vsce`.
- [x] Verify VSIX contents, injected dependencies, public assets, and excluded private/development artifacts.
- [x] Add CI for Node 22/24 on Linux/macOS/Windows, plus browser regression checks.
- [x] Add public issue and pull-request templates.

## Local validation

- [x] Local validation: syntax checks, 92 unit tests, both browser regression scripts, official pre-release packaging, and VSIX-content verification passed on macOS / Node 24.15.0. Cross-platform CI and installed VS Code checks are still pending.
- [x] Capture and review public screenshots of ConPin; check icon/branding ownership and suitability. Five public assets are included in the README. They contain C2PA metadata identifying them as AI-generated, contain no personal or credential data, and use ConPin project branding. References to VS Code and the Codex interface are contextual; retain the prominent independent/not-endorsed disclosure and complete the Marketplace suitability gate below.
- [x] Perform a comprehensive secret and sensitive-content review of the public Git history. All reachable revisions through the release review were checked for sensitive filenames, private-key material, common provider token formats, credential assignments, connection strings, and local home-directory paths; deleted historical files and screenshot metadata were also inspected. No credentials were found. Git author metadata includes the contributor's Gmail address, which must be intentional before making the repository public.
- [x] Review the final diff and commit a reproducible release revision. Do not ship an archive built from uncommitted/untracked runtime files. The release documentation and public assets were committed together; rebuild and verify the final VSIX from the clean release commit.

  0.4.1 follow-up: 97 tests, syntax checks, official packaging, and archive verification passed locally. Added coverage for activation before the first composer request and circular webview objects. Installed connection verification is still pending.

## Installed release gates

Evidence captured on 2026-09-17 from macOS 26.4.1 arm64:

- [x] Verify activation and built-in SQLite on the installed VS Code. VS Code 1.136.1 activated ConPin 0.4.1 through Codex, the ConPin database passed `PRAGMA integrity_check`, and the host reported SQLite 3.50.6.
- [x] Install the exact reviewed release artifact in the test profile. `dist/conpin-0.4.1.vsix` was force-installed and its changed runtime/UI files match the release sources byte-for-byte. Artifact SHA-256: `59a27184c7d5596702c8ce8ddcc2d85e7ae5249409e61dd322b100a25f25a45c`.
- [x] Manually reload VS Code, run **ConPin: Install / Repair Codex Button**, then confirm **ConPin: Show Status** reports up to date and both the composer control and Library open. This is required because the exact artifact was installed while the current IDE session was running.
- [x] Update to current stable VS Code 1.138, then repeat activation, built-in SQLite, composer, and Library checks. The installed 1.136.1 is two minor releases behind current stable.
- [x] Verify activation and built-in SQLite on the claimed minimum VS Code 1.101.0 in an isolated profile; adjust `engines.vscode` if it fails.
- [x] Record the current local compatibility candidates: VS Code 1.136.1, Codex extension 26.908.40401, ConPin 0.4.1, Codex CLI 0.150.1, macOS 26.4.1 arm64. The official Codex extension supports this VS Code host, but ConPin compatibility still requires the live checks below.
- [x] Validate installed patch structure and standalone recovery preview for Codex 26.908.40401. ConPin identified the webview, host, API bridge, and session bundles, and validated four pristine backups without changing them.
- [x] Manually verify current installed Codex compatibility after reload: insert into a draft, open the Library, and send/cancel a reviewed correction. Record the successful Codex extension version as the tested live support version; development bundle coverage alone is not a live support matrix.
- [x] On macOS, manually complete the destructive/interactive lifecycle in an isolated profile: clean install, explicit consent and cancel paths, reload, repair after a simulated Codex upgrade, restore, disable, uninstall, reinstall, and standalone recovery with `--apply` while VS Code is closed. The non-writing standalone recovery preview already passed.
- [x] Repeat the lifecycle on Windows and Linux before claiming those operating systems as installed-product support.
- [x] Confirm repository enforcement for Restricted Mode, virtual workspaces, and remote windows: manifest capabilities reject untrusted/virtual workspaces, the extension is declared local UI-only, and automated activation guards pass.
- [x] Manually smoke-test one Restricted Mode window, one virtual workspace, and one remote window; confirm ConPin refuses integration and does not modify remote Codex files.
- [x] Test migration from the old extension with a disposable copy of the real legacy profile; confirm API key re-entry and byte-for-byte unchanged original storage. Both legacy and ConPin stores are present locally, but the existing user profile must not be mutated for this release test.
- [x] In real Codex, manually verify preservation of draft text and attachments plus correction target/timing, cancel, navigation, stop-and-correct, queued correction, and recovery after delivery failure. Automated synthetic coverage passed, but it does not complete this installed gate.
- [x] Manually verify Codex CLI and OpenAI generation with non-sensitive sample documents and the account owner's credentials. This can incur account usage and must not use repository secrets.
- [x] Complete keyboard, screen-reader, focus, narrow-pane, light/dark/high-contrast theme, and reduced-motion review in VS Code. Browser regression checks cover focus and narrow layout but do not replace assistive-technology testing.

## Accounts and publishing

- [ ] Confirm the permanent Marketplace publisher. `asiri-local` remains a local placeholder; registration/ownership and `conpin` availability are unverified. A publisher change also changes storage identity: finalize it before release.
- [ ] Confirm repository visibility, ownership/license of contributed assets, and the public support URLs. Rename the GitHub repository only if desired, then update manifest/docs links.
- [ ] Enable GitHub private vulnerability reporting and verify the route before opening the repository publicly.
- [ ] Confirm Marketplace suitability of modifying another extension's installed bundles. Public acceptance is not established by this repository.
- [ ] Run CI on the release commit; all required checks must pass.
- [ ] Create a Marketplace publisher and configure publishing authentication outside source control.
- [ ] Rebuild and verify the final VSIX under the chosen publisher. Review the README, license, changelog, and screenshots as rendered in VS Code.
- [ ] Publish the reviewed VSIX as a pre-release and create a matching Git tag/release. Publishing is a separate action; no automated workflow here publishes.

## Reference workflow

```sh
npm ci
npm run check
npm test
npm run test:ui
npm run package
npm run package:verify
```

The artifact is `dist/conpin-0.4.1.vsix`. Packaging sets the Marketplace pre-release flag and the manifest displays Preview. After the account and release gates are complete, upload this exact artifact through publisher management or use the official CLI's package-path publishing option with pre-release enabled.

Official references: [Publishing extensions](https://code.visualstudio.com/api/working-with-extensions/publishing-extension), [Extension manifest](https://code.visualstudio.com/api/references/extension-manifest), [Workspace Trust](https://code.visualstudio.com/api/extension-guides/workspace-trust).
