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

- [ ] Verify activation and built-in SQLite on VS Code 1.101.0 and current stable; adjust `engines.vscode` if the claimed minimum fails.
- [ ] Verify current installed Codex compatibility and record exact tested versions. The README's development bundle coverage is not a live support matrix.
- [ ] On each supported OS: clean install, explicit consent/cancel, reload, repair after upgrade, restore, disable, uninstall, reinstall, and standalone recovery.
- [ ] Confirm Restricted Mode, virtual workspaces, and remote windows cannot activate the integration.
- [ ] Test migration from the old extension with a real profile; confirm API key re-entry and unchanged original storage.
- [ ] Verify draft text/attachments, correction target and timing, cancellation, navigation, and recovery after delivery failure in real Codex.
- [ ] Verify Codex CLI and OpenAI generation with non-sensitive sample documents and the account owner's credentials.
- [ ] Complete keyboard, screen-reader, focus, narrow-pane, theme, and reduced-motion review in VS Code.

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
