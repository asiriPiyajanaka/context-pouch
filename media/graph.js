(() => {
  "use strict";
  const M = window.ContextPouchModel,
    api = acquireVsCodeApi();
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
  const app = document.querySelector("#app");
  app.innerHTML = `<div class="app"><header class="topbar"><div class="brand"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 7h8l1.2 3.2c.8 2.1 1.3 4.2 1.3 6.5A2.3 2.3 0 0 1 16.2 19H7.8a2.3 2.3 0 0 1-2.3-2.3c0-2.3.5-4.4 1.3-6.5L8 7Z"/><path d="M9 7c0-1.8 1.2-3 3-3s3 1.2 3 3M9 12h6"/></svg>Pouch<span class="slash">/</span></div><span class="subtitle">Rule graph</span><div class="top-actions"><button data-action="import">Import pack</button><button data-action="export">Export</button><button class="primary" data-action="new">+ New rule</button></div></header><main class="workspace"><aside class="sidebar"><div class="side-top"><div class="eyebrow">Your library</div><select id="project" aria-label="Active project"></select><input id="search" type="search" placeholder="Search your rules…" aria-label="Search rules"><div class="scope-tabs"><button data-scope="all" class="active">All</button><button data-scope="personal">Personal</button><button data-scope="project">Project</button></div></div><div class="section-label"><span class="eyebrow">Rules</span><span id="rule-count" class="count"></span></div><div class="rule-list" aria-label="Rules"></div><section class="presets"><div class="section-label"><span class="eyebrow">Task presets</span><button class="subtle" data-action="new-preset" aria-label="Save selection as preset">+</button></div><div id="preset-list"></div></section></aside><section class="graph-area" aria-label="Interactive rule graph"><div class="graph-tools"><select id="category" aria-label="Category filter"><option value="all">All categories</option></select><button data-action="neighbors" title="Show only the focused rule and its immediate connections">Local graph</button><label><input type="checkbox" id="show-categories" checked>Categories</label><label><input type="checkbox" id="show-presets" checked>Presets</label></div><canvas tabindex="0" aria-label="Rule graph. Drag to pan, scroll to zoom. Use the rule list to navigate by keyboard."></canvas><div class="graph-empty hidden">No matching rules. Clear your filters or add a rule.</div><div class="graph-caption"><strong>Small rules. Connected thinking.</strong>Drag nodes to arrange · Scroll to zoom</div><div class="zoom"><button data-action="zoom-out" aria-label="Zoom out">−</button><output id="zoom-level">100%</output><button data-action="zoom-in" aria-label="Zoom in">+</button><button data-action="fit" aria-label="Fit graph">Fit</button></div></section><aside class="inspector welcome" aria-label="Rule details"></aside></main><footer class="statusbar"><span class="status-dot">●</span><span id="summary">Connecting to your library…</span><button class="subtle" data-action="clear">Clear selection</button><span class="message" role="status"></span></footer></div><dialog id="editor-dialog"></dialog>`;
  let state,
    scope = "all",
    query = "",
    category = "all",
    focus = null,
    local = false;
  let nodes = [],
    edges = [],
    width = 600,
    height = 600,
    scale = 1,
    pan = { x: 0, y: 0 },
    hover = null,
    frame = null,
    steps = 0,
    didFit = false,
    topology = "";
  let editRevision,
    pending = false;
  const positions = new Map(),
    canvas = app.querySelector("canvas"),
    ctx = canvas.getContext("2d"),
    modal = app.querySelector("dialog");
  const status = (message = "", error = false) => {
    const el = app.querySelector(".message");
    el.textContent = message;
    el.classList.toggle("error", error);
    el.title = message;
  };
  const rpc = window.createPouchClient(
    api,
    (next) => {
      state = next;
      render();
    },
    (message) => status(message, true),
  );
  async function request(action, data = {}) {
    try {
      return await rpc(action, { revision: state?.revision, ...data });
    } catch (e) {
      status(e.message, true);
      if (modal.open)
        modal.querySelector(".dialog-error").textContent = e.message;
      rpc("state").catch(() => {});
      throw e;
    }
  }
  const selected = () =>
    state?.rules.filter((r) => state.selected.includes(r.key)) || [];
  const visibleRules = () =>
    state?.rules.filter(
      (r) =>
        (scope === "all" || r.scope === scope) &&
        (category === "all" || r.category === category) &&
        `${r.title} ${r.text} ${r.category}`.toLowerCase().includes(query),
    ) || [];
  function render() {
    if (focus && !state.rules.some((r) => r.key === focus)) focus = null;
    const project = app.querySelector("#project");
    project.innerHTML = state.projects.length
      ? state.projects
          .map((p) => `<option value="${esc(p.id)}">${esc(p.name)}</option>`)
          .join("")
      : '<option value="">No project open</option>';
    project.value = state.project;
    project.disabled = state.projects.length < 2;
    app.querySelector('[data-scope="project"]').disabled = !state.scopes.some(
      (s) => s.id === "project",
    );
    if (scope === "project" && !state.scopes.some((s) => s.id === "project"))
      scope = "all";
    app
      .querySelectorAll("[data-scope]")
      .forEach((b) => b.classList.toggle("active", b.dataset.scope === scope));
    const cats = [...new Set(state.rules.map((r) => r.category))].sort();
    if (!cats.includes(category)) category = "all";
    app.querySelector("#category").innerHTML =
      '<option value="all">All categories</option>' +
      cats
        .map(
          (c) =>
            `<option value="${esc(c)}" ${c === category ? "selected" : ""}>${esc(c)}</option>`,
        )
        .join("");
    const rules = visibleRules();
    app.querySelector("#rule-count").textContent =
      `${rules.length} / ${state.rules.length}`;
    app.querySelector(".rule-list").innerHTML = rules.length
      ? rules
          .map(
            (r) =>
              `<div class="rule-item ${r.key === focus ? "active" : ""}"><input type="checkbox" data-select="${esc(r.key)}" aria-label="Include ${esc(r.title)}" ${state.selected.includes(r.key) ? "checked" : ""}><button data-rule="${esc(r.key)}"><span class="rule-title">${esc(r.title)}</span><span class="rule-meta">${esc(r.category)} · ${esc(r.scope)}</span></button></div>`,
          )
          .join("")
      : '<div class="empty-list">No matching rules.</div>';
    app.querySelector("#preset-list").innerHTML =
      state.presets
        .filter((p) => scope === "all" || p.scope === scope)
        .map(
          (p) =>
            `<div class="preset-row"><button data-preset="${esc(p.key)}" title="Select this preset’s rules"><span class="preset-mark">◇</span>${esc(p.title)} <span class="count">${p.ruleIds.length}</span></button><button class="subtle" data-edit-preset="${esc(p.key)}" aria-label="Edit ${esc(p.title)}">✎</button></div>`,
        )
        .join("") ||
      '<div class="empty-list">Select rules, then + to save a preset.</div>';
    app.querySelector("#summary").textContent =
      `${state.rules.length} rules · ${state.presets.length} presets · ${state.selected.length} selected`;
    app.querySelector('[data-action="new-preset"]').disabled =
      !state.selected.length;
    renderInspector();
    buildGraph();
  }
  function renderInspector() {
    const el = app.querySelector(".inspector"),
      rule = state?.rules.find((r) => r.key === focus);
    el.classList.toggle("welcome", !rule);
    if (!rule) {
      el.innerHTML = `<div class="eyebrow">A map of your constraints</div><div class="welcome-art">⌘</div><h1>Give your rules<br>some context.</h1><p class="hint">Explore how your rules fit together. Choose a node to read, edit, or include it in your next prompt.</p><div class="stats"><div class="stat"><strong>${state?.rules.length || 0}</strong><span>reusable rules</span></div><div class="stat"><strong>${state?.selected.length || 0}</strong><span>selected for your task</span></div></div><div class="legend"><span>Rule</span><span>Category</span><span>Preset</span></div><p class="hint">Lines connect rules to categories and presets. Add related-rule links to describe connections of your own.</p><p class="hint">Your selection is shared with the Pouch button beside the Codex composer.</p>`;
      return;
    }
    const linked = state.rules.filter(
      (r) =>
        r.scope === rule.scope &&
        (rule.related.includes(r.id) || r.related.includes(rule.id)),
    );
    const presets = state.presets.filter(
      (p) => p.scope === rule.scope && p.ruleIds.includes(rule.id),
    );
    const writable = state.scopes.find((s) => s.id === rule.scope)?.writable;
    el.innerHTML = `<div class="section-label inspector-heading"><span class="eyebrow">Rule details</span><button class="subtle" data-action="unfocus" aria-label="Close rule details">×</button></div><h1>${esc(rule.title)}</h1><div class="badges"><span class="badge">${esc(rule.scope)}</span><span class="badge">${esc(rule.category)}</span></div><p class="rule-body">${esc(rule.text)}</p><div class="inspector-actions"><button class="${state.selected.includes(rule.key) ? "" : "primary"}" data-action="toggle-focused">${state.selected.includes(rule.key) ? "✓ Selected · remove" : "+ Select for task"}</button><button data-action="edit" ${writable ? "" : "disabled"}>Edit</button></div><h2>Related rules <span class="count">${linked.length}</span></h2><div class="related-list">${linked.length ? linked.map((r) => `<button data-rule="${esc(r.key)}">↗ ${esc(r.title)}</button>`).join("") : '<p class="hint">Edit this rule to link related constraints.</p>'}</div><h2>Used in presets</h2><div class="related-list">${presets.length ? presets.map((p) => `<button data-preset="${esc(p.key)}">◇ ${esc(p.title)}</button>`).join("") : '<p class="hint">This rule isn’t part of a preset yet.</p>'}</div>`;
  }
  function showDialog(title, body, actions) {
    editRevision = state.revision;
    modal.innerHTML = `<form><h2>${esc(title)}</h2>${body}<div class="dialog-error" role="alert"></div><div class="dialog-actions">${actions || ""}<button type="button" data-dialog="cancel">Cancel</button><button type="submit" class="primary">Save</button></div></form>`;
    if (!modal.open) modal.showModal();
    modal.querySelector("input:not([type=checkbox]),select,button")?.focus();
  }
  function scopeOptions(chosen) {
    return state.scopes
      .filter((s) => s.writable)
      .map(
        (s) =>
          `<option value="${s.id}" ${s.id === chosen ? "selected" : ""}>${esc(s.id === "project" ? "Project · " + s.name : s.name)}</option>`,
      )
      .join("");
  }
  const value = (name) => modal.querySelector(`[name="${name}"]`).value.trim();
  function editRule(rule) {
    const chosen =
      rule?.scope || (scope === "project" ? "project" : "personal");
    showDialog(
      rule ? "Edit rule" : "Create a rule",
      `<label class="field"><span>Library</span><select name="scope" ${rule ? "disabled" : ""}>${scopeOptions(chosen)}</select></label><label class="field"><span>Title</span><input name="title" required maxlength="100" value="${esc(rule?.title || "")}" placeholder="Reuse existing components"></label><label class="field"><span>Category</span><input name="category" required maxlength="50" value="${esc(rule?.category || "Code")}"></label><label class="field"><span>Instructions included in the prompt</span><textarea name="text" required maxlength="5000" placeholder="Describe the constraint…">${esc(rule?.text || "")}</textarea></label><label class="field"><span>Related rules · in the same library</span></label><div class="link-picker" id="links"></div>`,
      rule
        ? '<button type="button" class="danger" data-dialog="delete">Delete</button>'
        : "",
    );
    const renderLinks = () => {
      const candidates = state.rules.filter(
        (r) => r.scope === value("scope") && r.id !== rule?.id,
      );
      modal.querySelector("#links").innerHTML =
        candidates
          .map(
            (r) =>
              `<label><input type="checkbox" name="related" value="${esc(r.id)}" ${rule?.related.includes(r.id) ? "checked" : ""}>${esc(r.title)}</label>`,
          )
          .join("") ||
        '<span class="hint">Add another rule to create a connection.</span>';
    };
    renderLinks();
    modal.querySelector('[name="scope"]').onchange = renderLinks;
    modal.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      if (pending) return;
      pending = true;
      try {
        await request("saveRule", {
          revision: editRevision,
          scope: rule?.scope || value("scope"),
          rule: {
            id: rule?.id,
            title: value("title"),
            category: value("category"),
            text: value("text"),
            related: [
              ...modal.querySelectorAll('[name="related"]:checked'),
            ].map((x) => x.value),
          },
        });
        modal.close();
        status("Rule saved. Composer library updated.");
      } catch (_) {
      } finally {
        pending = false;
      }
    };
    if (rule)
      modal.querySelector('[data-dialog="delete"]').onclick = () =>
        confirmDelete("rule", rule);
  }
  function confirmDelete(kind, item) {
    showDialog(
      `Delete ${kind}?`,
      `<p>Delete “${esc(item.title)}”?${kind === "rule" ? " Its preset memberships and related-rule links will also be removed." : ""}</p>`,
    );
    modal.querySelector('[type="submit"]').textContent = "Delete";
    modal.querySelector('[type="submit"]').className = "danger";
    modal.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      if (pending) return;
      pending = true;
      try {
        await request(kind === "rule" ? "deleteRule" : "deletePreset", {
          revision: editRevision,
          scope: item.scope,
          id: item.id,
        });
        modal.close();
        status(`${kind === "rule" ? "Rule" : "Preset"} deleted.`);
      } catch (_) {
      } finally {
        pending = false;
      }
    };
  }
  function editPreset(preset) {
    const chosen = preset?.scope || selected()[0]?.scope || "personal";
    if (!preset && new Set(selected().map((r) => r.scope)).size !== 1) {
      status("Select rules from one library to save a portable preset.", true);
      return;
    }
    const ruleIds = preset?.ruleIds || selected().map((r) => r.id);
    showDialog(
      preset ? "Edit task preset" : "Save task preset",
      `<p class="hint">${esc(chosen)} library · presets travel with their rules.</p><label class="field"><span>Name</span><input name="title" required maxlength="100" value="${esc(preset?.title || "")}" placeholder="Small bug fix"></label><label class="field"><span>Rules in this preset</span></label><div class="link-picker">${state.rules
        .filter((r) => r.scope === chosen)
        .map(
          (r) =>
            `<label><input type="checkbox" name="rule" value="${esc(r.id)}" ${ruleIds.includes(r.id) ? "checked" : ""}>${esc(r.title)}</label>`,
        )
        .join("")}</div>`,
      preset
        ? '<button type="button" class="danger" data-dialog="delete">Delete</button>'
        : "",
    );
    modal.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      if (pending) return;
      pending = true;
      try {
        await request("savePreset", {
          revision: editRevision,
          scope: chosen,
          id: preset?.id,
          title: value("title"),
          ruleIds: [...modal.querySelectorAll('[name="rule"]:checked')].map(
            (r) => r.value,
          ),
        });
        modal.close();
        status("Preset saved.");
      } catch (_) {
      } finally {
        pending = false;
      }
    };
    if (preset)
      modal.querySelector('[data-dialog="delete"]').onclick = () =>
        confirmDelete("preset", preset);
  }
  function packDialog(action) {
    showDialog(
      action === "import" ? "Import a rule pack" : "Export a rule pack",
      `<label class="field"><span>${action === "import" ? "Import into" : "Export from"}</span><select name="scope">${scopeOptions(scope === "project" ? "project" : "personal")}</select></label>${action === "export" ? '<label class="field"><span>Include</span><select name="include"><option value="all">All rules and presets in this library</option><option value="selected">Selected rules and their complete presets</option></select></label>' : '<p class="hint">Choose a JSON pack next. You’ll review its rules and duplicate counts before importing.</p>'}`,
    );
    modal.querySelector('[type="submit"]').textContent =
      action === "import" ? "Choose file…" : "Export…";
    modal.querySelector("form").onsubmit = async (e) => {
      e.preventDefault();
      if (pending) return;
      pending = true;
      try {
        await request(action, {
          scope: value("scope"),
          selectedOnly: action === "export" && value("include") === "selected",
        });
        modal.close();
      } catch (_) {
      } finally {
        pending = false;
      }
    };
  }
  modal.addEventListener("click", (e) => {
    if (e.target.closest('[data-dialog="cancel"]') && !pending) modal.close();
  });
  modal.addEventListener("cancel", (e) => {
    if (pending) e.preventDefault();
  });
  app.addEventListener("click", async (e) => {
    if (!state) return;
    const target = e.target.closest("button");
    if (!target) return;
    try {
      if (target.dataset.scope) {
        scope = target.dataset.scope;
        render();
        return;
      }
      if (target.dataset.rule) {
        focus = target.dataset.rule;
        render();
        return;
      }
      if (target.dataset.preset) {
        const p = state.presets.find((p) => p.key === target.dataset.preset);
        await request("select", {
          keys: p.ruleIds.map((id) => M.key(p.scope, id)),
        });
        status(`Selected “${p.title}”. Ready in the composer.`);
        return;
      }
      if (target.dataset.editPreset) {
        editPreset(
          state.presets.find((p) => p.key === target.dataset.editPreset),
        );
        return;
      }
      const action = target.dataset.action;
      if (action === "new") editRule();
      if (action === "edit") editRule(state.rules.find((r) => r.key === focus));
      if (action === "new-preset") editPreset();
      if (action === "unfocus") {
        focus = null;
        local = false;
        render();
      }
      if (action === "clear") await request("select", { keys: [] });
      if (action === "toggle-focused") await toggle(focus);
      if (action === "import" || action === "export") packDialog(action);
      if (action === "neighbors") {
        if (!focus) {
          status("Choose a rule first, then open its local graph.");
          return;
        }
        local = !local;
        buildGraph();
      }
      if (action === "zoom-in") zoom(1.2);
      if (action === "zoom-out") zoom(1 / 1.2);
      if (action === "fit") fit();
    } catch (_) {}
  });
  async function toggle(key, checked) {
    await request("toggle", { key, checked });
  }
  app.addEventListener("change", async (e) => {
    try {
      if (e.target.dataset.select)
        await toggle(e.target.dataset.select, e.target.checked);
      if (e.target.id === "project") {
        focus = null;
        await request("project", { id: e.target.value });
      }
      if (e.target.id === "category") {
        category = e.target.value;
        render();
      }
      if (["show-categories", "show-presets"].includes(e.target.id))
        buildGraph();
    } catch (_) {}
  });
  app.querySelector("#search").addEventListener("input", (e) => {
    query = e.target.value.toLowerCase().trim();
    render();
  });
  function buildGraph() {
    const rules = visibleRules(),
      map = new Map(),
      links = [],
      usedLinks = new Set();
    function node(id, label, type, data) {
      if (map.has(id)) return;
      const p = positions.get(id) || {
        x: Math.cos(map.size * 2.399) * (80 + Math.sqrt(map.size) * 33),
        y: Math.sin(map.size * 2.399) * (80 + Math.sqrt(map.size) * 33),
        vx: 0,
        vy: 0,
      };
      const n = { ...p, id, label, type, data };
      map.set(id, n);
      positions.set(id, n);
    }
    function edge(a, b, type) {
      const key = [a, b].sort().join("|");
      if (usedLinks.has(key)) return;
      usedLinks.add(key);
      links.push({ a, b, type });
    }
    for (const r of rules) node(r.key, r.title, "rule", r);
    for (const r of rules) {
      if (app.querySelector("#show-categories").checked) {
        const id = "cat:" + r.category;
        node(id, r.category, "category");
        edge(r.key, id, "category");
      }
      for (const id of r.related) {
        const key = M.key(r.scope, id);
        if (map.has(key)) edge(r.key, key, "related");
      }
    }
    if (app.querySelector("#show-presets").checked)
      for (const p of state.presets) {
        const members = p.ruleIds
          .map((id) => M.key(p.scope, id))
          .filter((id) => map.has(id));
        if (!members.length) continue;
        const id = "preset:" + p.key;
        node(id, p.title, "preset", p);
        for (const member of members) edge(member, id, "preset");
      }
    let keep;
    if (local && focus) {
      keep = new Set([focus]);
      for (const e of links) {
        if (e.a === focus) keep.add(e.b);
        if (e.b === focus) keep.add(e.a);
      }
    }
    nodes = [...map.values()].filter((n) => !keep || keep.has(n.id));
    const nodeIds = new Set(nodes.map((n) => n.id));
    edges = links
      .filter((e) => nodeIds.has(e.a) && nodeIds.has(e.b))
      .map((e) => ({ ...e, source: map.get(e.a), target: map.get(e.b) }));
    app
      .querySelector('[data-action="neighbors"]')
      .classList.toggle("active", local);
    app
      .querySelector(".graph-empty")
      .classList.toggle("hidden", nodes.length > 0);
    const nextTopology = JSON.stringify([
      nodes.map((n) => n.id),
      edges.map((e) => [e.a, e.b]),
    ]);
    // Settle before fitting so nodes do not drift offscreen after the initial fit.
    // Selection changes preserve the user's arrangement and camera.
    if (nextTopology !== topology) {
      topology = nextTopology;
      if (nodes.length <= 300) for (let i = 0; i < 180; i++) simulate();
      for (const n of nodes) n.vx = n.vy = 0;
      fit();
      didFit = true;
    }
    steps = 0;
    animate();
  }
  function simulate() {
    for (const n of nodes) {
      n.vx = (n.vx || 0) * 0.78 - n.x * 0.012;
      n.vy = (n.vy || 0) * 0.78 - n.y * 0.012;
    }
    for (let i = 0; i < nodes.length; i++)
      for (let j = i + 1; j < nodes.length; j++) {
        const a = nodes[i],
          b = nodes[j],
          dx = a.x - b.x || 0.01,
          dy = a.y - b.y || 0.01,
          d = Math.max(150, dx * dx + dy * dy),
          f = 26 / d;
        a.vx += dx * f;
        a.vy += dy * f;
        b.vx -= dx * f;
        b.vy -= dy * f;
      }
    for (const e of edges) {
      const dx = e.target.x - e.source.x,
        dy = e.target.y - e.source.y,
        d = Math.hypot(dx, dy) || 1,
        f = (d - 135) * 0.004;
      e.source.vx += (dx / d) * f;
      e.source.vy += (dy / d) * f;
      e.target.vx -= (dx / d) * f;
      e.target.vy -= (dy / d) * f;
    }
    for (const n of nodes) {
      if (drag?.node === n) continue;
      n.x += Math.max(-8, Math.min(8, n.vx));
      n.y += Math.max(-8, Math.min(8, n.vy));
    }
  }
  function draw() {
    const dpr = devicePixelRatio || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    const colors = getComputedStyle(document.documentElement);
    const muted = colors.getPropertyValue("--muted").trim() || "#999";
    ctx.fillStyle = "#88888820";
    for (let x = ((pan.x % 25) + 25) % 25; x < width; x += 25)
      for (let y = ((pan.y % 25) + 25) % 25; y < height; y += 25) {
        ctx.beginPath();
        ctx.arc(x, y, 0.7, 0, Math.PI * 2);
        ctx.fill();
      }
    ctx.translate(width / 2 + pan.x, height / 2 + pan.y);
    ctx.scale(scale, scale);
    for (const e of edges) {
      const active =
        focus === e.a ||
        focus === e.b ||
        hover?.id === e.a ||
        hover?.id === e.b;
      ctx.strokeStyle = active
        ? "#ad9aea99"
        : e.type === "related"
          ? "#ad9aea65"
          : "#88888830";
      ctx.lineWidth = (active ? 1.4 : 0.8) / scale;
      ctx.setLineDash(e.type === "related" ? [4 / scale, 4 / scale] : []);
      ctx.beginPath();
      ctx.moveTo(e.source.x, e.source.y);
      ctx.lineTo(e.target.x, e.target.y);
      ctx.stroke();
    }
    ctx.setLineDash([]);
    for (const n of nodes) {
      const isFocus = n.id === focus,
        isHover = n === hover,
        isSelected = state?.selected.includes(n.id);
      const color =
        n.type === "category"
          ? "#8fcbb5"
          : n.type === "preset"
            ? "#de9bb5"
            : "#ad9aea";
      const radius = (n.type === "rule" ? 5.5 : 8) / scale;
      if (isFocus || isHover || isSelected) {
        ctx.beginPath();
        ctx.arc(n.x, n.y, radius + (isFocus ? 8 : 5), 0, Math.PI * 2);
        ctx.fillStyle = color + "19";
        ctx.fill();
        ctx.strokeStyle = color + (isSelected ? "aa" : "55");
        ctx.lineWidth = 1 / scale;
        ctx.stroke();
      }
      ctx.fillStyle = color;
      ctx.beginPath();
      if (n.type === "preset") {
        ctx.moveTo(n.x, n.y - radius);
        ctx.lineTo(n.x + radius, n.y);
        ctx.lineTo(n.x, n.y + radius);
        ctx.lineTo(n.x - radius, n.y);
        ctx.closePath();
      } else ctx.arc(n.x, n.y, radius, 0, Math.PI * 2);
      ctx.fill();
      if (
        nodes.length < 80 ||
        scale > 0.55 ||
        isFocus ||
        isHover ||
        n.type !== "rule"
      ) {
        ctx.font = `${n.type === "rule" ? 400 : 600} ${11 / scale}px -apple-system,BlinkMacSystemFont,Segoe UI,sans-serif`;
        ctx.textAlign = "center";
        ctx.fillStyle =
          isFocus || isHover ? colors.getPropertyValue("--fg").trim() : muted;
        const label =
          n.label.length > 33 && !isFocus && !isHover
            ? n.label.slice(0, 31) + "…"
            : n.label;
        ctx.fillText(label, n.x, n.y + radius + 17 / scale);
      }
    }
    app.querySelector("#zoom-level").textContent =
      Math.round(scale * 100) + "%";
  }
  function animate() {
    if (frame) return;
    frame = requestAnimationFrame(function tick() {
      frame = null;
      if (steps > 0) {
        simulate();
        steps--;
      }
      draw();
      if (steps > 0) frame = requestAnimationFrame(tick);
    });
  }
  function fit() {
    if (!nodes.length) {
      scale = 1;
      pan = { x: 0, y: 0 };
      draw();
      return;
    }
    const xs = nodes.map((n) => n.x),
      ys = nodes.map((n) => n.y),
      minX = Math.min(...xs),
      maxX = Math.max(...xs),
      minY = Math.min(...ys),
      maxY = Math.max(...ys);
    scale = Math.max(
      0.15,
      Math.min(
        1.35,
        (width - 140) / Math.max(160, maxX - minX),
        (height - 180) / Math.max(160, maxY - minY),
      ),
    );
    pan = { x: (-(minX + maxX) / 2) * scale, y: (-(minY + maxY) / 2) * scale };
    animate();
  }
  function zoom(factor, x = width / 2, y = height / 2) {
    const next = Math.max(0.15, Math.min(3, scale * factor)),
      ratio = next / scale;
    pan.x = x - width / 2 - (x - width / 2 - pan.x) * ratio;
    pan.y = y - height / 2 - (y - height / 2 - pan.y) * ratio;
    scale = next;
    animate();
  }
  const point = (e) => {
    const r = canvas.getBoundingClientRect();
    return { x: e.clientX - r.left, y: e.clientY - r.top };
  };
  const world = (p) => ({
    x: (p.x - width / 2 - pan.x) / scale,
    y: (p.y - height / 2 - pan.y) / scale,
  });
  function hit(p) {
    const w = world(p);
    return nodes
      .slice()
      .reverse()
      .find((n) => Math.hypot(n.x - w.x, n.y - w.y) < Math.max(10, 12 / scale));
  }
  let drag = null;
  canvas.addEventListener("pointerdown", (e) => {
    const p = point(e);
    drag = { node: hit(p), start: p, last: p, moved: false };
    canvas.setPointerCapture(e.pointerId);
  });
  canvas.addEventListener("pointermove", (e) => {
    const p = point(e);
    if (drag) {
      if (Math.hypot(p.x - drag.start.x, p.y - drag.start.y) > 4)
        drag.moved = true;
      if (drag.moved) {
        if (drag.node) {
          const w = world(p);
          drag.node.x = w.x;
          drag.node.y = w.y;
          drag.node.vx = drag.node.vy = 0;
        } else {
          pan.x += p.x - drag.last.x;
          pan.y += p.y - drag.last.y;
        }
      }
      drag.last = p;
    } else {
      hover = hit(p);
      canvas.style.cursor = hover ? "pointer" : "grab";
      canvas.title = hover?.label || "";
    }
    animate();
  });
  canvas.addEventListener("pointerup", async (e) => {
    const d = drag;
    drag = null;
    if (canvas.hasPointerCapture(e.pointerId))
      canvas.releasePointerCapture(e.pointerId);
    if (!d || d.moved || !d.node) return;
    const n = d.node;
    if (n.type === "rule") {
      focus = n.id;
      render();
    } else if (n.type === "category") {
      category = category === n.label ? "all" : n.label;
      render();
    } else {
      try {
        await request("select", {
          keys: n.data.ruleIds.map((id) => M.key(n.data.scope, id)),
        });
      } catch (_) {}
    }
  });
  canvas.addEventListener("pointercancel", () => {
    drag = null;
  });
  canvas.addEventListener("pointerleave", () => {
    hover = null;
    animate();
  });
  canvas.addEventListener(
    "wheel",
    (e) => {
      e.preventDefault();
      const p = point(e);
      zoom(Math.exp(-e.deltaY * 0.001), p.x, p.y);
    },
    { passive: false },
  );
  canvas.addEventListener("keydown", (e) => {
    if (e.key === "+" || e.key === "=") zoom(1.2);
    else if (e.key === "-") zoom(1 / 1.2);
    else if (e.key === "0") fit();
    else if (
      ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)
    ) {
      pan.x += e.key === "ArrowLeft" ? 30 : e.key === "ArrowRight" ? -30 : 0;
      pan.y += e.key === "ArrowUp" ? 30 : e.key === "ArrowDown" ? -30 : 0;
      animate();
    } else return;
    e.preventDefault();
  });
  new ResizeObserver(() => {
    const r = canvas.getBoundingClientRect();
    width = r.width;
    height = r.height;
    canvas.width = Math.round(width * (devicePixelRatio || 1));
    canvas.height = Math.round(height * (devicePixelRatio || 1));
    if (didFit) fit();
    else animate();
  }).observe(canvas);
  new MutationObserver(animate).observe(document.body, {
    attributes: true,
    attributeFilter: ["class", "data-vscode-theme-kind"],
  });
  request("state").catch(() => {});
})();
