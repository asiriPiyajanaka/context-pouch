"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs"),
  os = require("os"),
  path = require("path"),
  vm = require("vm");
const P = require("../patcher");
function fixture(t, split = true) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "pouch-patch-"));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  fs.mkdirSync(path.join(dir, "webview/assets"), { recursive: true });
  fs.mkdirSync(path.join(dir, "out"));
  fs.writeFileSync(
    path.join(dir, "webview/index.html"),
    '<script src="./assets/index-main.js"></script>',
  );
  fs.writeFileSync(
    path.join(dir, "webview/assets/index-main.js"),
    split ? 'console.log("entry");' : "const api=acquireVsCodeApi();",
  );
  if (split)
    fs.writeFileSync(
      path.join(dir, "webview/assets/api-chunk.js"),
      "const api=acquireVsCodeApi();",
    );
  fs.writeFileSync(
    path.join(dir, "out/extension.js"),
    'const vscode=require("vscode"); vscode.window.registerWebviewViewProvider("codex", provider);',
  );
  const targets = P.resolveTargets({
    extensionPath: dir,
    packageJSON: { main: "./out/extension.js" },
  });
  return { dir, targets };
}
for (const split of [true, false])
  test(`patch, upgrade and byte-exact restore (${split ? "split" : "single"} bundle)`, (t) => {
    const { targets } = fixture(t, split),
      files = [...new Set(Object.values(targets))],
      originals = files.map((f) => fs.readFileSync(f));
    assert.equal(P.patchTargets(targets), true);
    assert.equal(P.current(targets), true);
    assert.equal(P.patchTargets(targets), false);
    assert.match(
      fs.readFileSync(targets.bridge, "utf8"),
      /__contextPouchCapture\(acquireVsCodeApi\(\)\)/,
    );
    for (let i = 0; i < files.length; i++) {
      assert.equal(P.restoreTarget(files[i]), true);
      assert.deepEqual(fs.readFileSync(files[i]), originals[i]);
    }
  });
test("external bundle changes are not overwritten or restored over", (t) => {
  const { targets } = fixture(t);
  P.patchTargets(targets);
  fs.appendFileSync(targets.host, "\n// another extension");
  const live = fs.readFileSync(targets.host);
  assert.throws(() => P.patchTargets(targets), /changed outside/);
  assert.throws(() => P.restoreTarget(targets.host), /changed outside/);
  assert.deepEqual(fs.readFileSync(targets.host), live);
});
test("legacy webview-only patch migrates without losing its pristine backup", (t) => {
  const { targets } = fixture(t);
  const original = fs.readFileSync(targets.webview, "utf8");
  fs.writeFileSync(targets.webview + ".context-pouch-backup", original);
  fs.appendFileSync(
    targets.webview,
    "\n/* CONTEXT_POUCH_START */\nold code\n/* CONTEXT_POUCH_END */\n",
  );
  P.patchTargets(targets);
  P.restoreTarget(targets.webview);
  assert.equal(fs.readFileSync(targets.webview, "utf8"), original);
});
test("host bridge wires panel and sidebar messages and preserves provider this", async () => {
  const listeners = [],
    replies = [],
    calls = [];
  let provider;
  const owner = {
    webview: {
      onDidReceiveMessage(fn) {
        listeners.push(fn);
        return { dispose() {} };
      },
      postMessage(m) {
        replies.push(m);
      },
    },
    onDidDispose() {},
  };
  const vscode = {
    window: {
      createWebviewPanel() {
        return owner;
      },
      registerWebviewViewProvider(id, p) {
        provider = p;
      },
    },
    commands: {
      async executeCommand(...args) {
        calls.push(args);
        return { ok: true };
      },
    },
  };
  const sandbox = {};
  vm.runInNewContext(
    fs.readFileSync(path.join(__dirname, "../host-bridge.js"), "utf8"),
    sandbox,
  );
  Object.freeze(vscode.window);
  const wrapped = sandbox.__contextPouchWrapVscode(vscode);
  wrapped.window.createWebviewPanel();
  await listeners[0]({ channel: "other" });
  assert.equal(calls.length, 0);
  await listeners[0]({ channel: "context-pouch", id: "1", action: "state" });
  assert.equal(calls[0][0], "contextPouch.bridge");
  assert.equal(replies[0].result.ok, true);
  const original = {
    value: 42,
    resolveWebviewView() {
      assert.equal(this.value, 42);
    },
  };
  wrapped.window.registerWebviewViewProvider("codex", original);
  provider.resolveWebviewView(owner);
});
