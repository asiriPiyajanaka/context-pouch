"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs"), path = require("node:path"), vm = require("node:vm");
const source = fs.readFileSync(path.join(__dirname, "../host-bridge.js"), "utf8");

function fixture(activate) {
  let receive, dispose;
  const replies = [], disconnected = [], calls = [];
  const webview = {
    onDidReceiveMessage(fn) { receive = fn; return { dispose() {} }; },
    async postMessage(message) { replies.push(message); },
  };
  webview.current = webview; // Real VS Code webviews have circular internal objects.
  const api = {
    async request(message, view) { calls.push([message, view]); return { rules: [] }; },
    disconnect(view) { disconnected.push(view); },
  };
  const sandbox = {};
  vm.runInNewContext(source, sandbox);
  const wrapped = sandbox.__contextPouchWrapVscode({
    extensions: { getExtension(id) {
      assert.equal(id, "example.conpin");
      return { activate: () => activate(api) };
    } },
    commands: { executeCommand(...args) { JSON.stringify(args); throw new Error("Commands must not carry live webviews"); } },
    window: { createWebviewPanel: () => ({ webview, onDidDispose(fn) { dispose = fn; } }) },
  }, "example.conpin");
  wrapped.window.createWebviewPanel();
  return { receive, dispose, replies, calls, disconnected, webview };
}
test("first request awaits activation and passes the circular webview by reference", async () => {
  let finish;
  const f = fixture(api => new Promise(resolve => { finish = () => resolve(api); }));
  const pending = f.receive({ channel: "context-pouch", id: "first", action: "state" });
  assert.equal(f.calls.length, 0);
  finish();
  await pending;
  assert.equal(f.calls[0][1], f.webview);
  assert.equal(f.replies[0].id, "first");
  assert.equal(f.replies[0].error, undefined);
  f.dispose();
  assert.equal(f.disconnected[0], f.webview);
});
test("closing a view during activation does not register a dead connection", async () => {
  let finish;
  const f = fixture(api => new Promise(resolve => { finish = () => resolve(api); }));
  const pending = f.receive({ channel: "context-pouch", id: "first", action: "state" });
  f.dispose(); finish(); await pending;
  assert.equal(f.calls.length, 0);
  assert.equal(f.replies.length, 0);
});
test("activation errors are reported and subsequent requests can reconnect", async () => {
  let attempts = 0;
  const f = fixture(async api => { if (++attempts === 1) throw new Error("Activation failed"); return api; });
  await f.receive({ channel: "context-pouch", id: "first", action: "state" });
  assert.equal(f.replies[0].error, "Activation failed");
  await f.receive({ channel: "context-pouch", id: "second", action: "state" });
  assert.equal(f.replies[1].error, undefined);
  assert.equal(f.calls.length, 1);
});
test("blocked activation returns an actionable error instead of serializing the webview", async () => {
  const f = fixture(async () => undefined);
  await f.receive({ channel: "context-pouch", id: "first", action: "state" });
  assert.match(f.replies[0].error, /workspace trust/);
  assert.equal(f.calls.length, 0);
});
