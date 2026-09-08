"use strict";
const M = require("./model");
const graphId = (library, id) => JSON.stringify([library, id]);
function graphSnapshot(store, active, openProjects) {
  const projects = store.projects().map(p => ({
    id:p.uri, name:openProjects.find(r=>r.id===p.uri)?.name || p.name,
    open:openProjects.some(r=>r.id===p.uri), active:p.uri===active.project,
  }));
  const nodes = [], edges = [], seen = new Set();
  const activeRules = new Map(active.rules.map(r=>[r.key,r]));
  const libraries = [{id:"@global",name:"Global rules"}, ...projects];
  const edge = (from,to,kind,project="") => {
    const pair = kind==="override" ? [from,to] : [from,to].sort();
    const id = JSON.stringify([kind,project,...pair]);
    if(seen.has(id))return;
    seen.add(id); edges.push({id,from,to,kind,project});
  };
  for(const library of libraries) {
    const scope=library.id==="@global" ? "personal" : "project";
    const pack=store.read(library.id);
    for(const r of pack.rules) {
      const localKey=M.key(scope,r.id);
      const current=scope==="personal" || library.id===active.project ? activeRules.get(localKey) : null;
      nodes.push({...r, graphId:graphId(library.id,r.id), project:library.id,
        projectName:library.name, scope, localKey,
        selected:!!current && active.selected.includes(localKey),
        isDefault:!!current?.isDefault, disabledHere:!!current?.disabledHere,
        overriddenHere:!!current?.overriddenBy, current:!!current});
      for(const related of r.related)edge(graphId(library.id,r.id),graphId(library.id,related),"related");
    }
    if(scope==="project") {
      const prefs=store.preferences(library.id);
      const convert = key => {
        const [type,id]=JSON.parse(key);
        return graphId(type==="personal" ? "@global" : library.id,id);
      };
      for(const [from,to] of prefs.overrides || [])edge(convert(from),convert(to),"override",library.id);
      for(const [from,to] of prefs.conflicts || [])edge(convert(from),convert(to),"conflict",library.id);
    }
  }
  const ids=new Set(nodes.map(n=>n.graphId));
  return {activeProject:active.project,revision:active.revision,projects,nodes,
    edges:edges.filter(e=>ids.has(e.from) && ids.has(e.to)).map(e=>({...e,projectName:projects.find(p=>p.id===e.project)?.name || ""}))};
}
module.exports={graphSnapshot,graphId};
