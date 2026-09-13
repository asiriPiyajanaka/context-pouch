# ConPin privacy

ConPin has no analytics, telemetry service, or ConPin-operated backend.

## Local data

Rules, presets, source references, project folder URIs, defaults, selections, and relationships are stored in `pouch.sqlite` under ConPin's VS Code global storage. VS Code state stores UI and generation preferences. Draft edits and queued session corrections live in webview memory. Exported JSON packs include rule text and source paths; inspect them before sharing.

API keys are stored through VS Code SecretStorage, never sent to a webview, and never included in rule packs. Run **ConPin: Set OpenAI API Key** and submit an empty value to remove the key. ConPin does not store your Codex login credentials.

## Data sent when you use a provider

Generating rules sends the selected Markdown documents, their project-relative paths, and existing project rule text and scope to the provider you choose. ConPin displays document and provider choices first. Provider use can incur charges on your account. Generated suggestions are saved only after review and explicit save.

The OpenAI API adapter calls `https://api.openai.com/v1/responses` with your chosen model, `store: false`, and no tools. This request setting does not itself promise zero provider retention. The Codex CLI adapter invokes your locally installed, authenticated CLI with document contents on stdin. Provider handling is governed by your provider's account settings and policies.

Inserting rules adds editable text to the Codex draft. Sending the draft transmits that text through Codex. **Send correction** explicitly submits the reviewed text to the selected running conversation. ConPin cannot delete data already sent to a provider.

## Removal and migration

Export any rules you want to keep, remove the API key using the command above, and run **ConPin: Restore Codex** before disabling or uninstalling. Closing all VS Code windows discards in-memory drafts and queued corrections.

To remove the local database, close VS Code and delete ConPin's extension-specific global storage directory, including SQLite WAL/SHM files. Its directory name is the publisher plus `.conpin` (currently `asiri-local.conpin`) beneath your VS Code profile's `globalStorage`. Do not delete the entire shared `globalStorage` directory. Also remove any JSON packs you exported, including `.context-pouch/rules.json`, if no longer needed. Uninstalling alone is not a data-erasure operation.

Migration from Context Pouch copies the old database without deleting it. Remove the previous extension's storage separately if desired. Old extension API keys must be removed through that extension before uninstalling it. ConPin cannot read or delete another extension's secrets.
