/* Graph filtering and stable grouped layout, shared with Node tests. */
((root,factory)=>{
  if(typeof module==="object" && module.exports)module.exports=factory();
  else root.PouchGraphModel=factory();
})(typeof globalThis!=="undefined"?globalThis:this,()=>{
  "use strict";
  function visible(data,filters) {
    const kinds=new Set(filters.kinds || ["override","related","conflict"]);
    const projects=new Set(filters.projects ?? data.projects.map(p=>p.id));
    const focusedProject=data.nodes.find(n=>n.graphId===filters.focus)?.project;
    const selectedProjects=filters.mode==="all" ? projects : new Set([filters.mode==="focused" && focusedProject && focusedProject!=="@global" ? focusedProject : data.activeProject]);
    const edges=data.edges.filter(e=>kinds.has(e.kind) && (!e.project || selectedProjects.has(e.project)));
    let candidates=data.nodes.filter(n=>selectedProjects.has(n.project));
    const candidatesIds=new Set(candidates.map(n=>n.graphId));
    const linkedGlobals=new Set(edges.flatMap(e=>candidatesIds.has(e.from)?[e.to]:candidatesIds.has(e.to)?[e.from]:[]));
    const globals=data.nodes.filter(n=>n.project==="@global" && (filters.globals || linkedGlobals.has(n.graphId)));
    candidates=[...candidates,...globals];
    if(filters.mode==="focused") {
      const neighbors=new Set([filters.focus]);
      for(const e of edges)if(e.from===filters.focus || e.to===filters.focus){neighbors.add(e.from);neighbors.add(e.to);}
      // A focused foreign rule is inspectable without changing the active project.
      candidates=data.nodes.filter(n=>neighbors.has(n.graphId));
    }
    const categories=filters.categories===null || filters.categories===undefined ? null : new Set(filters.categories);
    const query=(filters.search || "").toLowerCase().trim();
    const nodes=candidates.filter(n=>(!categories || categories.has(n.category)) && `${n.title} ${n.text}`.toLowerCase().includes(query));
    const ids=new Set(nodes.map(n=>n.graphId));
    return {nodes,edges:edges.filter(e=>ids.has(e.from)&&ids.has(e.to))};
  }
  function layout(data,positions=new Map()) {
    const groups=[...new Set(data.nodes.map(n=>n.project))].sort();
    const fixed=new Set(positions.keys()),anchors=new Map();
    const spacing=Math.max(400,Math.sqrt(data.nodes.length)*85);
    for(const [index,id] of groups.entries()) {
      const saved=data.nodes.filter(n=>n.project===id&&positions.has(n.graphId)).map(n=>positions.get(n.graphId));
      const angle=index*2.399963;
      anchors.set(id,saved.length?{x:saved.reduce((v,p)=>v+p.x,0)/saved.length,y:saved.reduce((v,p)=>v+p.y,0)/saved.length}:{x:Math.cos(angle)*spacing*Math.sqrt(index),y:Math.sin(angle)*spacing*Math.sqrt(index)});
    }
    const indices=new Map();
    for(const node of data.nodes) {
      const index=indices.get(node.project)||0;indices.set(node.project,index+1);
      if(positions.has(node.graphId))continue;
      const anchor=anchors.get(node.project),angle=index*2.399963,radius=100*Math.sqrt(index+1);
      positions.set(node.graphId,{x:anchor.x+Math.cos(angle)*radius,y:anchor.y+Math.sin(angle)*radius});
    }
    // Local repulsion, spring links and weak project gravity produce a network,
    // with existing positions pinned so selection updates never shuffle the view.
    const ids=new Set(data.nodes.map(n=>n.graphId));
    const links=data.edges.filter(e=>ids.has(e.from)&&ids.has(e.to));
    const movable=data.nodes.filter(n=>!fixed.has(n.graphId));
    for(let iteration=0;iteration<100 && movable.length;iteration++) {
      const cells=new Map(),forces=new Map();
      for(const n of data.nodes) {
        const p=positions.get(n.graphId),key=`${Math.floor(p.x/160)},${Math.floor(p.y/160)}`;
        if(!cells.has(key))cells.set(key,[]);cells.get(key).push(n.graphId);
        forces.set(n.graphId,{x:0,y:0});
      }
      for(const n of movable) {
        const p=positions.get(n.graphId),f=forces.get(n.graphId),anchor=anchors.get(n.project);
        f.x+=(anchor.x-p.x)*.012;f.y+=(anchor.y-p.y)*.012;
        const cx=Math.floor(p.x/160),cy=Math.floor(p.y/160);
        for(let x=cx-1;x<=cx+1;x++)for(let y=cy-1;y<=cy+1;y++)for(const id of cells.get(`${x},${y}`)||[]) {
          if(id===n.graphId)continue;
          const q=positions.get(id),dx=p.x-q.x||.01,dy=p.y-q.y||.01,d=Math.hypot(dx,dy);
          if(d<180){const push=(180-d)*.14;f.x+=dx/d*push;f.y+=dy/d*push;}
        }
      }
      for(const edge of links) {
        const a=positions.get(edge.from),b=positions.get(edge.to),dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
        const force=(d-190)*.015;
        forces.get(edge.from).x+=dx/d*force;forces.get(edge.from).y+=dy/d*force;
        forces.get(edge.to).x-=dx/d*force;forces.get(edge.to).y-=dy/d*force;
      }
      const cooling=1-iteration/110;
      for(const n of movable) {
        const p=positions.get(n.graphId),f=forces.get(n.graphId);
        positions.set(n.graphId,{x:p.x+Math.max(-15,Math.min(15,f.x))*cooling,y:p.y+Math.max(-15,Math.min(15,f.y))*cooling});
      }
    }
    return {positions};
  }
  return {visible,layout};
});
