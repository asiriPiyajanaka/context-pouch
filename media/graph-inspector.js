(() => {
  "use strict";
  window.renderGraphInspector=(node,data,state)=>{
    const V=window.PouchView,esc=V.esc;
    if(!node)return '<div class="empty"><h2>Inspect a graph node</h2><p>Click a node or choose a rule from the graph picker. Inspecting never changes your prompt selection.</p></div>';
    if(node.current)return V.inspector(state,node.localKey,true);
    const project=data.projects.find(p=>p.id===node.project);
    return `<span class="eyebrow">Saved project · Read-only preview</span><h2>${esc(node.title)}</h2><p class="muted">${esc(node.projectName)}</p><p class="graph-project-path">${esc(node.project)}</p><span class="badge">${esc(node.category)}</span><p class="rule-body">${esc(node.text)}</p>${node.appliesTo&&node.appliesTo!=="."?`<p>Applies within ${esc(node.appliesTo)}/</p>`:""}<p class="notice">This rule belongs to another project. Switch to that project before selecting or editing it.</p><button data-open-graph-project="${esc(node.project)}">${project?.open?"Switch to this project":"Open project in new window"}</button>${node.sources?.length?`<h3>Sources</h3>${node.sources.map(s=>`<p class="muted">${esc(s.path)}:${s.line}</p>`).join("")}`:""}`;
  };
})();
