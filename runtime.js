(() => {
  if (window.__contextPouchLoaded) return;
  window.__contextPouchLoaded = true;
  const M = window.ContextPouchModel;
  const esc = (s) =>
    String(s).replace(
      /[&<>"']/g,
      (c) =>
        ({
          "&": "&amp;",
          "<": "&lt;",
          ">": "&gt;",
          '"': "&quot;",
          "'": "&#039;",
        })[c],
    );
  let state = null,
    rpc,
    editor = null,
    filter = "all",
    search = "",
    editing = null,
    busy = false;
  let advanced = false;
  try {
    advanced = localStorage.getItem("context-pouch.mode") === "advanced";
  } catch (_) {}
  const style = document.createElement("style");
  style.textContent = `
    #context-pouch-button{position:fixed;z-index:2147483600;width:30px;height:30px;display:none;align-items:center;justify-content:center;border-radius:9px;border:1px solid #8885;background:var(--vscode-input-background,#282733);color:var(--vscode-foreground,#eee);cursor:pointer;padding:5px}
    #context-pouch-button svg{width:19px;height:19px}#context-pouch-panel{position:fixed;z-index:2147483601;display:none;flex-direction:column;width:min(410px,calc(100vw - 20px));max-height:calc(100vh - 24px);background:var(--vscode-editorWidget-background,#20212b);color:var(--vscode-foreground,#eee);border:1px solid #8885;border-radius:14px;box-shadow:0 16px 44px #0006;font:12px/1.45 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;overflow:hidden}
    #context-pouch-panel.open{display:flex}#context-pouch-panel *{box-sizing:border-box}#context-pouch-panel button,#context-pouch-panel input,#context-pouch-panel select,#context-pouch-panel textarea{font:inherit;color:inherit}#context-pouch-panel button{cursor:pointer;border:1px solid #8884;border-radius:7px;background:transparent;padding:6px 9px}#context-pouch-panel button:hover{background:#8882}#context-pouch-panel button:disabled{opacity:.4;cursor:default}#context-pouch-panel :focus-visible{outline:2px solid var(--vscode-focusBorder,#a798ed);outline-offset:2px}
    .cp-head,.cp-actions{display:flex;gap:7px;align-items:center;padding:11px 12px;border-bottom:1px solid #8883}.cp-head strong{flex:1}.cp-count{font-size:10px;opacity:.65}.cp-tools{padding:10px 12px;display:grid;gap:7px}.cp-tools>div{display:flex;gap:7px}.cp-tools select{min-width:0;flex:1}.cp-list{overflow:auto;min-height:70px;max-height:300px;padding:0 8px 8px}.cp-row{display:flex;align-items:flex-start;gap:7px;padding:8px;border-radius:8px}.cp-row:hover{background:#8881}.cp-row label{display:flex;align-items:flex-start;gap:8px;flex:1;cursor:pointer;min-width:0}.cp-row input{margin:3px 0}.cp-row strong{font-size:12px;display:block}.cp-row small{font-size:10px;opacity:.65;display:block;white-space:pre-wrap;overflow-wrap:anywhere}.cp-row .cp-edit{padding:3px 6px!important}.cp-footer{padding:10px 12px;border-top:1px solid #8883;display:grid;grid-template-columns:1fr 1fr;gap:7px}.cp-primary{background:var(--vscode-button-background,#6654aa)!important;color:var(--vscode-button-foreground,#fff)!important}.cp-wide{grid-column:1/-1}.cp-meta{display:flex;gap:7px;justify-content:space-between;font-size:10px}.cp-empty{padding:18px;text-align:center;opacity:.65}
    #context-pouch-panel input:not([type=checkbox]),#context-pouch-panel select,#context-pouch-panel textarea{width:100%;border:1px solid #8884;border-radius:7px;padding:7px;background:var(--vscode-input-background,#292a35)}.cp-dialog{display:none;padding:12px;overflow:auto;max-height:calc(100vh - 90px)}.cp-dialog.open{display:block}.cp-dialog label{display:block;margin:8px 0}.cp-dialog label>span{display:block;font-size:10px;opacity:.7;margin-bottom:4px}.cp-dialog textarea{resize:vertical;min-height:120px}.cp-dialog pre{font:11px/1.5 monospace;white-space:pre-wrap;overflow-wrap:anywhere;max-height:260px;overflow:auto;padding:10px;background:#8881;border-radius:8px}.cp-dialog .cp-actions{padding:10px 0 0;border:0;flex-wrap:wrap}.cp-error{font-size:11px;padding:8px 12px;color:var(--vscode-errorForeground,#ff9e9e);white-space:pre-wrap}.cp-hidden{display:none!important}
    #context-pouch-panel{box-sizing:border-box;width:min(340px,calc(100vw - 24px));max-height:calc(100vh - 24px)}
    .cp-main{display:flex;flex-direction:column;min-height:0;overflow:hidden}.cp-list{min-height:0;flex:1;max-height:260px}.cp-head,.cp-tools,.cp-footer{flex-shrink:0}.cp-error:empty{display:none}
    .cp-mode{display:flex;gap:3px;padding:0 12px 10px}.cp-mode button{flex:1;border:0!important;font-size:11px!important;color:var(--vscode-descriptionForeground,#aaa)!important}.cp-mode button[aria-pressed=true]{background:#9980de24!important;color:var(--vscode-foreground,#eee)!important}
    #context-pouch-panel:not(.advanced) .cp-advanced{display:none!important}#context-pouch-panel:not(.advanced) .cp-row small,#context-pouch-panel:not(.advanced) .cp-edit{display:none}#context-pouch-panel:not(.advanced) .cp-footer{grid-template-columns:1fr}#context-pouch-panel:not(.advanced) .cp-row{padding:7px 8px}#context-pouch-panel:not(.advanced) .cp-row strong{font-weight:500}.cp-head{border-bottom:0;padding-bottom:8px}.cp-tools{padding-top:0}.cp-meta{flex-wrap:wrap}.cp-dialog{min-height:0;flex:1}.cp-row label>span{overflow-wrap:anywhere}.cp-count{white-space:nowrap}
  `;
  style.textContent += `
    #context-pouch-panel .cp-mode{flex-shrink:0}
    #context-pouch-panel.advanced .cp-main{overflow:auto;flex:1;min-height:0}
    #context-pouch-panel.advanced .cp-list{flex:1 0 140px;max-height:340px;overflow:auto}
    #context-pouch-panel.advanced .cp-advanced{visibility:visible}
    #context-pouch-panel.advanced .cp-row small{display:block}
    #context-pouch-panel.advanced .cp-edit{display:inline-block}
    #context-pouch-panel.advanced .cp-tools{padding-top:6px;border-top:1px solid #8883}
    #context-pouch-panel.advanced .cp-footer{position:sticky;bottom:0;background:var(--vscode-editorWidget-background,#20212b);flex-shrink:0}
    #context-pouch-panel.advanced .cp-meta button{font-size:10px}
  `;
  document.documentElement.appendChild(style);
  const button = document.createElement("button");
  button.id = "context-pouch-button";
  button.title = "Context Pouch";
  button.setAttribute("aria-label", "Open Context Pouch");
  button.innerHTML =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7h8l1.2 3.2c.8 2.1 1.3 4.2 1.3 6.5A2.3 2.3 0 0 1 16.2 19H7.8a2.3 2.3 0 0 1-2.3-2.3c0-2.3.5-4.4 1.3-6.5L8 7Z"/><path d="M9 7c0-1.8 1.2-3 3-3s3 1.2 3 3M9 12h6"/></svg>';
  const panel = document.createElement("section");
  panel.id = "context-pouch-panel";
  panel.setAttribute("aria-label", "Context Pouch");
  panel.setAttribute("role", "dialog");
  panel.setAttribute("aria-modal", "false");
  button.setAttribute("aria-controls", panel.id);
  button.setAttribute("aria-expanded", "false");
  panel.innerHTML = `<div class="cp-head"><strong>Pouch</strong><span class="cp-count"></span><button data-action="graph" title="Open rule graph in a new tab" aria-label="Open rule graph">Graph ↗</button><button data-action="close" aria-label="Close Pouch">×</button></div><div class="cp-mode" aria-label="Pouch mode"><button data-action="simple" aria-pressed="true">Simple</button><button data-action="advanced" aria-pressed="false">Advanced</button></div><div class="cp-error" role="status"></div><div class="cp-main"><div class="cp-tools"><input class="cp-search" aria-label="Search rules" placeholder="Find a rule…"><div class="cp-advanced"><select class="cp-scope" aria-label="Filter by library"><option value="all">All libraries</option></select><select class="cp-category" aria-label="Filter by category"><option value="all">All categories</option></select></div><div><select class="cp-preset" aria-label="Task preset"><option value="">Choose a preset…</option></select><button class="cp-advanced" data-action="preset">Save preset</button></div></div><div class="cp-list"></div><div class="cp-footer"><button class="cp-wide" data-action="generate">Generate rules from project</button><button class="cp-primary" data-action="preview">Review selected rules</button><button class="cp-advanced" data-action="reinforce">Reinforce selected</button><div class="cp-wide cp-meta cp-advanced"><button data-action="add">+ Rule</button><button data-action="clear">Clear selection</button></div></div></div><div class="cp-dialog"></div>`;
  let resizingAnimation;
  function setMode(next) {
    const before = panel.classList.contains("open")
      ? panel.getBoundingClientRect()
      : null;
    resizingAnimation?.cancel();
    openingAnimation?.cancel();
    advanced = next;
    panel.classList.toggle("advanced", advanced);
    panel
      .querySelector('[data-action="simple"]')
      .setAttribute("aria-pressed", String(!advanced));
    panel
      .querySelector('[data-action="advanced"]')
      .setAttribute("aria-pressed", String(advanced));
    // Hidden advanced filters must not silently hide rules in Simple mode.
    if (!advanced) {
      filter = "all";
      panel.querySelector(".cp-scope").value = "all";
    }
    try {
      localStorage.setItem(
        "context-pouch.mode",
        advanced ? "advanced" : "simple",
      );
    } catch (_) {}
    render();
    position();
    if (before && !matchMedia("(prefers-reduced-motion: reduce)").matches) {
      const after = panel.getBoundingClientRect();
      resizingAnimation = panel.animate(
        [
          {
            width: `${before.width}px`,
            height: `${before.height}px`,
            left: `${before.left}px`,
            top: `${before.top}px`,
          },
          {
            width: `${after.width}px`,
            height: `${after.height}px`,
            left: `${after.left}px`,
            top: `${after.top}px`,
          },
        ],
        { duration: 240, easing: "cubic-bezier(.2,.8,.2,1)" },
      );
      resizingAnimation.finished.then(
        () => {
          resizingAnimation = null;
          position();
        },
        () => {},
      );
    }
  }
  let openingAnimation;
  const connector = document.createElementNS(
    "http://www.w3.org/2000/svg",
    "svg",
  );
  connector.id = "context-pouch-connector";
  connector.setAttribute("aria-hidden", "true");
  connector.innerHTML =
    '<path fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>';
  connector.style.cssText =
    "position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:2147483599;color:var(--vscode-focusBorder,#aa94df);display:none;opacity:.65";
  document.body.appendChild(connector);
  style.textContent +=
    '#context-pouch-button[aria-expanded="true"]{border-color:var(--vscode-focusBorder,#aa94df);box-shadow:0 0 0 3px #aa94df20}';
  function dismiss(restoreFocus = false) {
    openingAnimation?.cancel();
    resizingAnimation?.cancel();
    connector.style.display = "none";
    panel.classList.remove("open");
    button.setAttribute("aria-expanded", "false");
    if (restoreFocus) button.focus();
    // Keep an unfinished editor intact when temporarily dismissed.
  }

  document.body.append(button, panel);
  const error = (message) => {
    panel.querySelector(".cp-error").textContent = message || "";
  };
  async function request(action, data = {}) {
    if (!rpc) {
      return;
    }
    busy = true;
    try {
      error("");
      return await rpc(action, { revision: state?.revision, ...data });
    } catch (e) {
      error(e.message);
      if (action !== "state") rpc("state").catch(() => {});
      throw e;
    } finally {
      busy = false;
    }
  }
  function findEditor() {
    if (editor?.isConnected && editor.getBoundingClientRect().width > 0)
      return editor;
    return (
      [...document.querySelectorAll('.ProseMirror[contenteditable="true"]')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          return r.width > 100 && r.height > 10;
        })
        .sort(
          (a, b) =>
            b.getBoundingClientRect().bottom - a.getBoundingClientRect().bottom,
        )[0] || null
    );
  }
  document.addEventListener("focusin", (e) => {
    const ed = e.target.closest?.(".ProseMirror");
    if (ed?.getAttribute("contenteditable") === "true") editor = ed;
  });
  function position() {
    const ed = findEditor();
    button.style.display = ed ? "flex" : "none";
    if (!ed) {
      dismiss();
      return;
    }
    const r = ed.getBoundingClientRect();
    button.style.left =
      Math.max(8, Math.min(innerWidth - 38, r.right - 31)) + "px";
    button.style.top =
      Math.max(8, Math.min(innerHeight - 38, r.top - 35)) + "px";
    if (
      !panel.classList.contains("open") ||
      resizingAnimation?.playState === "running"
    )
      return;
    const gap = 16,
      margin = 12;
    // Include the composer shell's padding when choosing an outside margin.
    const shell = ed.parentElement?.getBoundingClientRect();
    const leftEdge =
      shell && shell.width < innerWidth * 0.95 ? shell.left : r.left - 16;
    const rightEdge =
      shell && shell.width < innerWidth * 0.95 ? shell.right : r.right + 16;
    const leftRoom = leftEdge - gap - margin;
    const rightRoom = innerWidth - rightEdge - gap - margin;
    const anchor = button.getBoundingClientRect();
    // A left margin across a wide chat is farther away than an anchored popover.
    const useRight = rightRoom >= 280;
    const useLeft =
      !useRight && leftRoom >= 280 && anchor.left - leftEdge < 180;
    const docked = useRight || useLeft;
    const panelWidth = Math.min(
      advanced ? 410 : 300,
      docked
        ? useRight
          ? rightRoom
          : leftRoom
        : advanced
          ? innerWidth - margin * 2
          : Math.max(260, innerWidth * 0.42),
      innerWidth - margin * 2,
    );
    panel.style.width = panelWidth + "px";
    panel.style.maxHeight =
      Math.max(
        140,
        Math.min(
          innerHeight - 24,
          advanced ? 660 : docked ? 500 : innerHeight * 0.48,
        ),
      ) + "px";
    const above = anchor.top - margin - 12;
    const below = innerHeight - anchor.bottom - margin - 12;
    const openAbove = above >= below;
    if (!docked)
      panel.style.maxHeight =
        Math.max(
          100,
          Math.min(
            advanced ? 660 : innerHeight * 0.48,
            openAbove ? above : below,
          ),
        ) + "px";
    // Advanced is a full workspace, not a content-sized compact picker.
    panel.style.height = advanced ? panel.style.maxHeight : "auto";
    panel.dataset.placement = docked
      ? useRight
        ? "right"
        : "left"
      : openAbove
        ? "above"
        : "below";
    const left = docked
      ? useRight
        ? rightEdge + gap
        : leftEdge - gap - panelWidth
      : anchor.right - panelWidth;
    const x = Math.max(
      margin,
      Math.min(innerWidth - panelWidth - margin, left),
    );
    const top = docked
      ? anchor.bottom - panel.offsetHeight
      : openAbove
        ? anchor.top - 12 - panel.offsetHeight
        : anchor.bottom + 12;
    const y = Math.max(
      margin,
      Math.min(innerHeight - panel.offsetHeight - margin, top),
    );
    panel.style.left = x + "px";
    panel.style.right = "auto";
    panel.style.top = y + "px";
    const ax = anchor.left + anchor.width / 2,
      ay = anchor.top + anchor.height / 2;
    panel.style.transformOrigin = `${ax - x}px ${ay - y}px`;
    // Join the nearest panel edge to the button; this never intercepts chat clicks.
    const px = Math.max(x + 16, Math.min(x + panelWidth - 16, ax));
    const py = Math.max(y + 16, Math.min(y + panel.offsetHeight - 16, ay));
    const endX = docked ? (useRight ? x : x + panelWidth) : px;
    const endY = docked ? py : openAbove ? y + panel.offsetHeight : y;
    const startX = docked ? (useRight ? anchor.right : anchor.left) : ax;
    const startY = docked ? ay : openAbove ? anchor.top : anchor.bottom;
    connector
      .querySelector("path")
      .setAttribute("d", `M ${startX} ${startY} L ${endX} ${endY}`);
    connector.style.display = "block";
  }

  function render() {
    if (!state) {
      for (const action of ["preview", "reinforce", "preset"])
        panel.querySelector(`[data-action="${action}"]`).disabled = true;
      panel.querySelector(".cp-list").innerHTML =
        '<div class="cp-empty">Connecting to your library…</div>';
      return;
    }
    const scope = panel.querySelector(".cp-scope");
    const oldScope = scope.value;
    scope.innerHTML =
      '<option value="all">All libraries</option>' +
      state.scopes
        .map(
          (s) =>
            `<option value="${s.id}">${esc(s.id === "project" ? "Project · " + s.name : s.name)}</option>`,
        )
        .join("");
    scope.value = state.scopes.some((s) => s.id === oldScope)
      ? oldScope
      : "all";
    const cats = [...new Set(state.rules.map((r) => r.category))];
    if (!cats.includes(filter)) filter = "all";
    panel.querySelector(".cp-category").innerHTML =
      '<option value="all">All categories</option>' +
      cats
        .map(
          (c) =>
            `<option value="${esc(c)}" ${c === filter ? "selected" : ""}>${esc(c)}</option>`,
        )
        .join("");
    panel.querySelector(".cp-preset").innerHTML =
      '<option value="">Choose a task preset…</option>' +
      state.presets
        .map(
          (p) =>
            `<option value="${esc(p.key)}">${esc(p.title)} · ${esc(p.scope)}</option>`,
        )
        .join("");
    const q = search.toLowerCase();
    const shown = state.rules.filter(
      (r) =>
        (scope.value === "all" || r.scope === scope.value) &&
        (filter === "all" || r.category === filter) &&
        `${r.title} ${r.text} ${r.category}`.toLowerCase().includes(q),
    );
    panel.querySelector(".cp-list").innerHTML = shown.length
      ? shown
          .map(
            (r) =>
              `<div class="cp-row"><label title="${esc(r.text)}"><input type="checkbox" data-key="${esc(r.key)}" ${state.selected.includes(r.key) ? "checked" : ""}><span><strong>${esc(r.title)}</strong><small>${esc(r.text)}</small><small>${esc(r.scope)} · ${esc(r.category)}${r.appliesTo && r.appliesTo !== "." ? " · " + esc(r.appliesTo) + "/" : ""}</small></span></label><button class="cp-edit" data-action="edit" data-key="${esc(r.key)}" aria-label="Edit ${esc(r.title)}">✎</button></div>`,
          )
          .join("")
      : '<div class="cp-empty">No matching rules. Add a rule or explore the graph.</div>';
    panel.querySelector(".cp-count").textContent =
      `${state.selected.length} selected`;
    for (const a of ["preview", "reinforce", "preset"])
      panel.querySelector(`[data-action="${a}"]`).disabled =
        !state.selected.length;
    panel.querySelector('[data-action="generate"]').disabled =
      !state.scopes.some(s => s.id === "project" && s.writable);
    position();
  }
  const picked = () =>
    state.rules.filter((r) => state.selected.includes(r.key));
  function dialog(html) {
    panel.querySelector(".cp-main").classList.add("cp-hidden");
    const d = panel.querySelector(".cp-dialog");
    d.innerHTML = html;
    d.classList.add("open");
    position();
    d.querySelector("input, button")?.focus();
  }
  function closeDialog() {
    panel.querySelector(".cp-dialog").classList.remove("open");
    panel.querySelector(".cp-main").classList.remove("cp-hidden");
    editing = null;
    position();
  }
  function edit(rule) {
    editing = rule || null;
    dialog(
      `<strong>${rule ? "Edit rule" : "New rule"}</strong><label><span>Library</span><select name="scope" ${rule ? "disabled" : ""}>${state.scopes
        .filter((s) => s.writable)
        .map(
          (s) =>
            `<option value="${s.id}" ${rule?.scope === s.id ? "selected" : ""}>${esc(s.name)}</option>`,
        )
        .join(
          "",
        )}</select></label><label><span>Title</span><input name="title" maxlength="100" value="${esc(rule?.title || "")}"></label><label><span>Category</span><input name="category" maxlength="50" value="${esc(rule?.category || "Other")}"></label><label><span>Rule text</span><textarea name="text" maxlength="5000">${esc(rule?.text || "")}</textarea></label><div class="cp-actions"><button class="cp-primary" data-action="save">Save rule</button><button data-action="cancel">Cancel</button>${rule ? '<button data-action="delete">Delete rule</button>' : ""}</div>`,
    );
  }
  function insertInstructions(text) {
    const ed = findEditor();
    if (!ed)
      throw new Error("No active Codex composer. Click your draft and try again.");
    if (!text) return;
    const hasContent = Boolean(ed.textContent.trim()) ||
      Boolean(ed.querySelector('[contenteditable="false"], img'));
    ed.focus();
    const range = document.createRange();
    range.selectNodeContents(ed);
    range.collapse(false);
    const selection = window.getSelection();
    selection.removeAllRanges();
    selection.addRange(range);
    if (!document.execCommand("insertText", false, (hasContent ? "\n\n" : "") + text))
      throw new Error("Codex rejected the insertion. Run Install / Repair and reload.");
    closeDialog();
    dismiss();
  }
  function preview(mode) {
    const payload = M.payload(picked(), mode);
    dialog(
      `<strong>Preview instructions</strong><p>These instructions will be added to the end of your draft. You can edit them before sending.</p><pre>${esc(payload)}</pre><div class="cp-actions"><button class="cp-primary" data-action="apply">Insert into draft</button><button data-action="cancel">Back</button></div>`,
    );
    panel.querySelector('[data-action="apply"]').onclick = () => {
      try {
        insertInstructions(payload);
      } catch (e) {
        error(e.message);
      }
    };
  }
  panel.addEventListener("input", (e) => {
    if (e.target.matches(".cp-search")) {
      search = e.target.value;
      render();
    }
  });
  panel.addEventListener("change", async (e) => {
    try {
      if (e.target.matches(".cp-scope")) render();
      else if (e.target.matches(".cp-category")) {
        filter = e.target.value;
        render();
      } else if (e.target.matches("[data-key][type=checkbox]")) {
        await request("toggle", {
          key: e.target.dataset.key,
          checked: e.target.checked,
        });
      } else if (e.target.matches(".cp-preset") && e.target.value) {
        const p = state.presets.find((p) => p.key === e.target.value);
        await request("select", {
          keys: p.ruleIds.map((id) => M.key(p.scope, id)),
        });
      }
    } catch (_) {}
  });
  panel.addEventListener("click", async (e) => {
    const el = e.target.closest("[data-action]");
    if (!el) return;
    const action = el.dataset.action;
    try {
      if (action === "close") {
        dismiss(true);
      } else if (action === "simple" || action === "advanced")
        setMode(action === "advanced");
      else if (action === "cancel") closeDialog();
      else if (action === "graph") await request("graph");
      else if (!state || busy) return;
      else if (action === "generate") { dismiss(); await request("generate"); }
      else if (action === "clear") await request("select", { keys: [] });
      else if (action === "add") edit();
      else if (action === "edit")
        edit(state.rules.find((r) => r.key === el.dataset.key));
      else if (action === "preview" || action === "reinforce")
        preview(action === "reinforce" ? "reinforce" : "inject");
      else if (action === "save") {
        const field = (name) =>
          panel.querySelector(`[name="${name}"]`).value.trim();
        await request("saveRule", {
          scope: editing?.scope || field("scope"),
          rule: {
            id: editing?.id,
            title: field("title"),
            category: field("category") || "Other",
            text: field("text"),
            related: editing?.related || [],
          },
        });
        closeDialog();
      } else if (action === "delete") {
        dialog(
          `<strong>Delete “${esc(editing.title)}”?</strong><p>It will also be removed from presets and related-rule links.</p><div class="cp-actions"><button data-action="confirm-delete">Delete rule</button><button data-action="cancel">Cancel</button></div>`,
        );
      } else if (action === "confirm-delete") {
        await request("deleteRule", { scope: editing.scope, id: editing.id });
        closeDialog();
      } else if (action === "preset") {
        if (new Set(picked().map((r) => r.scope)).size !== 1)
          throw new Error(
            "Select rules from one library to create a portable preset.",
          );
        dialog(
          '<strong>Save selected rules as a preset</strong><label><span>Preset name</span><input name="preset-title" maxlength="100" placeholder="Small bug fix"></label><div class="cp-actions"><button class="cp-primary" data-action="save-preset">Save preset</button><button data-action="cancel">Cancel</button></div>',
        );
      } else if (action === "save-preset") {
        const rules = picked();
        await request("savePreset", {
          scope: rules[0].scope,
          title: panel.querySelector('[name="preset-title"]').value.trim(),
          ruleIds: rules.map((r) => r.id),
        });
        closeDialog();
      }
    } catch (e) {
      error(e.message);
    }
  });
  button.addEventListener("click", () => {
    if (panel.classList.contains("open")) {
      dismiss();
      return;
    }
    panel.classList.add("open");
    button.setAttribute("aria-expanded", "true");
    if (panel.classList.contains("open")) {
      request("state").catch(() => {});
      render();
      position();
      openingAnimation?.cancel();
      if (!matchMedia("(prefers-reduced-motion: reduce)").matches) {
        openingAnimation = panel.animate(
          [
            { opacity: 0, transform: "scale(.18)" },
            { opacity: 1, transform: "scale(1)" },
          ],
          { duration: 190, easing: "cubic-bezier(.2,.8,.2,1)" },
        );
      }
      (
        panel.querySelector(".cp-dialog.open input, .cp-dialog.open button") ||
        panel.querySelector(".cp-search")
      ).focus();
    }
  });
  document.addEventListener(
    "pointerdown",
    (e) => {
      if (
        panel.classList.contains("open") &&
        !e.composedPath().includes(panel) &&
        !e.composedPath().includes(button)
      )
        dismiss();
    },
    true,
  );
  window.addEventListener("blur", () => dismiss());
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && panel.classList.contains("open")) {
      if (panel.querySelector(".cp-dialog.open")) closeDialog();
      else {
        dismiss(true);
      }
      e.stopPropagation();
    }
  });
  let scheduled = false;
  const schedule = () => {
    if (!scheduled) {
      scheduled = true;
      requestAnimationFrame(() => {
        scheduled = false;
        position();
      });
    }
  };
  new MutationObserver(schedule).observe(document.body, {
    childList: true,
    subtree: true,
  });
  window.addEventListener("resize", schedule);
  window.addEventListener("scroll", schedule, true);
  setInterval(schedule, 1200);
  const connect = setInterval(async () => {
    if (!window.__contextPouchApi) return;
    clearInterval(connect);
    rpc = window.createPouchClient(
      window.__contextPouchApi,
      (next) => {
        state = next;
        render();
      },
      error,
    );
    try {
      await request("state");
      let legacy;
      try {
        legacy = JSON.parse(
          localStorage.getItem("context-pouch.rules.v1") || "null",
        );
      } catch (_) {}
      if (
        Array.isArray(legacy) &&
        !localStorage.getItem("context-pouch.migrated.v2")
      ) {
        let selected = [];
        try {
          selected = JSON.parse(
            sessionStorage.getItem("context-pouch.selected.v1") || "[]",
          );
        } catch (_) {}
        await request("migrate", { rules: legacy, selected });
        localStorage.setItem("context-pouch.migrated.v2", "true");
      }
    } catch (e) {
      error(e.message);
    }
  }, 100);
  setTimeout(() => {
    if (!rpc) {
      clearInterval(connect);
      error(
        "Pouch bridge unavailable. Run “Context Pouch: Install / Repair Codex Button” and reload VS Code.",
      );
    }
  }, 15000);
  setMode(advanced);
  position();
})();
