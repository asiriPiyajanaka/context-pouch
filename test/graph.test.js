"use strict";
const {test}=require("node:test"),assert=require("node:assert/strict");
const fs=require("fs/promises"),path=require("path"),os=require("os"),vm=require("vm");
const {environment,load}=require("./mock-vscode");
const M=require("../model"),G=require("../media/graph-model");
const {graphId}=require("../graph-snapshot");
async function setup(t){
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"pouch-graph-"));
  const env=environment(root),{Library}=load("library.js",env.vscode),library=new Library(env.context,()=>{});
  t.after(async()=>{library.dispose();await fs.rm(root,{recursive:true,force:true});});
  return {...env,library};
}
function sample(){
  const projects=[{id:"a",name:"App A",active:true},{id:"b",name:"App B",open:false}];
  const nodes=[
    {graphId:"a1",id:"same",project:"a",projectName:"App A",title:"Small files",text:"300 lines",category:"Code",scope:"project",current:true,selected:true,related:[]},
    {graphId:"a2",id:"two",project:"a",projectName:"App A",title:"UI theme",text:"Use theme variables",category:"UI",scope:"project",current:true,related:[]},
    {graphId:"b1",id:"same",project:"b",projectName:"App B",title:"Tests",text:"Run tests",category:"Code",scope:"project",current:false,related:[]},
    {graphId:"g1",id:"global",project:"@global",projectName:"Global rules",title:"Global length",text:"500 lines",category:"Code",scope:"personal",current:true,overriddenHere:true,related:[]},
    {graphId:"g2",id:"other",project:"@global",projectName:"Global rules",title:"Unrelated global",text:"Other",category:"Other",scope:"personal",current:true,related:[]},
  ];
  return {activeProject:"a",projects,nodes,edges:[
    {id:"e1",from:"a1",to:"g1",kind:"override",project:"a",projectName:"App A"},
    {id:"e2",from:"b1",to:"g1",kind:"conflict",project:"b",projectName:"App B"},
  ]};
}
test("all-project graph includes closed projects, unique node identities and contextual globals",async t=>{
  const {library,vscode}=await setup(t);
  const a=vscode.workspace.workspaceFolders[0].uri.toString(),b=vscode.workspace.workspaceFolders[1].uri.toString();
  for(const project of [a,b]){
    await library.dispatch("project",{id:project});
    await library.dispatch("saveRule",{scope:"project",rule:{id:"same",title:project,text:"Rule",category:"Code"}});
  }
  await library.dispatch("saveRule",{scope:"personal",rule:{id:"g",title:"Global",text:"Global",category:"Code"}});
  await library.dispatch("setRelationship",{kind:"override",from:M.key("project","same"),to:M.key("personal","g"),enabled:true});
  await library.dispatch("select",{keys:[M.key("project","same"),M.key("personal","g")]});
  await library.dispatch("project",{id:a});
  vscode.workspace.workspaceFolders=vscode.workspace.workspaceFolders.slice(0,1);
  const revision=(await library.dispatch("state")).revision;
  const {graph}=await library.dispatch("graphState");
  assert.equal(graph.nodes.length,3);
  assert.equal(new Set(graph.nodes.map(n=>n.graphId)).size,3);
  assert.equal(graph.projects.find(p=>p.id===b).open,false);
  assert.equal(graph.nodes.find(n=>n.graphId===graphId(b,"same")).current,false);
  assert.equal(graph.nodes.find(n=>n.project==="@global").overriddenHere,false);
  assert.equal(graph.edges[0].project,b);
  assert.equal(graph.edges[0].from,graphId(b,"same"));
  assert.equal(graph.edges[0].to,graphId("@global","g"));
  assert.equal((await library.dispatch("state")).revision,revision,"Reading graph must not change selection or storage");
});
test("project view shows connected globals; All rules includes every stored rule",()=>{
  const data=sample();
  assert.deepEqual(G.visible(data,{mode:"project",globals:false}).nodes.map(n=>n.graphId),["a1","a2","g1"]);
  assert.equal(G.visible(data,{mode:"all",globals:true}).nodes.length,5);
  assert.equal(G.visible(data,{mode:"all",globals:true}).edges.length,2);
  assert.deepEqual(G.visible(data,{mode:"all",projects:["b"],globals:false}).nodes.map(n=>n.graphId),["b1","g1"]);
});
test("category, project, text and relationship filters do not invent edges",()=>{
  const data=sample();
  const ui=G.visible(data,{mode:"all",globals:true,categories:["UI"]});
  assert.deepEqual(ui.nodes.map(n=>n.graphId),["a2"]);assert.deepEqual(ui.edges,[]);
  assert.deepEqual(G.visible(data,{mode:"project",search:"300"}).nodes.map(n=>n.graphId),["a1"]);
  assert.equal(G.visible(data,{mode:"all",globals:true,kinds:[]}).edges.length,0);
  assert.equal(G.visible(data,{mode:"all",globals:false,projects:[]}).nodes.length,0);
  assert.equal(G.visible(data,{mode:"all",globals:true,categories:[]}).nodes.length,0);
});
test("focused foreign rule uses its own project relationships without switching context",()=>{
  const data=sample(),focused=G.visible(data,{mode:"focused",focus:"b1"});
  assert.deepEqual(focused.nodes.map(n=>n.graphId),["b1","g1"]);
  assert.equal(focused.edges[0].project,"b");assert.equal(data.activeProject,"a");
});
test("network layout is stable across selection changes and adds finite organic positions",()=>{
  const data=sample(),positions=new Map();G.layout(data,positions);
  const before=JSON.stringify([...positions]);
  data.nodes[0].selected=false;G.layout(data,positions);
  assert.equal(JSON.stringify([...positions]),before);
  const savedPositions=new Map([...positions].map(([id,p])=>[id,{...p}]));
  data.nodes.push({...data.nodes[0],graphId:"new",project:"0-before",projectName:"New"});
  G.layout(data,positions);
  assert(Number.isFinite(positions.get("new").x));
  assert(Number.isFinite(positions.get("new").y));
  for(const [id,p] of savedPositions)assert.deepEqual(positions.get(id),p);
  const original=positions.get("a1");G.visible(data,{mode:"project",search:"Small"});
  assert.deepEqual(positions.get("a1"),original);
});
test("SVG uses distinct global shape, labeled edges and keyboard-inspectable nodes",async()=>{
  const context={window:{}};
  for(const file of ["library-view.js","graph-renderer.js","graph-inspector.js"])
    vm.runInNewContext(await fs.readFile(path.join(__dirname,"../media",file),"utf8"),context);
  const data=sample(),{positions}=G.layout(data);
  data.nodes[0].title='<script>alert("x")</script>';
  const svg=context.window.PouchGraphRenderer.render(data,positions,"a",null);
  assert.match(svg,/<polygon/);assert.match(svg,/class="graph-node network-node graph-palette-/);
  assert.match(svg,/<circle r="14"/);
  assert.match(svg,/<ellipse/);
  assert.doesNotMatch(svg,/<rect/);
  assert.match(svg,/marker-end="url\(#override-arrow\)"/);assert.match(svg,/Conflicts with · App B/);
  assert.match(svg,/tabindex="0" role="button"/);assert.doesNotMatch(svg,/<script>/);
  assert.match(svg,/is-muted/);
  const html=context.window.renderGraphInspector(data.nodes[2],data,{});
  assert.match(html,/Read-only preview/);assert.match(html,/Open project in new window/);
  assert.doesNotMatch(html,/data-select|data-action="edit"/);
});
