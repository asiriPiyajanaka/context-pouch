(() => {
  "use strict";
  const api = acquireVsCodeApi(), V = window.PouchView;
  const app = document.querySelector("#app");
  let state, focus = null, query = "", category = "", tab = "library";
  const remembered = api.getState?.() || {};
  let globalOpen = remembered.globalOpen === true;
  app.innerHTML = `<div class="app"><header class="topbar"><div class="brand">Pouch <span class="muted">/ Rule library</span></div><label class="project-label">Project<select id="project" aria-label="Active project"></select></label><div class="top-actions"><button data-action="import">Import pack</button><button data-action="export">Export pack</button></div></header><div class="toolbar"><nav aria-label="Library views"><button data-tab="library" aria-pressed="true">Library</button><button data-tab="relationships" aria-pressed="false">Relationships</button></nav><button data-action="preview" class="primary">Preview active instructions</button></div><main class="workspace"><section class="library"><div class="filters"><input id="search" type="search" placeholder="Search rules…" aria-label="Search rules"><select id="category" aria-label="Category filter"></select><select id="focused-rule" aria-label="Choose a rule to visualize" hidden></select></div><div class="library-actions"><button data-action="new">+ Project rule</button><button data-action="generate">Generate rules</button><button data-action="save-defaults">Save selection as defaults</button><button data-action="restore-defaults">Restore defaults</button></div><div class="rules-content"></div><section class="presets"><div class="section-heading"><h2>Task presets</h2><button data-action="new-preset">Save preset</button></div><div id="preset-list"></div></section><details class="sharing"><summary>Share project rules</summary><p class="muted">Your local library is saved automatically. Import and export the repository file when you want to share changes.</p><button data-action="import-shared">Import .context-pouch/rules.json</button><button data-action="export-shared">Export .context-pouch/rules.json</button></details></section><aside class="inspector" aria-label="Rule details"></aside></main><footer class="statusbar"><span id="summary">Loading your library…</span><button data-action="clear">Clear selection</button><span class="message" role="status"></span></footer><dialog id="editor-dialog"></dialog></div>`;
  const modal = app.querySelector("dialog");
  function status(message = "", error = false) {
    const el = app.querySelector(".message"); el.textContent=message; el.classList.toggle("error",error); el.title=message;
  }
  const rpc = window.createPouchClient(api, next=>{
    if (state?.project !== next.project) {focus=null; query=""; category=""; app.querySelector("#search").value="";}
    state=next; render();
  },message=>status(message,true));
  async function request(action,data={}) {
    try {return await rpc(action,{revision:state?.revision,...data});}
    catch(e){status(e.message,true);rpc("state").catch(()=>{});throw e;}
  }
  const dialogs=window.createPouchDialogs({modal,getState:()=>state,request,status});
  function render() {
    if(focus && !state.rules.some(r=>r.key===focus))focus=null;
    const projects=app.querySelector("#project");
    projects.innerHTML=state.projects.map(p=>`<option value="${V.esc(p.id)}">${V.esc(p.name)}</option>`).join("") || '<option value="">No project open</option>';
    projects.value=state.project; projects.disabled=state.projects.length<2;
    const categories=app.querySelector("#category");
    categories.innerHTML='<option value="">All categories</option>'+[...new Set(state.rules.map(r=>r.category))].sort().map(c=>`<option>${V.esc(c)}</option>`).join("");
    categories.value=category;
    const picker=app.querySelector("#focused-rule");
    picker.innerHTML='<option value="">Choose a rule…</option>'+state.rules.map(r=>`<option value="${V.esc(r.key)}">${V.esc(r.title)} · ${r.scope==="personal"?"Global":"Project"}</option>`).join("");
    picker.value=focus || ""; picker.hidden=tab!=="relationships";
    app.querySelector("#search").hidden=tab!=="library"; categories.hidden=tab!=="library";
    app.querySelectorAll("[data-tab]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.tab===tab)));
    app.querySelector(".rules-content").innerHTML=tab === "library" ? V.list(state,focus,query,category,globalOpen) : V.relationships(state,focus);
    const details=app.querySelector(".global-section");
    if(details)details.addEventListener("toggle",()=>{globalOpen=details.open;api.setState?.({globalOpen});});
    app.querySelector(".inspector").innerHTML=V.inspector(state,focus);
    app.querySelector("#summary").textContent=`${state.selected.length} active instructions${state.activeConflicts.length?` · ${state.activeConflicts.length} confirmed conflicts`:""}`;
    const writable=state.scopes.some(s=>s.id==="project" && s.writable);
    for(const action of ["new","generate","save-defaults","import-shared","export-shared"])
      app.querySelectorAll(`[data-action="${action}"]`).forEach(b=>b.disabled=!writable);
    app.querySelector("#preset-list").innerHTML=state.presets.map(p=>`<div class="preset-row"><button data-preset="${V.esc(p.key)}">${V.esc(p.title)} <span class="muted">${p.scope==="personal"?"Global":"Project"} · ${p.ruleIds.length}</span></button><button data-edit-preset="${V.esc(p.key)}" aria-label="Edit ${V.esc(p.title)}">Edit</button></div>`).join("") || '<p class="muted">Save a selection from one library for a recurring task.</p>';
  }
  app.querySelector("#search").addEventListener("input",e=>{query=e.target.value;render();});
  app.querySelector("#category").addEventListener("change",e=>{category=e.target.value;render();});
  app.querySelector("#focused-rule").addEventListener("change",e=>{focus=e.target.value;render();});
  app.querySelector("#project").addEventListener("change",e=>request("project",{id:e.target.value}).catch(()=>{}));
  app.addEventListener("change",e=>{if(e.target.dataset.select)request("toggle",{key:e.target.dataset.select,checked:e.target.checked}).catch(()=>{});});
  app.addEventListener("click",async e=>{
    if(!state)return;
    const target=e.target.closest("button"); if(!target)return;
    try {
      if(target.dataset.tab){tab=target.dataset.tab;render();return;}
      if(target.dataset.rule){focus=target.dataset.rule;render();return;}
      if(target.dataset.source!==undefined){await request("openSource",{key:target.dataset.sourceRule,index:Number(target.dataset.source)});return;}
      if(target.dataset.preset){const p=state.presets.find(p=>p.key===target.dataset.preset);await request("select",{keys:p.ruleIds.map(id=>window.ContextPouchModel.key(p.scope,id))});return;}
      if(target.dataset.editPreset){dialogs.preset(state.presets.find(p=>p.key===target.dataset.editPreset));return;}
      if(target.dataset.removeKind){await request("setRelationship",{kind:target.dataset.removeKind,from:target.dataset.from,to:target.dataset.to,enabled:false});return;}
      const action=target.dataset.action, rule=state.rules.find(r=>r.key===focus);
      if(action==="generate")await request("generate");
      if(action==="new")dialogs.rule();
      if(action==="new-global")dialogs.rule(undefined,"personal");
      if(action==="edit" && rule)dialogs.rule(rule);
      if(action==="unfocus"){focus=null;render();}
      if(action==="new-preset")dialogs.preset();
      if(action==="preview")dialogs.preview();
      if(action==="clear")await request("select",{keys:[]});
      if(action==="save-defaults"){await request("saveDefaults");status("Saved defaults for this project.");}
      if(action==="restore-defaults")await request("restoreDefaults");
      if(action==="default" && rule)await request("setDefault",{key:rule.key,enabled:!(rule.scope==="personal" ? rule.globalDefault : rule.isDefault)});
      if(action==="disable-global" && rule)await request("disableGlobal",{key:rule.key,disabled:!rule.disabledHere});
      if(action==="toggle-focused" && rule)await request("toggle",{key:rule.key});
      if(action==="override" && rule)dialogs.relationship("override",rule);
      if(action==="conflict" && rule)dialogs.relationship("conflict",rule);
      if(action==="relationships"){tab="relationships";render();}
      if(action==="import" || action==="export")dialogs.pack(action);
      if(action==="import-shared")await request("import",{scope:"project",shared:true});
      if(action==="export-shared")await request("export",{scope:"project",shared:true});
    }catch(_){}
  });
  rpc("state").catch(e=>status(e.message,true));
})();
