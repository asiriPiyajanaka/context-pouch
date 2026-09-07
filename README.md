# Context Pouch for Codex — MVP

A local VS Code extension that adds a small **Pouch** button directly to the Codex composer. Pick reusable constraints and inject them into the current prompt whenever the agent starts drifting.

## What this test build does

- Adds a Pouch button near the top-right of the Codex prompt composer.
- Stores reusable rules locally inside the Codex webview.
- Ships with starter rules such as **Use existing app buttons**, **Do not add new buttons**, **Reuse existing components**, **Do not change navigation**, and **Do not refactor unrelated code**.
- Lets you add, edit, delete, search, filter, and select rules.
- **Inject selected** appends the selected rules to the current Codex prompt.
- **Reinforce selected** appends them as a constraint reminder for a follow-up.
- Keeps your selection during the current VS Code session.
- Makes a byte-for-byte backup of the Codex entry bundle before patching it.
- Includes **Context Pouch: Restore Codex** to revert the patch.
- Can re-apply itself after a Codex extension update.

## Install the VSIX

1. In VS Code open **Extensions**.
2. Click the `...` menu in the Extensions panel.
3. Choose **Install from VSIX...**.
4. Select `context-pouch-codex-0.1.0.vsix`.
5. When prompted, choose **Install into Codex** and then **Reload Window**.
6. Open Codex. The small pouch button should appear around the upper-right edge of the prompt box.

You can also run `Context Pouch: Install / Repair Codex Button` from the Command Palette.

## Remove it

Run `Context Pouch: Restore Codex` from the Command Palette and reload VS Code.

## Important

This is an experimental local patch because VS Code does not provide a supported API for one extension to place controls inside another extension's webview. A Codex update can change the internal bundle. The extension backs up the original file and refuses to guess outside the expected `webview/assets/index-*.js` structure.

This build targets the current Codex VS Code extension (`openai.chatgpt`) and has been prepared for macOS/local VS Code first. It has not been tested against every Codex version or Remote-SSH setup.
