(() => {
  "use strict";
  const esc = s => String(s ?? "").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"})[c]);
  const button = (action,label,extra="") => `<button data-action="${action}" ${extra}>${label}</button>`;
  function badges(rule, state) {
    const active = state.selected.includes(rule.key);
    return `<span class="badge ${active ? "active" : ""}">${active ? "Selected" : "Not selected"}</span>${rule.isDefault ? '<span class="badge">Default</span>' : ""}${rule.disabledHere ? '<span class="badge muted">Disabled here</span>' : ""}${rule.overriddenBy ? '<span class="badge muted">Overridden here</span>' : ""}`;
  }
  function ruleRow(rule, state, focus) {
    const blocked = rule.disabledHere || rule.overriddenBy;
    return `<article class="rule-row ${focus === rule.key ? "focused" : ""}"><input type="checkbox" data-select="${esc(rule.key)}" aria-label="Select ${esc(rule.title)}" ${state.wanted.includes(rule.key) ? "checked" : ""} ${blocked ? "disabled" : ""}><button class="rule-link" data-rule="${esc(rule.key)}"><strong>${esc(rule.title)}</strong><span class="muted">${esc(rule.category)}${rule.appliesTo && rule.appliesTo !== "." ? ` · ${esc(rule.appliesTo)}/` : ""}</span><span class="badges">${badges(rule,state)}</span></button></article>`;
  }
  function list(state, focus, query, category, globalOpen) {
    const matches = r => (!category || r.category === category) && `${r.title} ${r.text} ${r.category}`.toLowerCase().includes(query.toLowerCase());
    const project = state.rules.filter(r=>r.scope === "project" && matches(r));
    const global = state.rules.filter(r=>r.scope === "personal" && matches(r));
    const projectName = state.projects.find(p=>p.id === state.project)?.name || "No project open";
    return `<section><div class="section-heading"><div><h2>${esc(projectName)}</h2><p class="muted">Project rules take priority through explicit overrides.</p></div><span class="count">${project.length} rules</span></div>${project.map(r=>ruleRow(r,state,focus)).join("") || `<div class="empty"><h3>${state.project ? "Build this project's rule set" : "Open a project folder"}</h3><p>${query || category ? "No rules match your filters." : "Add a rule or generate suggestions from project documents."}</p>${state.project ? button("generate","Generate rules from project") : ""}</div>`}</section><details class="global-section" ${globalOpen ? "open" : ""}><summary>Global rules <span class="count">${state.selected.filter(k=>state.rules.some(r=>r.key===k && r.scope === "personal")).length} active · ${global.length} shown</span></summary><p class="muted">Available in every project. Disable or override a rule here without changing other projects.</p>${global.map(r=>ruleRow(r,state,focus)).join("") || '<p class="empty">No matching global rules.</p>'}${button("new-global","+ Global rule")}</details>`;
  }
  function links(state, rule) {
    const edges = [];
    for (const [from,to] of state.overrides) {
      if (from===rule.key || to===rule.key) edges.push({from,to,label:"Overrides",kind:"override"});
    }
    for (const [from,to] of state.conflicts) {
      if (from===rule.key || to===rule.key) edges.push({from,to,label:"Conflicts with · confirmed",kind:"conflict"});
    }
    for (const other of state.rules) {
      if (other.key === rule.key || other.scope !== rule.scope) continue;
      if (rule.related.includes(other.id) || other.related.includes(rule.id))
        edges.push({from:rule.key,to:other.key,label:"Related to",kind:"related"});
    }
    return edges;
  }
  function relationships(state, focus) {
    const rule = state.rules.find(r=>r.key===focus);
    if (!rule) return '<div class="empty"><h2>Explore one rule at a time</h2><p>Choose a rule above to see its overrides, confirmed conflicts, and related rules.</p></div>';
    const edges = links(state,rule);
    return `<section class="relationships"><div class="section-heading"><div><h2>Relationships</h2><p class="muted">Connections involving ${esc(rule.title)}.</p></div></div><div class="focus-card"><span class="eyebrow">${rule.scope === "project" ? "Project rule" : "Global rule"}</span><h2>${esc(rule.title)}</h2><div class="badges">${badges(rule,state)}</div></div>${edges.map(edge=>{
      const from = state.rules.find(r=>r.key===edge.from), to = state.rules.find(r=>r.key===edge.to);
      return `<div class="relationship-row ${edge.kind}"><button data-rule="${esc(from.key)}">${esc(from.title)}</button><span class="edge-label">${edge.kind === "override" ? "→" : "↔"} ${edge.label}</span><button data-rule="${esc(to.key)}">${esc(to.title)}</button></div>`;
    }).join("") || '<div class="empty">No connections yet. Add an override or confirmed conflict from rule details, or edit related rules.</div>'}</section>`;
  }
  function inspector(state, focus, graph = false) {
    const r = state.rules.find(r=>r.key===focus);
    if (!r) return `<div class="empty"><h2>Your active instructions</h2><p>Select a rule to read it, set defaults, or manage relationships.</p><strong>${state.selected.length} selected</strong><p>Preview shows the exact instructions that Pouch will insert.</p>${button("preview","Preview active instructions")}</div>`;
    const selection = graph ? `<label class="graph-selection"><input type="checkbox" data-select="${esc(r.key)}" ${state.wanted.includes(r.key)?"checked":""} ${r.disabledHere||r.overriddenBy?"disabled":""}>Use in prompt</label>` : button("toggle-focused",state.wanted.includes(r.key) ? "Deselect" : "Select for task",r.disabledHere || r.overriddenBy ? "disabled" : "");
    const writable = state.scopes.find(s=>s.id===r.scope)?.writable;
    const override = state.rules.find(x=>x.key===r.overriddenBy);
    return `<div class="section-heading"><span class="eyebrow">${r.scope === "project" ? "Project rule" : "Global rule"}</span>${button("unfocus","×",'aria-label="Close rule details"')}</div><h2>${esc(r.title)}</h2><div class="badges">${badges(r,state)}</div><p class="rule-body">${esc(r.text)}</p>${r.appliesTo && r.appliesTo !== "." ? `<p class="muted">Applies only within <strong>${esc(r.appliesTo)}/</strong>.</p>` : ""}${override ? `<p class="notice">Replaced by <button data-rule="${esc(override.key)}">${esc(override.title)}</button> while that project rule is selected.</p>` : ""}<div class="inspector-actions">${selection}${button("edit","Edit",writable ? "" : "disabled")}${button("default",r.scope === "personal" ? (r.globalDefault ? "Remove global default" : "Make global default") : (r.isDefault ? "Remove default" : "Make default"),writable ? "" : "disabled")}${r.scope === "personal" && state.project ? button("disable-global",r.disabledHere ? "Enable for this project" : "Disable for this project") : ""}</div><p class="muted">${r.scope === "personal" ? "Global defaults apply across projects unless disabled or overridden here." : "Defaults belong to this project."} Use Restore defaults to apply them to the current selection.</p>${r.sources?.length ? `<h3>Sources</h3><div class="source-list">${r.sources.map((s,i)=>r.scope === "project" ? `<button data-source="${i}" data-source-rule="${esc(r.key)}">${esc(s.path)}:${s.line}</button>` : `<span>${esc(s.path)}:${s.line}</span>`).join("")}</div>` : ""}<h3>Relationships</h3>${links(state,r).map(e=>{
      const other = state.rules.find(x=>x.key===(e.from===r.key ? e.to : e.from));
      return `<div class="connection"><button data-rule="${esc(other.key)}">${esc(other.title)}</button><span class="muted">${e.label}</span>${e.kind !== "related" ? `<button data-remove-kind="${e.kind}" data-from="${esc(e.from)}" data-to="${esc(e.to)}" aria-label="Remove relationship">×</button>` : ""}</div>`;
    }).join("") || '<p class="muted">No relationships.</p>'}<div class="inspector-actions">${state.project ? `${r.scope === "project" ? button("override","Override a global rule") : ""}${button("conflict","Mark a conflict")}` : ""}${button("relationships","View relationships")}</div><h3>Used in presets</h3>${state.presets.filter(p=>p.scope===r.scope && p.ruleIds.includes(r.id)).map(p=>`<button data-preset="${esc(p.key)}">${esc(p.title)}</button>`).join("") || '<p class="muted">No preset memberships.</p>'}`;
  }
  window.PouchView = {esc, list, relationships, inspector};
})();
