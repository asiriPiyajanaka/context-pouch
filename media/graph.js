(() => {
  "use strict";
  const api = acquireVsCodeApi(), V = window.PouchView;
  const app = document.querySelector("#app");
  let state, focus = null, query = "", category = "", tab = "library";
  const remembered = api.getState?.() || {};
  let globalOpen = remembered.globalOpen === true;
  let graphData = null, graphRevision = null, graphRequest = 0;
  const layout = window.createPouchLibraryLayout({app});
  let selectedOnly = false;
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
  const graph=window.createPouchGraph({container:app.querySelector(".graph-container"),onInspect:node=>{
    focus=node?.current ? node.localKey : null;
    app.querySelector(".inspector").innerHTML=window.renderGraphInspector(node,graphData,state);
  }});
  async function refreshGraph() {
    const sequence=++graphRequest;
    try {
      const result=await rpc("graphState");
      if(sequence!==graphRequest)return;
      if(result.graph.activeProject!==state.project)return;
      graphData=result.graph;graphRevision=result.graph.revision;graph.setData(graphData);
      if(tab==="relationships"){
        if(!graph.selected() && focus){const node=graphData.nodes.find(n=>n.current&&n.localKey===focus);if(node)graph.focus(node.graphId);}
        const node=graph.selected();if(node)focus=node.current?node.localKey:null;
        app.querySelector(".inspector").innerHTML=window.renderGraphInspector(node,graphData,state);
      }
    } catch(e){status(e.message,true);}
  }
  function render() {
    const active = document.activeElement;
    const focusSelection = active?.dataset.select;
    const focusRule = active?.dataset.rule;
    if(focus && !state.rules.some(r=>r.key===focus))focus=null;
    const projects=app.querySelector("#project");
    projects.innerHTML=state.projects.map(p=>`<option value="${V.esc(p.id)}">${V.esc(p.name)}</option>`).join("") || '<option value="">No project open</option>';
    projects.value=state.project; projects.disabled=state.projects.length<2;
    const categories=app.querySelector("#category");
    categories.innerHTML='<option value="">All categories</option>'+[...new Set(state.rules.map(r=>r.category))].sort().map(c=>`<option>${V.esc(c)}</option>`).join("");
    categories.value=category;
    app.querySelector("#focused-rule").hidden=true;
    app.querySelector(".filters").hidden=tab!=="library";
    app.querySelector(".library-actions").hidden=tab!=="library";
    app.querySelector(".presets").hidden=tab!=="presets";
    app.querySelector(".rules-content").hidden=tab!=="library";
    app.querySelector(".graph-container").hidden=tab!=="relationships";
    app.querySelectorAll("[data-tab]").forEach(b=>b.setAttribute("aria-pressed",String(b.dataset.tab===tab)));
    app.querySelector(".rules-content").innerHTML=V.list(state,focus,query,category,globalOpen,selectedOnly);
    if(tab==="relationships"){
      if(graphRevision!==state.revision)refreshGraph();
      else graph.reveal();
    }
    const details=app.querySelector(".global-section");
    if(details)details.addEventListener("toggle",()=>{if(!query && !category && !selectedOnly){globalOpen=details.open;api.setState?.({globalOpen});}});
    app.querySelector(".inspector").innerHTML=tab==="relationships" && graphData ? window.renderGraphInspector(graph.selected(),graphData,state) : V.inspector(state,focus);
    app.querySelector("#summary").textContent=`${state.selected.length} active instructions${state.activeConflicts.length?` · ${state.activeConflicts.length} confirmed conflicts`:""}`;
    const writable=state.scopes.some(s=>s.id==="project" && s.writable);
    for(const action of ["new","generate","save-defaults","import-shared","export-shared"])
      app.querySelectorAll(`[data-action="${action}"]`).forEach(b=>b.disabled=!writable);
    app.querySelector("#preset-list").innerHTML=state.presets.map(p=>`<div class="preset-row"><div><strong>${V.esc(p.title)}</strong><small>${p.scope==="personal"?"Global":"Project"} · ${p.ruleIds.length} rules</small></div><button data-preset="${V.esc(p.key)}" aria-label="Apply ${V.esc(p.title)}">Apply</button><button data-edit-preset="${V.esc(p.key)}" aria-label="Edit ${V.esc(p.title)}">Edit</button></div>`).join("") || '<div class="empty"><h2>No presets yet</h2><p>Select rules in Rules, then save that selection for a recurring task.</p></div>';
    layout.update(state,tab,focus,query,category,selectedOnly);
    if (focusSelection) [...app.querySelectorAll('[data-select]')].find(el=>el.dataset.select===focusSelection)?.focus({preventScroll:true});
    else if (focusRule) [...app.querySelectorAll('[data-rule]')].find(el=>el.dataset.rule===focusRule)?.focus({preventScroll:true});
  }
  app.querySelector("#selected-only").addEventListener("change",e=>{selectedOnly=e.target.checked;render();});
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
      if(target.dataset.rule){focus=target.dataset.rule;if(tab==="relationships"&&graphData){const node=graphData.nodes.find(n=>n.current&&n.localKey===focus);if(node)graph.focus(node.graphId);}render();layout.focusDetails();return;}
      if(target.dataset.openGraphProject){await request("activateGraphProject",{project:target.dataset.openGraphProject});return;}
      if(target.dataset.source!==undefined){await request("openSource",{key:target.dataset.sourceRule,index:Number(target.dataset.source)});return;}
      if(target.dataset.preset){const p=state.presets.find(p=>p.key===target.dataset.preset);dialogs.applyPreset(p);return;}
      if(target.dataset.editPreset){dialogs.preset(state.presets.find(p=>p.key===target.dataset.editPreset));return;}
      if(target.dataset.removeKind){await request("setRelationship",{kind:target.dataset.removeKind,from:target.dataset.from,to:target.dataset.to,enabled:false});return;}
      const action=target.dataset.action, rule=state.rules.find(r=>r.key===focus);
      if(action==="generate")await request("generate");
      if(action==="new")dialogs.rule();
      if(action==="new-global")dialogs.rule(undefined,"personal");
      if(action==="edit" && rule)dialogs.rule(rule);
      if(action==="unfocus"){const previous=focus;focus=null;graph.focus(null);render();[...app.querySelectorAll("[data-rule]")].find(el=>el.dataset.rule===previous)?.focus();}
      if(action==="new-preset")dialogs.preset();
      if(action==="preview")dialogs.preview();
      if(action==="clear")await request("select",{keys:[]});
      if(action==="save-defaults")dialogs.defaults();
      if(action==="reset-filters"){query="";category="";selectedOnly=false;app.querySelector("#search").value="";app.querySelector("#selected-only").checked=false;render();}
      if(action==="restore-defaults")await request("restoreDefaults");
      if(action==="default" && rule)await request("setDefault",{key:rule.key,enabled:!(rule.scope==="personal" ? rule.globalDefault : rule.isDefault)});
      if(action==="disable-global" && rule)await request("disableGlobal",{key:rule.key,disabled:!rule.disabledHere});
      if(action==="toggle-focused" && rule)await request("toggle",{key:rule.key});
      if(action==="override" && rule)dialogs.relationship("override",rule);
      if(action==="conflict" && rule)dialogs.relationship("conflict",rule);
      if(action==="relationships"){
        tab="relationships";render();
        await refreshGraph();
        const node=graphData?.nodes.find(n=>n.current&&n.localKey===focus);
        if(node)graph.focus(node.graphId,"focused");
      }
      if(action==="import" || action==="export")dialogs.pack(action);
      if(action==="import-shared")await request("import",{scope:"project",shared:true});
      if(action==="export-shared")await request("export",{scope:"project",shared:true});
    }catch(_){}
  });
  function focusRequested(target) {
    if (!target?.key || target.project !== state?.project) return;
    if (!state.rules.some(r => r.key === target.key)) return;
    tab = "library"; focus = target.key; globalOpen = true; query = ""; category = "";
    app.querySelector("#search").value = "";
    render();
    app.querySelector(".inspector").setAttribute("tabindex", "-1");
    app.querySelector(".inspector").focus();
  }
  window.addEventListener("message", ({data}) => {
    if (data?.channel === "context-pouch" && data.event === "focusRule") focusRequested(data);
  });
  rpc("state").then(() => rpc("libraryFocus")).then(focusRequested).catch(e=>status(e.message,true));
})();
