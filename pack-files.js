"use strict";
const M = require("./model");
const crypto = require("crypto");
const MAX_BYTES = 2 * 1024 * 1024;
async function read(vscode, uri, fallback = M.empty) {
  try {
    const bytes = await vscode.workspace.fs.readFile(uri);
    if (bytes.length > MAX_BYTES) throw new Error("Rule file exceeds 2 MB.");
    return M.validate(JSON.parse(Buffer.from(bytes).toString("utf8")));
  } catch (e) {
    if (e.code === "FileNotFound" || e.code === "ENOENT") return fallback();
    throw new Error(`Cannot load ${uri.fsPath}: ${e.message}. Fix the file before importing rules.`);
  }
}
async function importPack(library, vscode, scopeId, shared = false) {
  const initial = await library.dispatch("state");
  const scope = library.scope(scopeId);
  const files = shared ? [scope.uri] : await vscode.window.showOpenDialog({canSelectMany:false, filters:{"ConPin rule pack":["json"]}, title:"Import rules into SQLite"});
  if (!files?.length) return;
  const incoming = await read(vscode, files[0], () => { throw new Error("Import file was not found."); });
  const preview = M.mergePack(library.packs[scopeId], incoming);
  const choice = await vscode.window.showInformationMessage(`Import into ${scope.name}?`, {
    modal:true, detail:`${incoming.rules.length} rules and ${incoming.presets.length} presets.\n${preview.added} new rules; ${preview.duplicates} duplicate rules.\n\n${incoming.rules.map(r=>r.title).join(", ")}\n\nExisting rules are kept unless you choose Replace matches. Project defaults and overrides remain local.`,
  }, "Keep existing", "Replace matches");
  if (!choice) return;
  return library.dispatch("importReviewed", {scope:scopeId, revision:initial.revision, project:initial.project, incoming, replace:choice === "Replace matches"});
}
async function exportPack(library, vscode, scopeId, selectedOnly, shared = false) {
  const state = await library.dispatch("state");
  if (!library.packs[scopeId]) throw new Error("Choose an available library.");
  let pack = library.packs[scopeId];
  if (selectedOnly) pack = M.subset(pack, state.rules.filter(r=>r.scope === scopeId && state.selected.includes(r.key)).map(r=>r.id));
  const scope = library.scopes.find(s=>s.id === scopeId);
  const file = shared ? library.scope("project").uri : (await vscode.window.showSaveDialog({
    defaultUri:vscode.Uri.file("conpin-pack.json"), filters:{"ConPin rule pack":["json"]}, title:`Export ${scope.name} rules`,
  }));
  if (!file) return;
  if (shared && await vscode.window.showWarningMessage(`Export ${scope.name} rules to .context-pouch/rules.json?`, {modal:true, detail:"This replaces that shared file with the current project rules and presets. Local defaults and global overrides are not exported."}, "Export") !== "Export") return;
  if (shared && (await library.dispatch("state")).revision !== state.revision)
    throw new Error("The project or library changed during export. Review the latest rules and export again.");
  const dir = vscode.Uri.joinPath(file,"..");
  await vscode.workspace.fs.createDirectory(dir);
  const temporary = vscode.Uri.joinPath(dir, `.pouch-export-${crypto.randomUUID()}.tmp`);
  try {
    await vscode.workspace.fs.writeFile(temporary, Buffer.from(JSON.stringify(pack,null,2)+"\n"));
    await vscode.workspace.fs.rename(temporary, file, {overwrite:true});
  } finally {
    try { await vscode.workspace.fs.delete(temporary); } catch (_) {}
  }
}
module.exports = { read, importPack, exportPack };
