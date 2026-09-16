"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");

function uri(file) {
  return {
    fsPath: file,
    path: file,
    scheme: "file",
    toString() {
      return "file://" + file;
    },
  };
}

function state() {
  const data = new Map();
  return {
    get: (key, fallback) => data.has(key) ? data.get(key) : fallback,
    update: async (key, value) => data.set(key, value),
  };
}

function webview() {
  return {
    cspSource: "vscode-resource:",
    html: "",
    asWebviewUri: (value) => value,
    postMessage: async () => true,
    onDidReceiveMessage: () => ({ dispose() {} }),
  };
}

test("rule library panel can be reopened after disposal", async (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "conpin-panel-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const commands = new Map(), panels = [];
  const vscode = {
    env: {},
    extensions: { getExtension: () => undefined },
    Uri: { file: uri, joinPath: (base, ...parts) => uri(path.join(base.fsPath, ...parts)) },
    RelativePattern: class { constructor(base, pattern) { this.base = base; this.pattern = pattern; } },
    commands: {
      registerCommand(name, fn) {
        commands.set(name, fn);
        return { dispose() { commands.delete(name); } };
      },
      executeCommand: async (name, ...args) => commands.get(name)?.(...args),
    },
    workspace: {
      isTrusted: true,
      workspaceFolders: [{ name: "Demo", uri: uri(path.join(root, "project")) }],
      getConfiguration: () => ({ get: () => false }),
      createFileSystemWatcher: () => ({
        onDidChange: () => ({ dispose() {} }),
        onDidCreate: () => ({ dispose() {} }),
        dispose() {},
      }),
      onDidChangeWorkspaceFolders: () => ({ dispose() {} }),
      onDidGrantWorkspaceTrust: () => ({ dispose() {} }),
      fs: {
        readFile: async (value) => fs.promises.readFile(value.fsPath),
        writeFile: async (value, data) => fs.promises.writeFile(value.fsPath, data),
        createDirectory: async (value) => fs.promises.mkdir(value.fsPath, { recursive: true }),
      },
    },
    window: {
      showErrorMessage: () => {},
      showInformationMessage: async () => undefined,
      createWebviewPanel() {
        let disposed = false, disposeHandler = () => {};
        const current = webview();
        const panel = {
          reveal() {
            if (disposed) throw new Error("Webview is disposed");
          },
          dispose() {
            disposed = true;
            disposeHandler();
          },
          onDidDispose(fn) {
            disposeHandler = fn;
            return { dispose() {} };
          },
          set iconPath(_) {},
          get webview() {
            if (disposed) throw new Error("Webview is disposed");
            return current;
          },
        };
        panels.push(panel);
        return panel;
      },
    },
    ViewColumn: { Active: 1 },
  };
  const context = {
    extensionUri: uri(path.resolve(__dirname, "..")),
    globalStorageUri: uri(path.join(root, "global")),
    globalState: state(),
    workspaceState: state(),
    subscriptions: [],
  };
  const originalLoad = Module._load;
  t.mock.method(Module, "_load", (request, parent, isMain) =>
    request === "vscode" ? vscode : originalLoad(request, parent, isMain),
  );
  delete require.cache[require.resolve("../extension")];
  const { activate } = require("../extension");
  activate(context);
  await commands.get("conpin.graph")();
  panels[0].dispose();
  await commands.get("conpin.graph")();
  assert.equal(panels.length, 2);
});
