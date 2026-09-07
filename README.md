# Context Pouch for Codex

Reusable constraints beside the Codex composer, with a connected rule graph in a VS Code editor tab.

## Use Pouch

- Click the **Pouch** button beside the composer to search, select, add, or edit rules.
- Choose **Preview & inject** or **Reinforce selected** to review the exact instructions before inserting them. An existing Pouch block is replaced instead of duplicated. **Remove draft block** removes those marked instructions.
- Click **Graph ↗**, run **Context Pouch: Open Rule Graph**, or press **Cmd+Alt+P** (Windows/Linux: **Ctrl+Alt+P**) to open the graph in a new tab.
- In the graph, click a rule to inspect or edit it. Drag nodes, pan the background, scroll to zoom, or use **Fit**. Categories and presets connect their member rules; related-rule links are editable. **Local graph** shows a rule's immediate connections. The sidebar provides keyboard-accessible rule navigation.
- Checkboxes in the graph and composer share the same selection. Save a selection from one library as a named **task preset**, then apply it in either view.
- Use **Import pack** and **Export** in the graph to exchange JSON packs. Import previews titles and duplicate counts, then lets you keep existing matches or replace them. Export a whole library or selected rules with their complete presets.

## Libraries

Personal rules are stored in the extension's global storage as `rules.json`. Existing MVP rules migrate from the Codex webview on its first successful connection; their old browser storage is retained.

Project rules and presets live in `.context-pouch/rules.json` inside the repository. They can be committed and shared with teammates. In a multi-root workspace, use the graph's project selector. Project edits require a trusted workspace. Files changed outside Pouch are reloaded; stale edits are rejected instead of overwriting newer data.

A pack uses this structure (related-rule and preset IDs refer to rules in the same library):

```json
{
  "version": 1,
  "rules": [
    {
      "id": "focused-changes",
      "title": "Keep changes focused",
      "category": "Code",
      "text": "Only modify code needed for the requested behavior.",
      "related": []
    }
  ],
  "presets": [
    { "id": "bug-fix", "title": "Small bug fix", "ruleIds": ["focused-changes"] }
  ]
}
```

## Install locally

Run `npm run package`, then use VS Code's **Extensions → … → Install from VSIX…** with the generated `dist/context-pouch-codex-0.2.0.vsix`.

Run **Context Pouch: Install / Repair Codex Button**, then reload VS Code. Updating Pouch also requires repairing the patch and reloading; when enabled, automatic repair detects changes in both Pouch and Codex.

**Context Pouch: Restore Codex** restores the original bundles and keeps your rule library. Reload afterward. Restore before uninstalling Pouch.

## Integration limits

This remains an experimental patch of the Codex extension (`openai.chatgpt`). It patches the webview entry, the API-acquisition chunk (which may be part of the entry in some builds), and the extension host to route Pouch messages to its shared library. Each modified file has a pristine backup and integrity metadata. Unsupported bundle structures or unexpected external changes stop installation instead of being overwritten.

The current target is local desktop VS Code. Remote extension-host combinations have not been verified. The graph and composer were checked in a browser harness; the patch was checked against copies of the installed Codex bundles. Full integration still needs verification after installation and reload in VS Code.

Instructions are included in the prompt; Pouch does not enforce agent compliance. Draft editing relies on the current Codex contenteditable composer. Pouch preserves surrounding draft content and refuses to replace a marked block containing attachments.

## Development

No runtime dependencies. `npm run check` checks JavaScript syntax; `npm test` checks storage, import/export, prompt blocks, and patch restoration.
