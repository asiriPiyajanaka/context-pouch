"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const vm = require("node:vm");
const crypto = require("node:crypto");
const bridge = fs.readFileSync(require.resolve("../session-bridge.js"), "utf8");
const flush = () => new Promise(resolve => setImmediate(resolve));

function fixture() {
  const events = new Map(), callbacks = new Set(), calls = [];
  const window = {
    addEventListener: (name, fn) => events.set(name, fn),
    dispatchEvent() {},
  };
  vm.runInNewContext(bridge, { window, crypto, queueMicrotask, setTimeout, clearTimeout,
    CustomEvent: class { constructor(type) { this.type = type; } } });
  const conversation = { title: "Button task", latest: { turnId: "turn-1", status: "inProgress" } };
  const manager = {
    getConversation: () => conversation,
    addConversationCallback(id, fn) { callbacks.add(fn); return () => callbacks.delete(fn); },
    async sendRequest(method, params) { calls.push({ method, params }); return { turnId: params.expectedTurnId }; },
    async startTurn(id, operation) { calls.push({ method: "start", id, operation }); },
    async interruptConversation(id, reason, expected) {
      calls.push({ method: "interrupt", id, reason, expected });
      change("interrupted");
    },
  };
  function change(status, turnId = "turn-1") {
    conversation.latest = { turnId, status };
    for (const fn of [...callbacks]) fn(conversation);
  }
  const capture = (id, enabled = true, owner = manager) =>
    window.__contextPouchCaptureSession(owner, id, enabled, state => state.latest);
  capture("thread-1");
  return { session: window.__contextPouchSession, manager, change, capture, calls,
    callbacks, conversation, events };
}

test("steering pins the reviewed conversation and turn and sends editable instructions", async () => {
  const f = fixture(), review = f.session.snapshot();
  await f.session.deliver(review, "now", "Reuse the shared button.");
  assert.equal(f.calls.length, 1);
  const { method, params } = f.calls[0];
  assert.equal(method, "turn/steer");
  assert.equal(params.threadId, "thread-1");
  assert.equal(params.expectedTurnId, "turn-1");
  assert.equal(params.input[0].text, "Reuse the shared button.");
  assert.ok(params.clientUserMessageId);
  assert.match(f.session.status().message, /accepted/);
  assert.equal(f.session.status().sending, false);
});

test("stale reviews, unknown modes and empty corrections do not send", async () => {
  const f = fixture(), review = f.session.snapshot();
  await assert.rejects(f.session.deliver(review, "bad", "text"), /delivery mode/);
  await assert.rejects(f.session.deliver(review, "now", " "), /delivery mode/);
  f.change("inProgress", "turn-2");
  await assert.rejects(f.session.deliver(review, "now", "text"), /finished or changed/);
  f.capture("thread-2");
  await assert.rejects(f.session.deliver(review, "now", "text"), /conversation changed/);
  assert.equal(f.calls.length, 0);
});

test("a queued correction starts exactly once after successful completion", async () => {
  const f = fixture();
  await f.session.deliver(f.session.snapshot(), "after", "Fix the duplicate button.");
  assert.equal(f.calls.length, 0);
  assert.equal(f.session.status().queued, true);
  f.capture("thread-1"); // Re-registering the same view must not cancel it.
  assert.equal(f.session.status().queued, true);
  f.change("completed");
  f.change("completed");
  await flush();
  assert.equal(f.calls.length, 1);
  assert.equal(f.calls[0].method, "start");
  assert.equal(f.calls[0].id, "thread-1");
  assert.equal(f.calls[0].operation.request.input[0].text, "Fix the duplicate button.");
  assert.equal(f.callbacks.size, 0);
  assert.equal(f.session.status().queued, false);
  assert.equal(f.session.status().sending, false);
});

