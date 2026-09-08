"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const vm = require("node:vm");
const P = require("../patcher");
const S = require("../session-patch");

const managerSource = 'function last(e){if(e.turnHistory?.kind===`canonical`){let{history:t}=e.turnHistory,n=island(t);if(n!=null){let e=n.entries.at(-1)?.value;return e==null?null:t.entitiesByKey[e]??null}}return turns(e).at(-1)??null}function turns(e){return e.turns}class Manager{setActiveConversation(e,t){this.inactiveThreadUnsubscriber.setActive(e,t),this.streamState.setConversationFollowing(e,t)}sendRequest(){}startTurn(){}interruptConversation(){}addConversationCallback(){}}';

function fixture(t, source = managerSource) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "pouch-session-patch-"));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, "webview/assets"), { recursive: true });
  fs.mkdirSync(path.join(root, "out"));
  fs.writeFileSync(path.join(root, "webview/index.html"), '<script src="./assets/index-main.js"></script>');
  fs.writeFileSync(path.join(root, "webview/assets/index-main.js"), "acquireVsCodeApi();");
  fs.writeFileSync(path.join(root, "webview/assets/manager.js"), source);
  fs.writeFileSync(path.join(root, "out/extension.js"), 'const v=require("vscode");v.window.registerWebviewViewProvider("codex", provider);');
  const extension = { extensionPath: root, packageJSON: { main: "out/extension.js" } };
  return { root, extension, targets: P.resolveTargets(extension) };
}

test("session manager discovery survives minified symbol renaming", () => {
  assert.equal(S.inspect(managerSource).latest, "last");
  assert.equal(S.inspect(managerSource.replaceAll("last", "$Renamed")).latest, "$Renamed");
  assert.equal(S.inspect(managerSource.replace("setActiveConversation", "renamed")), null);
  assert.equal(S.inspect(managerSource + managerSource), null);
});

test("session hook preserves native activation calls and supplies the native accessor", () => {
  const calls = [];
  const context = { window: { __contextPouchCaptureSession: (...args) => calls.push(args) } };
  vm.runInNewContext(S.patch(managerSource, "") + `
    const manager = new Manager();
    manager.inactiveThreadUnsubscriber = { setActive: (...args) => native.push(args) };
    manager.streamState = { setConversationFollowing: (...args) => native.push(args) };
    manager.setActiveConversation("thread", true);
  `, { ...context, native: calls });
  assert.equal(calls[0][1], "thread");
  assert.equal(calls[0][2], true);
  assert.equal(calls[0][3]({ turns: [{ turnId: "turn" }] }).turnId, "turn");
  assert.equal(calls.length, 3);
  assert.equal(calls[1][0], "thread");
  assert.equal(calls[2][0], "thread");
});

test("session bundle participates in upgrades, integrity checks and exact restoration", t => {
  const { extension, targets } = fixture(t);
  assert.ok(targets.session);
  const before = fs.readFileSync(targets.session);
  assert.equal(P.patchTargets(targets), true);
  assert.equal(P.current(P.resolveTargets(extension)), true);
  assert.equal(P.patchTargets(P.resolveTargets(extension)), false);
  new vm.Script(fs.readFileSync(targets.session, "utf8"));
  assert.equal(P.restoreTarget(targets.session), true);
  assert.deepEqual(fs.readFileSync(targets.session), before);
});

test("unsupported and ambiguous managers preserve ordinary composer integration", t => {
  const { root, extension, targets } = fixture(t, "class UnknownManager{}");
  assert.equal(targets.session, undefined);
  assert.equal(P.patchTargets(targets), true);
  assert.equal(P.current(targets), true);
  fs.writeFileSync(path.join(root, "webview/assets/manager.js"), managerSource);
  fs.writeFileSync(path.join(root, "webview/assets/other.js"), managerSource);
  assert.equal(P.resolveTargets(extension).session, undefined);
});

test("session bundle external changes fail before any bundle is rewritten", t => {
  const { targets } = fixture(t);
  P.patchTargets(targets);
  fs.appendFileSync(targets.session, "\n// external edit");
  const before = Object.values(targets).map(file => fs.readFileSync(file));
  assert.throws(() => P.patchTargets(targets), /changed outside/);
  assert.throws(() => P.restoreTarget(targets.session), /changed outside/);
  Object.values(targets).forEach((file, i) => assert.deepEqual(fs.readFileSync(file), before[i]));
});
