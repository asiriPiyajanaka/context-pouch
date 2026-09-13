// Embedded in the Codex manager chunk; all delivery uses its native turn methods.
(() => {
  if (typeof window === "undefined") return;
  if (window.__contextPouchSession) return;
  const active = new Map();
  let pending = null;
  let sending = false;
  let message = "";
  const emit = text => {
    message = text;
    window.dispatchEvent(new CustomEvent("context-pouch-session"));
  };
  const current = () => {
    const values = [...active.values()].flatMap(conversations => [...conversations.values()]);
    return values.length === 1 ? values[0] : null;
  };
  const turn = target => {
    const state = target.manager.getConversation(target.id);
    return state ? target.latest(state) : null;
  };
  function snapshot() {
    const target = current();
    if (!target) return null;
    const state = target.manager.getConversation(target.id);
    if (!state) return null;
    const last = target.latest(state);
    if (!last?.turnId || last.status !== "inProgress") return null;
    return { target, turnId: last.turnId, title: state.title || target.id };
  }
  function validate(review) {
    if (!review || current() !== review.target)
      throw new Error("The active conversation changed. Review the correction again.");
    const last = turn(review.target);
    if (last?.turnId !== review.turnId || last.status !== "inProgress")
      throw new Error("That turn has finished or changed. Review the current conversation again.");
  }
  function cancel(text = "Queued correction cancelled.") {
    if (!pending) return;
    const job = pending;
    pending = null;
    job.dispose();
    emit(text);
  }
  const input = text => [{ type: "text", text, text_elements: [] }];
  async function start(review, text) {
    if (current() !== review.target) throw new Error("Conversation changed; correction was not sent.");
    const { manager, id } = review.target;
    const last = turn(review.target);
    if (last?.turnId !== review.turnId || last.status === "inProgress")
      throw new Error("Another turn started; correction was not sent. Review it again.");
    return manager.startTurn(id, { request: { threadId: id, input: input(text) } });
  }
  async function steer(review, text) {
    const { manager, id } = review.target;
    // Pin the request to the reviewed turn. The higher-level steer helper can
    // retry against a replacement turn, which is inappropriate for a correction.
    return manager.sendRequest("turn/steer", {
      threadId: id, expectedTurnId: review.turnId, input: input(text),
      clientUserMessageId: crypto.randomUUID(),
    });
  }
  function queue(review, text) {
    const { manager, id } = review.target;
    const job = { target: review.target, dispose: () => {} };
    pending = job;
    const check = () => {
      if (pending !== job) return;
      if (current() !== review.target) return cancel("Conversation changed; queued correction cancelled.");
      const last = turn(review.target);
      if (last?.turnId !== review.turnId) return cancel("Turn changed; queued correction cancelled.");
      if (last.status === "inProgress") return;
      if (last.status !== "completed") return cancel("Turn stopped or failed; queued correction cancelled.");
      pending = null;
      job.dispose();
      sending = true;
      emit("Sending queued correction…");
      start(review, text).then(
        () => emit("Correction sent after the turn finished."),
        error => emit(`Correction delivery failed: ${error.message}. Check the chat before retrying.`),
      ).finally(() => { sending = false; emit(message); });
    };
    job.dispose = manager.addConversationCallback(id, () => queueMicrotask(check));
    emit("Correction queued for this turn. Keep this conversation open until delivery.");
    check();
  }
  async function stop(review, text) {
    const { manager, id } = review.target;
    await manager.interruptConversation(id, "user-stop", review.turnId);
    // The interrupt response can arrive before the final state notification.
    await new Promise((resolve, reject) => {
      let dispose = () => {};
      const finish = error => { clearTimeout(timer); dispose(); error ? reject(error) : resolve(); };
      const check = () => {
        if (current() !== review.target) return finish(new Error("Conversation changed after stopping. Correction was not sent."));
        const last = turn(review.target);
        if (last?.turnId !== review.turnId) return finish(new Error("Turn changed after stopping. Correction was not sent."));
        if (last.status !== "inProgress") finish();
      };
      const timer = setTimeout(() => finish(new Error("Stop was requested but is not confirmed. Check the chat before retrying.")), 30000);
      dispose = manager.addConversationCallback(id, () => queueMicrotask(check));
      check();
    });
    await start(review, text);
  }
  window.__contextPouchSession = {
    snapshot,
    status: () => ({ message, queued: Boolean(pending), sending }),
    cancel: () => cancel(),
    async deliver(review, mode, text) {
      if (sending || pending) throw new Error("A correction is already sending or queued. Cancel the queue before replacing it.");
      if (!["now", "after", "stop"].includes(mode) || typeof text !== "string" || !text.trim())
        throw new Error("Choose a delivery mode and enter a correction.");
      validate(review);
      if (mode === "after") { queue(review, text); return; }
      sending = true;
      emit(mode === "stop" ? "Stopping the turn before sending correction…" : "Sending correction to the running turn…");
      try {
        if (mode === "stop") await stop(review, text);
        else await steer(review, text);
        emit(mode === "stop" ? "Turn stopped; correction sent." : "Correction accepted by Codex. Steering does not immediately stop an executing operation.");
      } catch (error) {
        emit(`Correction delivery failed: ${error.message}. Check the chat before retrying.`);
        throw error;
      } finally { sending = false; emit(message); }
    },
  };
  window.__contextPouchCaptureSession = (manager, id, enabled, latest, retained = false) => {
    const conversations = active.get(manager) || new Map();
    if (enabled) {
      if (!retained && !conversations.has(id)) conversations.clear();
      if (!conversations.has(id)) conversations.set(id, { manager, id, latest });
      active.set(manager, conversations);
    } else {
      conversations.delete(id);
      if (!conversations.size) active.delete(manager);
    }
    if (pending && current() !== pending.target) {
      // A queue is scoped to the visible conversation, never another tab.
      cancel("Conversation changed; queued correction cancelled.");
    }
    window.dispatchEvent(new CustomEvent("context-pouch-session"));
  };
  window.addEventListener("pagehide", () => cancel("View closed; queued correction cancelled."));
})();
