"use strict";

const CONSENT = "conpin.patchConsent.v1";
function assertLocalTrusted(vscode) {
  if (!vscode.workspace.isTrusted) throw new Error("Trust this workspace before using ConPin.");
  if (vscode.env.remoteName || vscode.workspace.workspaceFolders?.some(folder => folder.uri.scheme !== "file"))
    throw new Error("ConPin currently supports local desktop workspaces. Open a local VS Code window.");
}
async function approvePatch(vscode, context, quiet) {
  assertLocalTrusted(vscode);
  if (quiet && context.globalState.get(CONSENT, false)) return true;
  const choice = await vscode.window.showWarningMessage(
    "ConPin modifies the installed Codex extension. Enable experimental integration?",
    { modal: true, detail: "ConPin is an independent project. It modifies Codex's extension-host and webview files and keeps backups. Codex updates may break compatibility. Restore Codex before disabling or uninstalling ConPin; uninstalling does not remove the patch. Once enabled, automatic repair can reapply it after updates. You can turn off conpin.autoRepatch in Settings." },
    "Enable integration",
  );
  if (choice !== "Enable integration") return false;
  await context.globalState.update(CONSENT, true);
  return true;
}
module.exports = { CONSENT, assertLocalTrusted, approvePatch };
