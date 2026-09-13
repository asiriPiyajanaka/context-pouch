"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), os = require("node:os"), path = require("node:path");
const { DatabaseSync } = require("node:sqlite");
const { migrateLegacyStorage } = require("../legacy-storage");
const { approvePatch, assertLocalTrusted, CONSENT } = require("../integration-safety");
const { recover } = require("../recovery");
const P = require("../patcher");

function directory(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "conpin-release-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  return root;
}
test("patch consent is explicit, cancellation does not enable repair, and trust/remote guards apply", async () => {
  const state = new Map(), calls = [];
  const context = { globalState: { get: key => state.get(key), update: async (key, value) => state.set(key, value) } };
  const vscode = { env: {}, workspace: { isTrusted: true }, window: { showWarningMessage: async (...args) => { calls.push(args); } } };
  assert.equal(await approvePatch(vscode, context, false), false);
  assert.equal(state.has(CONSENT), false);
  vscode.window.showWarningMessage = async () => "Enable integration";
  assert.equal(await approvePatch(vscode, context, false), true);
  vscode.window.showWarningMessage = async () => { throw new Error("Unexpected prompt"); };
  assert.equal(await approvePatch(vscode, context, true), true);
  vscode.workspace.isTrusted = false;
  await assert.rejects(approvePatch(vscode, context, true), /Trust/);
  vscode.workspace.isTrusted = true;
  vscode.env.remoteName = "ssh-remote";
  assert.throws(() => assertLocalTrusted(vscode), /local desktop/);
  vscode.env.remoteName = undefined;
  vscode.workspace.workspaceFolders = [{ uri: { scheme: "vscode-vfs" } }];
  assert.throws(() => assertLocalTrusted(vscode), /local desktop/);
  assert.equal(calls[0][1].modal, true);
});
test("legacy migration snapshots committed WAL data and never overwrites an existing library", t => {
  const root = directory(t), old = path.join(root, "asiri-local.context-pouch-codex"), next = path.join(root, "asiri-local.conpin");
  fs.mkdirSync(old);
  const db = new DatabaseSync(path.join(old, "pouch.sqlite"));
  try {
    db.exec("PRAGMA journal_mode=WAL; PRAGMA user_version=1; CREATE TABLE preferences(project, data); INSERT INTO preferences VALUES ('demo', 'saved defaults');");
    assert.equal(migrateLegacyStorage(next), true);
    const copy = new DatabaseSync(path.join(next, "pouch.sqlite"));
    try { assert.equal(copy.prepare("SELECT data FROM preferences").get().data, "saved defaults"); }
    finally { copy.close(); }
    db.exec("INSERT INTO preferences VALUES ('later', 'untouched source')");
    assert.equal(migrateLegacyStorage(next), false);
    assert.equal(db.prepare("SELECT count(*) AS n FROM preferences").get().n, 2);
  } finally { db.close(); }
});
test("unsupported legacy schemas leave the destination absent", t => {
  const root = directory(t), old = path.join(root, "asiri-local.context-pouch-codex"), next = path.join(root, "asiri-local.conpin");
  fs.mkdirSync(old);
  const db = new DatabaseSync(path.join(old, "pouch.sqlite"));
  db.exec("PRAGMA user_version=2"); db.close();
  assert.throws(() => migrateLegacyStorage(next), /unsupported version/);
  assert.equal(fs.existsSync(path.join(next, "pouch.sqlite")), false);
});
function installation(t) {
  const root = directory(t);
  fs.writeFileSync(path.join(root, "package.json"), JSON.stringify({ publisher: "openai", name: "chatgpt" }));
  const targets = { host: path.join(root, "host.js"), bridge: path.join(root, "bridge.js"), webview: path.join(root, "webview.js") };
  fs.writeFileSync(targets.host, 'const vscode=require("vscode"); vscode.window.registerWebviewViewProvider("codex", provider);');
  fs.writeFileSync(targets.bridge, "const api=acquireVsCodeApi();");
  fs.writeFileSync(targets.webview, "// original");
  return { root, targets };
}
test("standalone recovery previews without writes, validates all bundles, and restores exactly", t => {
  const { root, targets } = installation(t), original = fs.readFileSync(targets.host);
  P.patchTargets(targets);
  assert.equal(recover(root).length, 3);
  assert.equal(P.current(targets), true);
  fs.appendFileSync(targets.webview, "// external change");
  const patched = fs.readFileSync(targets.host);
  assert.throws(() => recover(root, true), /changed outside/);
  assert.deepEqual(fs.readFileSync(targets.host), patched);
  const meta = JSON.parse(fs.readFileSync(targets.webview + ".context-pouch-meta.json", "utf8"));
  assert.ok(meta.patched);
  fs.writeFileSync(targets.webview, fs.readFileSync(targets.webview, "utf8").replace(/\/\/ external change$/, ""));
  recover(root, true);
  assert.deepEqual(fs.readFileSync(targets.host), original);
  assert.equal(recover(root).length, 0);
});
test("patch write failure rolls back every touched bundle and backup", t => {
  const { targets } = installation(t), originals = Object.values(targets).map(file => fs.readFileSync(file));
  const write = fs.writeFileSync;
  let failed = false;
  t.mock.method(fs, "writeFileSync", (file, ...args) => {
    if (file === targets.bridge && !failed) { failed = true; throw new Error("Simulated write failure"); }
    return write(file, ...args);
  });
  assert.throws(() => P.patchTargets(targets), /Simulated/);
  Object.values(targets).forEach((file, i) => {
    assert.deepEqual(fs.readFileSync(file), originals[i]);
    assert.equal(fs.existsSync(file + ".context-pouch-backup"), false);
  });
});
