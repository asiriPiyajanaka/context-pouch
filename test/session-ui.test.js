"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const M = require("../model");

function fixture() {
  const children = [], errors = [], sent = [], listeners = new Map();
  const controls = {
    ".cp-footer": { append: node => children.push(node) },
    ".cp-send-correction": {},
    ".cp-correction-text": { value: "Use the shared Button; replace the duplicate." },
    ".cp-correction-mode": { value: "now" },
  };
  let state = { revision: "1", activeConflicts: [] }, html = "", closed = false;
  const target = {};
  const session = {
    snapshot: () => ({ target, turnId: "turn-1", title: "Button task" }),
    status: () => ({ message: "", queued: false, sending: false }),
    deliver: async (...args) => sent.push(args),
    cancel() {},
  };
  const window = { __contextPouchSession: session, ContextPouchModel: M,
    addEventListener: (type, fn) => listeners.set(type, fn) };
  const document = { createElement: () => ({ setAttribute() {} }) };
  vm.runInNewContext(fs.readFileSync(require.resolve("../session-ui.js"), "utf8"), { window, document });
  let request = async () => {};
  window.createPouchCorrectionUI({
    panel: { querySelector: key => controls[key] }, dialog: text => { html = text; },
    closeDialog: () => { closed = true; }, request: () => request(),
    getState: () => state, picked: () => [{ text: "Reuse shared components", appliesTo: "media" }],
    esc: value => String(value).replaceAll("<", "&lt;").replaceAll(">", "&gt;"),
    error: text => errors.push(text),
  });
  return { children, controls, errors, sent, session, window, listeners,
    open: () => children[0].onclick(), send: () => controls[".cp-send-correction"].onclick(),
    html: () => html, closed: () => closed,
    setState: value => { state = value; }, setRequest: fn => { request = fn; } };
}

test("correction requires a reviewed dialog and explicit Send, with scoped rules", async () => {
  const f = fixture();
  f.open();
  assert.equal(f.sent.length, 0);
  assert.match(f.html(), /Only within media\//);
  assert.match(f.html(), /Button task/);
  f.controls[".cp-correction-mode"].value = "after";
  await f.send();
  assert.equal(f.sent[0][1], "after");
  assert.equal(f.sent[0][2], "Use the shared Button; replace the duplicate.");
  assert.equal(f.closed(), true);
});

test("unsupported, idle and conflicting sessions do not open a send dialog", () => {
  const f = fixture();
  f.window.__contextPouchSession = null;
  f.open();
  assert.match(f.errors.at(-1), /unavailable/);
  f.window.__contextPouchSession = f.session;
  f.session.snapshot = () => null;
  f.open();
  assert.match(f.errors.at(-1), /running turn/);
  const g = fixture();
  g.setState({ revision: "1", activeConflicts: [["a", "b"]] });
  g.open();
  assert.match(g.errors.at(-1), /conflicts/);
  assert.equal(g.html(), "");
});

test("project or selection changes during review prevent delivery", async () => {
  const f = fixture();
  f.open();
  f.setRequest(async () => f.setState({ revision: "2", activeConflicts: [] }));
  await f.send();
  assert.equal(f.sent.length, 0);
  assert.match(f.errors.at(-1), /project or rules changed/);
  assert.equal(f.closed(), false);
  assert.equal(f.controls[".cp-send-correction"].disabled, false);
});

test("failed delivery retains edited correction only for the same review context", async () => {
  const f = fixture();
  f.session.deliver = async () => { throw new Error("Connection lost"); };
  f.open();
  await f.send();
  f.open();
  assert.match(f.html(), /Use the shared Button; replace the duplicate/);
  f.setState({ revision: "2", activeConflicts: [] });
  f.open();
  assert.doesNotMatch(f.html(), /replace the duplicate/);
});

test("delivery status disables duplicate actions and offers queue cancellation", () => {
  const f = fixture();
  f.session.status = () => ({ message: "Queued", queued: true, sending: false });
  f.listeners.get("context-pouch-session")();
  assert.equal(f.children[0].disabled, true);
  assert.equal(f.children[1].textContent, "Queued");
  assert.equal(f.children[2].hidden, false);
  let cancelled = false;
  f.session.cancel = () => { cancelled = true; };
  f.children[2].onclick();
  assert.equal(cancelled, true);
});
