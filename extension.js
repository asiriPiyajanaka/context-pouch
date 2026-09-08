"use strict";
const vscode = require("vscode");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const patcher = require("./patcher");
const { Library } = require("./library");
const { GenerationUI } = require("./generation-ui");
const ENABLED_KEY = "contextPouch.enabled";
const targets = () =>
  patcher.resolveTargets(vscode.extensions.getExtension("openai.chatgpt"));
async function offerReload(message) {
  if (
    (await vscode.window.showInformationMessage(
      message,
      "Reload Window",
      "Later",
    )) === "Reload Window"
  )
    await vscode.commands.executeCommand("workbench.action.reloadWindow");
}
async function install(context, quiet = false) {
  const files = targets(),
    changed = patcher.patchTargets(files);
  await context.globalState.update(ENABLED_KEY, true);
  await context.globalState.update(
    "contextPouch.targets",
    Object.values(files),
  );
  if (changed || !quiet)
    await offerReload(
      changed
        ? "Context Pouch installed. Reload VS Code to connect the composer and rule graph."
        : "Context Pouch is up to date.",
    );
}
async function restore(context) {
  const files = new Set(context.globalState.get("contextPouch.targets", []));
  const legacy = context.globalState.get("contextPouch.lastTarget");
  if (legacy) files.add(legacy);
  try {
    Object.values(targets()).forEach((p) => files.add(p));
  } catch (_) {}
  let changed = false;
  const errors = [];
  for (const file of files) {
    try {
      changed = patcher.restoreTarget(file) || changed;
    } catch (e) {
      errors.push(e.message);
    }
  }
  if (errors.length) throw new Error(errors.join("\n"));
  await context.globalState.update(ENABLED_KEY, false);
  await context.globalState.update("contextPouch.targets", undefined);
  await context.globalState.update("contextPouch.lastTarget", undefined);
  if (changed)
    await offerReload(
      "Context Pouch patches restored. Your rule library is kept. Reload VS Code.",
    );
  else
    vscode.window.showInformationMessage(
      "Context Pouch: no active patch found.",
    );
}
function graphHtml(webview, extensionUri) {
  const nonce = crypto.randomBytes(18).toString("base64");
  const resource = (file) =>
    webview.asWebviewUri(vscode.Uri.joinPath(extensionUri, file));
  return `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src ${webview.cspSource}; script-src 'nonce-${nonce}'; img-src ${webview.cspSource} data:;"><link rel="stylesheet" href="${resource("media/graph.css")}"><link rel="stylesheet" href="${resource("media/node-graph.css")}"><title>Pouch · Rule library</title></head><body><div id="app"></div><script nonce="${nonce}" src="${resource("model.js")}"></script><script nonce="${nonce}" src="${resource("client.js")}"></script><script nonce="${nonce}" src="${resource("media/library-view.js")}"></script><script nonce="${nonce}" src="${resource("media/library-dialogs.js")}"></script><script nonce="${nonce}" src="${resource("media/graph-model.js")}"></script><script nonce="${nonce}" src="${resource("media/graph-renderer.js")}"></script><script nonce="${nonce}" src="${resource("media/graph-explorer.js")}"></script><script nonce="${nonce}" src="${resource("media/graph-inspector.js")}"></script><script nonce="${nonce}" src="${resource("media/graph.js")}"></script></body></html>`;
}
function activate(context) {
  const clients = new Set();
  let graph;
  const broadcast = (state) => {
    for (const view of clients)
      view
        .postMessage({ channel: "context-pouch", event: "state", state })
        .then(
          (ok) => {
            if (!ok) clients.delete(view);
          },
          () => clients.delete(view),
        );
  };
  const library = new Library(context, broadcast);
  const generation = new GenerationUI(context, library);
  context.subscriptions.push(generation, library);
  const report =
    (fn) =>
    async (...args) => {
      try {
        return await fn(...args);
      } catch (e) {
        vscode.window.showErrorMessage(`Context Pouch: ${e.message}`);
      }
    };
  function openGraph() {
    if (graph) {
      graph.reveal(vscode.ViewColumn.Active);
      return;
    }
    graph = vscode.window.createWebviewPanel(
      "contextPouch.graph",
      "Pouch · Rule library",
      vscode.ViewColumn.Active,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [context.extensionUri],
      },
    );
    const panel = graph;
    panel.iconPath = vscode.Uri.joinPath(
      context.extensionUri,
      "media/pouch.svg",
    );
    panel.webview.html = graphHtml(panel.webview, context.extensionUri);
    panel.webview.onDidReceiveMessage(
      async (message) => {
        if (
          message?.channel !== "context-pouch" ||
          typeof message.id !== "string"
        )
          return;
        try {
          const result = await handle(message, panel.webview);
          await panel.webview.postMessage({
            channel: "context-pouch",
            id: message.id,
            result,
          });
        } catch (e) {
          await panel.webview.postMessage({
            channel: "context-pouch",
            id: message.id,
            error: e.message,
          });
        }
      },
      undefined,
      context.subscriptions,
    );
    panel.onDidDispose(() => {
      clients.delete(panel.webview);
      graph = undefined;
    });
  }
  async function handle(message, webview) {
    if (!webview || typeof webview.postMessage !== "function")
      throw new Error("Invalid Pouch connection.");
    clients.add(webview);
    if (JSON.stringify(message).length > 2 * 1024 * 1024)
      throw new Error("Pouch request is too large.");
    const { action, data = {} } = message;
    if (action === "generate") {
      await report(() => generation.run())();
      return library.dispatch("state");
    }
    if (action === "activateGraphProject") {
      const project = library.store.projects().find(p=>p.uri===data.project);
      if (!project) throw new Error("Saved project no longer exists.");
      if (library.roots().some(r=>r.uri.toString()===data.project))
        return library.dispatch("project",{id:data.project});
      const uri = vscode.Uri.parse(project.uri);
      try { await vscode.workspace.fs.stat(uri); }
      catch (_) { throw new Error("This project folder is no longer available at its saved path."); }
      await vscode.commands.executeCommand("vscode.openFolder",uri,{forceNewWindow:true});
      return null;
    }
    if (action === "openSource") {
      const state = await library.dispatch("state");
      const rule = state.rules.find(r => r.key === data.key && r.scope === "project");
      const source = rule?.sources?.[data.index];
      if (!source) throw new Error("Source reference is no longer available.");
      await generation.openSource(source);
      return null;
    }
    if (action === "graph") {
      openGraph();
      return null;
    }
    if (action === "import") {
      await library.importPack(data.scope, data.shared === true);
      return library.dispatch("state");
    }
    if (action === "export") {
      await library.exportPack(data.scope, data.selectedOnly === true, data.shared === true);
      return null;
    }
    return library.dispatch(action, data);
  }
  context.subscriptions.push(
    vscode.commands.registerCommand("contextPouch.bridge", handle),
    vscode.commands.registerCommand("contextPouch.disconnect", (webview) =>
      clients.delete(webview),
    ),
    vscode.commands.registerCommand("contextPouch.graph", openGraph),
    vscode.commands.registerCommand("contextPouch.generate", report(() => generation.run())),
    vscode.commands.registerCommand("contextPouch.setApiKey", report(() => generation.setKey())),
    vscode.commands.registerCommand(
      "contextPouch.install",
      report(() => install(context)),
    ),
    vscode.commands.registerCommand(
      "contextPouch.restore",
      report(() => restore(context)),
    ),
    vscode.commands.registerCommand(
      "contextPouch.status",
      report(() =>
        vscode.window.showInformationMessage(
          `Context Pouch: ${patcher.current(targets()) ? "up to date" : "install / repair needed"} · shared library + composer + library`,
        ),
      ),
    ),
    {
      dispose() {
        graph?.dispose();
        clients.clear();
      },
    },
  );
  let refreshTimer;
  const refresh = () => {
    clearTimeout(refreshTimer);
    refreshTimer = setTimeout(
      () =>
        library.dispatch("state").then(broadcast, (e) => {
          for (const v of clients)
            v.postMessage({
              channel: "context-pouch",
              event: "error",
              error: e.message,
            });
        }),
      150,
    );
  };
  const watcher = vscode.workspace.createFileSystemWatcher(
    new vscode.RelativePattern(context.globalStorageUri, "{pouch.sqlite,pouch.sqlite-wal}"),
  );
  context.subscriptions.push(watcher, watcher.onDidChange(refresh), watcher.onDidCreate(refresh));
  context.subscriptions.push(
    vscode.workspace.onDidChangeWorkspaceFolders(refresh),
    vscode.workspace.onDidGrantWorkspaceTrust(refresh),
    {
      dispose() {
        clearTimeout(refreshTimer);
      },
    },
  );
  const enabled = context.globalState.get(ENABLED_KEY, false);
  if (
    enabled &&
    vscode.workspace.getConfiguration("contextPouch").get("autoRepatch", true)
  ) {
    report(async () => {
      if (!patcher.current(targets())) await install(context, true);
    })();
  } else if (
    !context.globalState.get("contextPouch.firstPromptShown", false) &&
    vscode.extensions.getExtension("openai.chatgpt")
  ) {
    context.globalState.update("contextPouch.firstPromptShown", true);
    vscode.window
      .showInformationMessage(
        "Context Pouch adds reusable rules beside the Codex composer and a project rule library.",
        "Install into Codex",
        "Later",
      )
      .then((choice) => {
        if (choice === "Install into Codex") report(() => install(context))();
      });
  }
}
module.exports = {
  activate,
  deactivate() {},
  _test: { ...patcher, graphHtml },
};
