# ConPin

A project-first rule library beside the Codex composer, with a brass-and-black interface. Keep reusable global rules, project defaults, and explicit overrides, then insert the active instructions as ordinary editable text.


**Experimental, independent integration for Codex. Not affiliated with or endorsed by OpenAI.** ConPin modifies the installed Codex extension after you enable integration. Restore Codex before disabling or uninstalling ConPin. See [recovery and migration](SUPPORT.md).

## Quick start

1. Install ConPin from a built VSIX in trusted, local desktop VS Code. Install the OpenAI Codex extension to use composer integration.
2. Run **ConPin: Open Rule Library** to create rules, import a pack, or generate reviewed suggestions from project documents.
3. Run **ConPin: Install / Repair Codex Button**, review the modification notice, and reload.
4. Open ConPin beside the Codex composer, select rules, and insert them into your editable draft.

ConPin is currently prepared for an experimental release; a public Marketplace listing is not yet confirmed. Remote workspaces and browser VS Code are unsupported.

[Privacy](PRIVACY.md) · [Support](SUPPORT.md) · [Changelog](CHANGELOG.md) · [Contributing](CONTRIBUTING.md) · [Release checklist](docs/release-checklist.md)

## Use the library

The Library keeps Rules, Presets, and Graph in separate views. Rules provides search, category and selected-only filters; checkboxes select instructions while titles open their details. Defaults, sources, and relationships expand when needed. In a narrow pane, Back to rules returns to the list with keyboard focus restored. The bottom bar keeps selection review available. Tools contains project defaults and import/export actions; presets and saving project defaults explain their effects before applying.

Open **Library ↗** beside the composer, run **ConPin: Open Rule Library**, or press **Cmd+Alt+P** (Windows/Linux: **Ctrl+Alt+P**).

- Choose the active project at the top. Projects are identified by folder URI, not display name; separate folders with identical names remain separate libraries. Moving a repository to a different path creates a new project identity; use a JSON export/import to transfer its rules.
- Project rules appear first. **Global rules** are available in every project in a collapsed section beneath them. Existing Personal rules migrate to Global automatically.
- Search and category filters narrow the list. Click a rule to read its instructions, sources, defaults, and relationships. Checkboxes select rules for the current task.
- **Make default** marks a project rule as a default. **Make global default** makes a global rule part of the default set across projects. Global defaults can be disabled or overridden for a particular project.
- **Save selection as defaults** remembers the current effective selection for this project. Global defaults omitted from that selection are disabled here. **Restore defaults** applies the saved defaults to the current task. Clearing a selection does not clear defaults. Project selections are remembered across switching and reopening.
- For a global rule, **Disable for this project** excludes it here while leaving it available in other projects. Use **Enable for this project** to reverse that choice.
- Save rules from one library as a named task preset. Applying a preset replaces the current task selection; it does not change defaults. Presets can be edited and deleted.

## Project priority and relationships

Priority is explicit, not inferred from rule titles or list order. In a project rule's details, choose **Override a global rule**. When that project rule is selected, the global rule is excluded from the active instructions. Deselecting the project rule makes the global rule eligible again. Folder-specific overrides must have matching scope so a narrow project rule cannot suppress a broader global instruction.

The **Graph** tab restores a node-and-edge view with three modes: **Project overview**, **Focused rule**, and **All rules**. All rules includes Global rules and every project already saved in SQLite, including closed projects. It does not scan unopened repositories. Connections have direction and labels:

- **Overrides:** a project rule supersedes a global rule in this project.
- **Related to:** manually linked rules within the same library.
- **Conflicts with · confirmed:** a conflict marked by the user for this project. If both rules are active, ConPin requires deselecting one before composer insertion. Removing an incorrect conflict is also possible in rule details.

The graph uses a free-form network layout with circular project nodes, diamond-shaped Global nodes, and soft labeled project clusters. Local repulsion, relationship attraction, and gentle project grouping arrange the network organically. There are no card grids or flowchart lanes. Selected nodes have an outline and check mark, while disabled/overridden globals are faded. Global status always refers to the active project, and project-specific connections carry the project name.

A collapsible filter panel offers project multi-select (All/Current shortcuts), categories, relationship types, search, and Reset. All rules starts with all globals visible. In project mode, only connected globals appear unless Show all global rules is enabled. Pan, zoom, Fit, and unrestricted node dragging are available; node positions remain stable for the lifetime of the view. Relationship labels appear when their node is focused or their connection is hovered, keeping the overview uncluttered. Layout settles without motion, including for reduced-motion users. The rule picker provides keyboard navigation and centers the chosen rule.