for (const ending of ["interrupted", "failed", "navigation", "replacement", "cancel", "pagehide"])
  test(`queue is cancelled on ${ending}`, async () => {
    const f = fixture();
    await f.session.deliver(f.session.snapshot(), "after", "text");
    if (ending === "navigation") f.capture("thread-2");
    else if (ending === "replacement") f.change("inProgress", "turn-2");
    else if (ending === "cancel") f.session.cancel();
    else if (ending === "pagehide") f.events.get("pagehide")();
    else f.change(ending);
    await flush();
    f.change("completed");
    await flush();
    assert.equal(f.calls.length, 0);
    assert.equal(f.callbacks.size, 0);
    assert.equal(f.session.status().queued, false);
  });

test("stop and correct waits for interruption and starts in the same conversation", async () => {
  const f = fixture();
  await f.session.deliver(f.session.snapshot(), "stop", "Use the existing component.");
  assert.deepEqual(f.calls.map(call => call.method), ["interrupt", "start"]);
  assert.equal(f.calls[0].expected, "turn-1");
  assert.equal(f.calls[0].reason, "user-stop");
  assert.equal(f.calls[1].id, "thread-1");
  assert.equal(f.callbacks.size, 0);
});

test("stop response preceding state notification does not start correction early", async () => {
  const f = fixture();
  f.manager.interruptConversation = async () => {};
  const delivery = f.session.deliver(f.session.snapshot(), "stop", "text");
  await flush();
  assert.equal(f.calls.length, 0);
  assert.equal(f.callbacks.size, 1);
  f.change("interrupted");
  await delivery;
  assert.equal(f.calls[0].method, "start");
});

test("navigation during stopping prevents the correction from being sent", async () => {
  const f = fixture();
  f.manager.interruptConversation = async () => { f.capture("thread-2"); };
  await assert.rejects(f.session.deliver(f.session.snapshot(), "stop", "text"), /Conversation changed/);
  assert.equal(f.calls.length, 0);
});

test("delivery failures are visible and are never automatically retried", async () => {
  const f = fixture();
  let attempts = 0;
  f.manager.sendRequest = async () => { attempts++; throw new Error("Connection lost"); };
  await assert.rejects(f.session.deliver(f.session.snapshot(), "now", "text"), /Connection lost/);
  assert.equal(attempts, 1);
  assert.match(f.session.status().message, /Check the chat before retrying/);
  assert.equal(f.session.status().sending, false);
});

test("queue delivery failure retains a visible error and removes subscription", async () => {
  const f = fixture();
  f.manager.startTurn = async () => { throw new Error("Disconnected"); };
  await f.session.deliver(f.session.snapshot(), "after", "text");
  f.change("completed");
  await flush();
  assert.match(f.session.status().message, /Disconnected/);
  assert.equal(f.callbacks.size, 0);
  assert.equal(f.session.status().sending, false);
});

test("duplicate delivery is blocked while sending or queued", async () => {
  const f = fixture(), review = f.session.snapshot();
  let release;
  f.manager.sendRequest = () => new Promise(resolve => { release = resolve; });
  const sending = f.session.deliver(review, "now", "text");
  await assert.rejects(f.session.deliver(review, "now", "text"), /already sending/);
  release();
  await sending;
  await f.session.deliver(review, "after", "text");
  await assert.rejects(f.session.deliver(review, "after", "text"), /already sending or queued/);
  f.session.cancel();
});

test("missing, idle and ambiguous conversations expose no correction target", () => {
  const f = fixture();
  f.change("completed");
  assert.equal(f.session.snapshot(), null);
  f.change("inProgress");
  f.capture("other", true, { ...f.manager });
  assert.equal(f.session.snapshot(), null);
  f.capture("thread-1", false);
  f.manager.getConversation = () => null;
  // A fresh fixture verifies missing state independently of the other manager.
  const missing = fixture();
  missing.manager.getConversation = () => null;
  assert.equal(missing.session.snapshot(), null);
});
