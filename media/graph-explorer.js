(() => {
  "use strict";
  window.createPouchGraph = ({container,onInspect}) => {
    const M=window.PouchGraphModel,R=window.PouchGraphRenderer,esc=window.PouchView.esc;
    let data=null,focus=null,visible={nodes:[],edges:[]},drag=null,didFit=false;
    const positions=new Map();
    let camera={x:0,y:0,width:900,height:600};
    const filters={mode:"project",projects:null,globals:false,categories:null,kinds:["override","related","conflict"],search:""};
    container.innerHTML=`<div class="graph-toolbar"><label>View<select data-graph-mode aria-label="Graph view"><option value="project">Project overview</option><option value="focused">Focused rule</option><option value="all">All rules</option></select></label><label class="graph-picker-label">Inspect rule<select data-graph-picker aria-label="Inspect a graph rule"></select></label><div class="graph-zoom"><button data-graph-action="out" aria-label="Zoom out">−</button><button data-graph-action="in" aria-label="Zoom in">+</button><button data-graph-action="fit">Fit</button></div></div><details class="graph-filters"><summary>Filters <span data-filter-count></span></summary><div class="graph-filter-fields"><fieldset><legend>Projects · All rules mode</legend><div><button data-graph-action="all-projects">All projects</button><button data-graph-action="current-project">Current project</button></div><select data-graph-projects multiple size="4" aria-label="Filter graph projects"></select></fieldset><fieldset><legend>Rules</legend><label><input type="checkbox" data-graph-globals>Show all global rules</label><small>Connected global rules remain visible.</small><label>Categories<select data-graph-categories multiple size="4" aria-label="Filter graph categories"></select></label></fieldset><fieldset><legend>Connections</legend><label><input type="checkbox" data-graph-kind="override" checked>Overrides →</label><label><input type="checkbox" data-graph-kind="related" checked>Related —</label><label><input type="checkbox" data-graph-kind="conflict" checked>Conflicts ╌</label></fieldset><label>Search<input type="search" data-graph-search placeholder="Title or instructions…" aria-label="Search graph rules"></label></div><button data-graph-action="reset">Reset filters</button></details><p class="graph-legend"><span>● Project rules</span><span>◆ Global rules</span><span>✓ Selected for active project</span><span>Faded = disabled or overridden here</span></p><div class="graph-stage"><svg xmlns="http://www.w3.org/2000/svg" role="group" aria-label="Interactive rule graph. Drag background to pan, scroll to zoom, or use the rule picker to inspect nodes." tabindex="0"></svg><p class="graph-empty" hidden></p></div><p class="graph-help"><span data-graph-count></span> · Click a node to inspect · Drag nodes to arrange · Scroll to zoom</p>`;
    const svg=container.querySelector("svg");
    const get=selector=>container.querySelector(selector);
    function updateCamera(){svg.setAttribute("viewBox",`${camera.x} ${camera.y} ${camera.width} ${camera.height}`);}
    function fit(){
      const b=R.bounds(visible.nodes,positions),width=svg.clientWidth||900,height=svg.clientHeight||520;
      const ratio=width/height, w=Math.max(b.width,b.height*ratio),h=w/ratio;
      camera={x:b.x-(w-b.width)/2,y:b.y-(h-b.height)/2,width:w,height:h};updateCamera();
    }
    function draw(){
      if(!data)return;
      visible=M.visible(data,{...filters,focus});
      svg.innerHTML=R.render(visible,positions,data.activeProject,focus);updateCamera();
      get("[data-graph-picker]").innerHTML='<option value="">Choose a rule…</option>'+(filters.mode==="focused" && !focus ? data.nodes : visible.nodes).map(n=>`<option value="${esc(n.graphId)}">${esc(n.title)} · ${esc(n.projectName)}</option>`).join("");
      get("[data-graph-picker]").value=focus||"";
      get("[data-graph-count]").textContent=`${visible.nodes.length} / ${data.nodes.length} rules · ${visible.edges.length} connections`;
      get("[data-filter-count]").textContent=`· ${visible.nodes.length} rules shown`;
      const empty=get(".graph-empty");empty.hidden=visible.nodes.length>0;
      empty.textContent=filters.mode==="focused"&&!focus?"Choose a rule in the library or another graph view, then focus on it.":"No matching rules. Reset filters or add rules to a project.";
    }
    function options(){
      const selected=new Set(filters.projects??data.projects.map(p=>p.id));
      get("[data-graph-projects]").innerHTML=data.projects.map(p=>`<option value="${esc(p.id)}" ${selected.has(p.id)?"selected":""}>${esc(p.name)}${p.active?" · active":p.open?"":" · saved"} — ${esc(p.id)}</option>`).join("");
      get("[data-graph-projects]").disabled=filters.mode!=="all";
      const categories=[...new Set(data.nodes.map(n=>n.category))].sort();
      get("[data-graph-categories]").innerHTML=categories.map(c=>`<option value="${esc(c)}" ${filters.categories===null||filters.categories.includes(c)?"selected":""}>${esc(c)}</option>`).join("");
      get("[data-graph-mode]").value=filters.mode;get("[data-graph-globals]").checked=filters.globals;
      get("[data-graph-search]").value=filters.search;
      container.querySelectorAll("[data-graph-kind]").forEach(input=>input.checked=filters.kinds.includes(input.dataset.graphKind));
    }
    function inspect(id,center=false){focus=id;draw();if(center){const p=positions.get(id),ratio=camera.height/camera.width;camera={x:p.x-300,y:p.y-600*ratio/2,width:600,height:600*ratio};updateCamera();}onInspect(data.nodes.find(n=>n.graphId===id));}
    container.addEventListener("change",e=>{
      const el=e.target;
      if(el.matches("[data-graph-mode]")){filters.mode=el.value;if(el.value==="all")filters.globals=true;options();}
      if(el.matches("[data-graph-projects]"))filters.projects=[...el.selectedOptions].map(o=>o.value);
      if(el.matches("[data-graph-categories]"))filters.categories=[...el.selectedOptions].map(o=>o.value);
      if(el.matches("[data-graph-globals]"))filters.globals=el.checked;
      if(el.matches("[data-graph-kind]"))filters.kinds=[...container.querySelectorAll("[data-graph-kind]:checked")].map(i=>i.dataset.graphKind);
      if(el.matches("[data-graph-picker]")){if(el.value)inspect(el.value,true);return;}
      draw();fit();
    });
    get("[data-graph-search]").addEventListener("input",e=>{filters.search=e.target.value;draw();});
    function zoom(factor,px=.5,py=.5){const w=Math.max(150,Math.min(100000,camera.width*factor)),h=w*camera.height/camera.width;camera={x:camera.x+(camera.width-w)*px,y:camera.y+(camera.height-h)*py,width:w,height:h};updateCamera();}
    container.addEventListener("click",e=>{
      const action=e.target.closest("[data-graph-action]")?.dataset.graphAction;
      if(!action)return;
      if(action==="fit")fit();
      if(action==="in")zoom(.8);
      if(action==="out")zoom(1.25);
      if(action==="all-projects"||action==="current-project"){
        filters.mode="all";filters.projects=action==="all-projects"?null:[data.activeProject];options();draw();fit();
      }
      if(action==="reset"){
        filters.projects=null;filters.categories=null;filters.kinds=["override","related","conflict"];filters.search="";filters.globals=filters.mode==="all";options();draw();fit();
      }
    });
    svg.addEventListener("wheel",e=>{e.preventDefault();const r=svg.getBoundingClientRect();zoom(e.deltaY>0?1.12:1/1.12,(e.clientX-r.left)/r.width,(e.clientY-r.top)/r.height);},{passive:false});
    svg.addEventListener("pointerdown",e=>{
      if(e.button!==0)return;
      const id=e.target.closest("[data-graph-node]")?.dataset.graphNode;
      drag={id,x:e.clientX,y:e.clientY,camera:{...camera},position:id?{...positions.get(id)}:null,moved:false};
      svg.setPointerCapture(e.pointerId);
    });
    svg.addEventListener("pointermove",e=>{
      if(!drag)return;
      const dx=(e.clientX-drag.x)*drag.camera.width/(svg.clientWidth||900),dy=(e.clientY-drag.y)*drag.camera.height/(svg.clientHeight||520);
      if(Math.abs(e.clientX-drag.x)+Math.abs(e.clientY-drag.y)>4)drag.moved=true;
      if(drag.id){
        positions.set(drag.id,{x:drag.position.x+dx,y:drag.position.y+dy});draw();
      }
      else {camera={...drag.camera,x:drag.camera.x-dx,y:drag.camera.y-dy};updateCamera();}
    });
    svg.addEventListener("pointerup",e=>{const previous=drag;drag=null;if(svg.hasPointerCapture(e.pointerId))svg.releasePointerCapture(e.pointerId);if(previous?.id&&!previous.moved)inspect(previous.id);});
    svg.addEventListener("pointercancel",()=>{drag=null;});
    svg.addEventListener("keydown",e=>{
      const id=e.target.closest("[data-graph-node]")?.dataset.graphNode;
      if(id&&(e.key==="Enter"||e.key===" ")){e.preventDefault();inspect(id);}
      if(e.target===svg&&["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"].includes(e.key)){
        e.preventDefault();camera.x+=(e.key==="ArrowLeft"?-1:e.key==="ArrowRight"?1:0)*camera.width*.1;camera.y+=(e.key==="ArrowUp"?-1:e.key==="ArrowDown"?1:0)*camera.height*.1;updateCamera();
      }
    });
    return {
      setData(next){data=next;if(focus&&!data.nodes.some(n=>n.graphId===focus))focus=null;M.layout(data,positions);options();draw();if(!didFit){fit();didFit=true;}},
      focus(id,mode){focus=id;if(mode){filters.mode=mode;options();}draw();if(mode)fit();},
      selected(){return data?.nodes.find(n=>n.graphId===focus);},
      reveal(){draw();if(!didFit&&data){fit();didFit=true;}},
    };
  };
})();