Clicking a node inspects it without changing selection. Use the separate **Use in prompt** checkbox for an active-project or global rule. Other projects are read-only previews; switch to an open project or open a saved project in a new window before editing/selecting its rules. Unrelated rules remain unconnected; categories remain available as filters and node subtitles.

Categories and presets are not graph nodes. A searchable rule picker and regular buttons make relationship navigation keyboard accessible. Conflict detection is manual; ConPin does not infer that two instructions contradict each other.

**Preview active instructions** shows the effective prompt: project rules first, with disabled and overridden globals excluded. Rule defaults, exclusions, overrides, and confirmed conflicts are local preferences; rule packs do not transfer them.

## Composer

Click **ConPin** beside the message composer. Normal mode provides a simple checklist with project, search, filter, and preset tools available on demand. Advanced keeps the same visual style and adds three working views:

- **Compose:** assemble the current task selection, add rules, edit instructions for this draft, restore saved wording, or remove a rule from the task. The working selection remains above the library picker.
- **Inspect:** see the exact text that will be inserted, included rules with their scope, disabled/overridden rules with explanations, and confirmed conflicts with actions to choose which rule to keep.
- **Manage:** edit saved rules, change defaults, enable/disable global rules for this project, create/update presets, generate reviewed suggestions, and open a specific rule in the Library to manage overrides and conflicts.

Draft-only edits are held in memory per project in the current ConPin webview. They survive switching modes and deselection, affect insertion in either mode, and never change saved rules, defaults, or presets. Reset draft edits or reload to discard them. They are not tied to a conversation: reset them when starting another task. If saved wording changes, the edit is marked so you can restore the latest saved wording. Presets store saved rule references; applying one replaces the selection. Saving defaults explains the project scope before saving.

The mode is remembered. The popup adapts to the pane, honors reduced motion, and closes with Escape or an outside click.

In advanced mode, choose **Review selected** to preview instructions, or **Prepare a reminder** within that review to prepare reinforcement text before insertion. Instructions append as plain text without tracking markers. Edit or delete them directly in the composer; inserting again adds another copy. Existing draft content and attachments are preserved. Folder scope is included in instruction text. ConPin adds instructions to the prompt; it does not enforce compliance or send the message automatically.

### Correct a running session

While Codex is working, select the relevant rules and choose **Correct running session**. Review the conversation shown, edit the correction (for example, “Replace the new button with our shared Button component”), choose when to apply it, then click **Send correction**:

- **Apply now** sends instructions to the running turn. Codex can reconsider its work when it processes the input; this does not immediately stop an executing operation. ConPin pins steering to the reviewed turn and shows an acceptance receipt; it does not guarantee compliance.
- **After this turn** queues one correction and starts a follow-up in the same conversation after that turn completes successfully. Use **Cancel queued correction** to remove it. Leaving the conversation, closing/reloading the view, a failed/interrupted turn, or a replacement turn cancels the queue. The queue lives in this view and is not saved across reloads.
- **Stop and correct** requests interruption of the reviewed turn, waits for confirmation, then starts the correction in the same conversation. Already completed edits are not rolled back; the correction asks Codex to review and fix them.

These actions send only the reviewed correction, preserving the composer draft and attachments. Unlike **Insert into draft**, **Send correction** directly submits instructions. Delivery errors are shown in ConPin and are not automatically retried; check the conversation before retrying if the connection was lost. The most recently submitted correction remains editable when reopening the dialog for the same project revision and conversation.

Session controls use an experimental adapter for recognized Codex manager bundles. The adapter has development coverage for Codex `26.901.22334` and the `26.908` bundle family; installed compatibility still needs release verification. Unsupported or ambiguous bundles retain draft insertion. Run **Install / Repair Codex Button** and reload after updating ConPin. Automated delivery and patch/restore tests do not replace an installed VS Code smoke test.

## Storage and migration

ConPin requires **VS Code 1.101 or newer** and uses built-in Node SQLite. There are no third-party runtime dependencies.

The working database is `pouch.sqlite` in the extension's VS Code global storage directory. It contains separate project/global libraries, rules, presets, source metadata, and project preferences. SQLite transactions protect writes, and stale edits from another view or window are rejected. Selection, defaults, exclusions, and relationship preferences are isolated by project. API keys remain in VS Code SecretStorage.

