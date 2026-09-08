(() => {
  "use strict";
  const esc=s=>window.PouchView.esc(s);
  function palette(id) {
    let hash=0;for(const c of id)hash=(hash*31+c.charCodeAt(0))>>>0;
    return id==="@global"?"graph-global":`graph-palette-${hash%8}`;
  }
  function bounds(nodes,positions) {
    if(!nodes.length)return {x:-300,y:-200,width:600,height:400};
    const points=nodes.map(n=>positions.get(n.graphId));
    const x=Math.min(...points.map(p=>p.x))-140,y=Math.min(...points.map(p=>p.y))-120;
    return {x,y,width:Math.max(300,Math.max(...points.map(p=>p.x))+140-x),height:Math.max(240,Math.max(...points.map(p=>p.y))+130-y)};
  }
  function render(data,positions,activeProject,focus) {
    const groups=[...new Set(data.nodes.map(n=>n.project))].map(project=>{
      const members=data.nodes.filter(n=>n.project===project),points=members.map(n=>positions.get(n.graphId));
      const x=points.reduce((s,p)=>s+p.x,0)/points.length,y=points.reduce((s,p)=>s+p.y,0)/points.length;
      const rx=Math.max(125,...points.map(p=>Math.abs(p.x-x)+90)),ry=Math.max(100,...points.map(p=>Math.abs(p.y-y)+85));
      const label=members[0].projectName+(project===activeProject?" · Active":project==="@global"?" · Global":"");
      return `<g class="network-cluster ${palette(project)} ${project===activeProject?"is-active":""}"><ellipse cx="${x}" cy="${y}" rx="${rx}" ry="${ry}"/><text x="${x}" y="${y-ry+16}" text-anchor="middle">${esc(label)}<title>${esc(project)}</title></text></g>`;
    }).join("");
    const duplicates=new Map();
    const edges=data.edges.map(e=>{
      const a=positions.get(e.from),b=positions.get(e.to);if(!a||!b)return "";
      const dx=b.x-a.x,dy=b.y-a.y,d=Math.hypot(dx,dy)||1;
      const pair=JSON.stringify([e.from,e.to].sort()),parallel=duplicates.get(pair)||0;duplicates.set(pair,parallel+1);
      const x1=a.x+dx/d*16,y1=a.y+dy/d*16,x2=b.x-dx/d*19,y2=b.y-dy/d*19;
      const cx=(x1+x2)/2-dy/d*parallel*35,cy=(y1+y2)/2+dx/d*parallel*35;
      const label=e.kind==="override"?"Overrides":e.kind==="conflict"?"Conflicts with":"Related";
      const owner=e.project?` · ${e.projectName||e.project}${e.project===activeProject?" (active)":""}`:"";
      const focused=focus===e.from||focus===e.to;
      return `<g class="graph-edge ${e.kind} ${focused?"edge-focused":""}"><title>${esc(label+owner)}</title><path d="M ${x1} ${y1} Q ${cx} ${cy} ${x2} ${y2}" ${e.kind==="override"?'marker-end="url(#override-arrow)"':""}/><text x="${(x1+2*cx+x2)/4}" y="${(y1+2*cy+y2)/4-8}" text-anchor="middle">${esc(label+owner)}</text></g>`;
    }).join("");
    const nodes=data.nodes.map(n=>{
      const p=positions.get(n.graphId),global=n.project==="@global";
      const state=n.disabledHere?"Disabled here":n.overriddenHere?"Overridden here":n.selected?"Selected":n.current?"Not selected":"Other project";
      const shape=global?'<polygon points="0,-18 18,0 0,18 -18,0"/>':'<circle r="14"/>';
      const title=n.title.length>32?n.title.slice(0,31)+"…":n.title;
      return `<g data-graph-node="${esc(n.graphId)}" class="graph-node network-node ${palette(n.project)} ${n.selected?"is-selected":""} ${n.disabledHere||n.overriddenHere?"is-muted":""} ${focus===n.graphId?"is-focused":""}" transform="translate(${p.x} ${p.y})" tabindex="0" role="button" aria-label="Inspect ${esc(n.title)} · ${esc(n.projectName)} · ${state}"><title>${esc(n.title)} · ${esc(n.projectName)}\n${esc(n.text)}\n${state}</title>${shape}${n.selected?'<text class="network-check" y="4" text-anchor="middle">✓</text>':""}<text class="graph-node-title" y="36" text-anchor="middle">${esc(title)}</text><text class="graph-node-state" y="52" text-anchor="middle">${esc(n.category)}${n.isDefault?" · Default":""}</text></g>`;
    }).join("");
    return `<defs><marker id="override-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z"/></marker></defs>${groups}${edges}${nodes}`;
  }
  window.PouchGraphRenderer={render,bounds,palette};
})();
