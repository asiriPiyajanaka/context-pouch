(() => {
  window.createPouchClient = (api, onState, onError) => {
    const pending = new Map();
    window.addEventListener("message", ({ data: m }) => {
      if (m?.channel !== "context-pouch") return;
      if (m.event === "state") onState(m.state);
      if (m.event === "error") onError(m.error);
      const p = pending.get(m.id);
      if (!p) return;
      pending.delete(m.id);
      clearTimeout(p.timer);
      if (m.error) p.reject(new Error(m.error));
      else {
        if (m.result?.rules) onState(m.result);
        p.resolve(m.result);
      }
    });
    return (action, data = {}) =>
      new Promise((resolve, reject) => {
        const id = crypto.randomUUID();
        const timer = setTimeout(
          () => {
            pending.delete(id);
            reject(
              new Error(
                "Pouch is not connected. Run “Context Pouch: Install / Repair Codex Button” and reload VS Code.",
              ),
            );
          },
          action === "generate" ? 3600000 : ["import", "export"].includes(action) ? 600000 : 15000,
        );
        pending.set(id, { resolve, reject, timer });
        try {
          api.postMessage({ channel: "context-pouch", id, action, data });
        } catch (e) {
          clearTimeout(timer);
          pending.delete(id);
          reject(e);
        }
      });
  };
})();