On first opening a library, ConPin copies its previous JSON data into SQLite:

- Personal `rules.json` becomes the Global library.
- A repository's `.context-pouch/rules.json` becomes that project's library.
- Existing project selection is retained.

Original files are left unchanged as migration backups. Invalid JSON blocks that library's migration with an actionable error; fix the file and retry. Once migrated, editing or deleting those JSON files does not modify the working database. New projects and Global libraries start with no predefined rules or presets. Project edits require a trusted workspace.

## Sharing with JSON

SQLite is the local source of truth. Use **Import pack** and **Export pack** for portable JSON. Import previews duplicate counts and lets you keep or replace matching rules. Export a whole library or selected rules and their complete presets.

Under **Share project rules**, explicitly import or export `.context-pouch/rules.json` for Git sharing. Export asks before replacing the repository file. Only rules, source metadata, related links, and presets are shared; selections and project preferences remain local. No automatic two-way synchronization runs between SQLite and JSON.

A minimal pack looks like:

```json
{
  "version": 1,
  "rules": [
    { "id": "focused", "title": "Keep changes focused", "category": "Code",
      "text": "Only modify code needed for the requested behavior.", "related": [] }
  ],
  "presets": [
    { "id": "bug-fix", "title": "Small bug fix", "ruleIds": ["focused"] }
  ]
}
```

## Generate project rules

Click **Generate rules** or run **ConPin: Generate Rules from Project**.

1. Choose project `.md`/`.mdc` documents. Agent instructions, README/CONTRIBUTING files, and docs are preselected. Dependency/build folders are excluded. Discovery lists up to 500 files; each must be under 64 KB and the selection under 200 KB. Paths resolving outside the project are rejected.
2. Choose **Codex CLI** or **OpenAI API key**. The prompt includes selected document contents and existing project rule text/scope. Provider choice is remembered.
3. Review suggestions, open source references, edit instructions, and deselect unwanted rules. Reported source conflicts appear before review. Save explicitly to add rules to the active project's SQLite library; use Export afterward to share them.

Codex requires a current CLI with `--ignore-user-config` support and a CLI login. Set `conpin.codexPath` if VS Code cannot find it. Extraction runs in an isolated temporary directory, read-only and ephemeral, with user config/rules ignored, shell tools disabled, and web search disabled.

For OpenAI, enter your own API key and a model ID supporting structured outputs. API usage is billed to your account. **ConPin: Set OpenAI API Key** replaces the saved key; submitting a blank value removes it. Keys are never sent to webviews or stored in project files. Requests use the Responses API with `store: false` and no tools.

Generation is cancellable and times out after three minutes. Cancelling or provider failure leaves rules unchanged. Exact normalized duplicates within the same folder scope are skipped. Changes to the project, library, or source documents during review require generating again. Generated rules keep source paths/line numbers and folder applicability through editing and import/export. Provider interpretations still need review. Claude integration and generated presets are not included.

## Install and test

Run `npm ci` and `npm run package`, then use **Extensions → … → Install from VSIX…** with `dist/conpin-0.4.0.vsix`. Run **ConPin: Install / Repair Codex Button** and reload VS Code after updating. Automatic repair detects changes in ConPin and Codex once enabled. Installation explicitly asks permission to modify Codex. Disable `conpin.autoRepatch` to turn automatic repair off.

**ConPin: Restore Codex** restores the original bundles and keeps your libraries. Restore before uninstalling ConPin, then reload.

For generation testing in this repository, include `AGENTS.md`, `CONTRIBUTING.md`, `docs/architecture.md`, and `media/AGENTS.md`. Expected coverage includes a 300-line limit for new code files, immutable values, modular code, provider boundaries, and folder-scoped webview rules. Exact suggestion titles/counts vary by provider.

Run `npm run check` and `npm test` for syntax, SQLite migration/persistence, project isolation, precedence, generation, rendering, and patch restoration checks. Run `npm run package` when shipped files change.

## Integration limits

This remains an experimental patch of `openai.chatgpt` for local desktop VS Code. It patches the webview entry/API acquisition and extension host. Modified files have pristine backups and integrity checks; unsupported bundles or external changes stop installation. Remote extension-host configurations are not verified. Full UI and live provider integration should be checked after installation/reload in VS Code.
