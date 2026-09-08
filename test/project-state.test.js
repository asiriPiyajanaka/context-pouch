"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises"), os = require("os"), path = require("path");
const {environment,load} = require("./mock-vscode");
const M = require("../model");
const key = (scope,id)=>M.key(scope,id);
async function setup(t) {
  const root=await fs.mkdtemp(path.join(os.tmpdir(),"pouch-projects-"));
  const env=environment(root), {Library}=load("library.js",env.vscode);
  const library=new Library(env.context,()=>{});
  t.after(async()=>{library.dispose();await fs.rm(root,{recursive:true,force:true});});
  return {...env,root,library,Library};
}
async function seed(library) {
  await library.dispatch("saveRule",{scope:"personal",rule:{id:"global",title:"Global length",category:"Code",text:"Keep files under 500 lines."}});
  await library.dispatch("saveRule",{scope:"project",rule:{id:"project",title:"Project length",category:"Code",text:"Keep files under 300 lines."}});
}
test("project selection, defaults and exclusions survive switching and reopening SQLite",async t=>{
  const {library,vscode,context,Library}=await setup(t);
  await seed(library);
  const project=key("project","project"), global=key("personal","global");
  await library.dispatch("setDefault",{key:global,enabled:true});
  await library.dispatch("select",{keys:[project,global]});
  await library.dispatch("saveDefaults");
  await library.dispatch("disableGlobal",{key:global,disabled:true});
  await library.dispatch("select",{keys:[]});
  assert.deepEqual(new Set((await library.dispatch("state")).defaults),new Set([project,global]));
  await library.dispatch("restoreDefaults");
  assert.deepEqual((await library.dispatch("state")).selected,[project]);
  await library.dispatch("project",{id:vscode.workspace.workspaceFolders[1].uri.toString()});
  const second=await library.dispatch("state");
  assert.deepEqual(second.selected,[global]);
  assert.equal(second.rules.some(r=>r.id==="project"),false);
  await library.dispatch("select",{keys:[]});
  await library.dispatch("project",{id:vscode.workspace.workspaceFolders[0].uri.toString()});
  const reopened=new Library(context,()=>{});
  try {assert.deepEqual((await reopened.dispatch("state")).selected,[project]);}
  finally {reopened.dispose();}
});
test("explicit overrides remove globals only while their project rule is selected",async t=>{
  const {library}=await setup(t);await seed(library);
  const project=key("project","project"),global=key("personal","global");
  await library.dispatch("select",{keys:[global,project]});
  await library.dispatch("setRelationship",{kind:"override",from:project,to:global,enabled:true});
  const state=await library.dispatch("state");
  assert.deepEqual(state.selected,[project]);
  assert.match(state.instructions,/300 lines/);assert.doesNotMatch(state.instructions,/500 lines/);
  assert.equal(state.rules.find(r=>r.key===global).overriddenBy,project);
  await library.dispatch("toggle",{key:project,checked:false});
  assert.deepEqual((await library.dispatch("state")).selected,[global]);
  await assert.rejects(library.dispatch("setRelationship",{kind:"override",from:global,to:project,enabled:true}),/Only a project rule/);
});
test("confirmed conflicts are visible and disappear when one rule is deselected",async t=>{
  const {library}=await setup(t);await seed(library);
  const project=key("project","project"),global=key("personal","global");
  await library.dispatch("select",{keys:[global,project]});
  await library.dispatch("setRelationship",{kind:"conflict",from:project,to:global,enabled:true});
  assert.equal((await library.dispatch("state")).activeConflicts.length,1);
  await library.dispatch("toggle",{key:global,checked:false});
  assert.equal((await library.dispatch("state")).activeConflicts.length,0);
});
test("legacy JSON migrates once, retaining sources, presets, and original files",async t=>{
  const {library,root}=await setup(t);
  const file=path.join(root,"project/.context-pouch/rules.json");
  await fs.mkdir(path.dirname(file),{recursive:true});
  const pack={version:1,rules:[{id:"r",title:"Migrated",category:"UI",text:"Use theme variables",related:[],appliesTo:"media",sources:[{path:"media/AGENTS.md",line:1}]}],presets:[{id:"p",title:"UI task",ruleIds:["r"]}]};
  const original=JSON.stringify(pack);await fs.writeFile(file,original);
  const state=await library.dispatch("state");
  assert.deepEqual(state.rules[0].sources,pack.rules[0].sources);
  assert.equal(state.presets[0].title,"UI task");
  await library.dispatch("saveRule",{scope:"project",rule:{id:"r",title:"Local edit",category:"UI",text:"Local text"}});
  assert.equal(await fs.readFile(file,"utf8"),original);
  await fs.writeFile(file,JSON.stringify({...pack,rules:[]}));
  assert.equal((await library.dispatch("state")).rules[0].title,"Local edit");
});
test("invalid legacy JSON is not marked migrated and can be repaired",async t=>{
  const {library,root}=await setup(t), file=path.join(root,"project/.context-pouch/rules.json");
  await fs.mkdir(path.dirname(file),{recursive:true});await fs.writeFile(file,"{broken");
  await assert.rejects(library.dispatch("state"),/Cannot load/);
  assert.equal(library.store.has(library.projectId),false);
  await fs.writeFile(file,JSON.stringify(M.empty()));
  assert.deepEqual((await library.dispatch("state")).rules,[]);
});
test("two extension windows reject stale writes without partial changes",async t=>{
  const {library,Library,context}=await setup(t);await seed(library);
  const other=new Library(context,()=>{});
  try {
    const stale=await other.dispatch("state");
    await library.dispatch("saveRule",{scope:"project",rule:{title:"New",category:"Code",text:"New rule"}});
    await assert.rejects(other.dispatch("deleteRule",{scope:"project",id:"project",revision:stale.revision}),/changed elsewhere/);
    const before=(await library.dispatch("state")).rules.length;
    await assert.rejects(library.dispatch("saveRule",{scope:"project",rule:{title:"Bad",text:""}}),/non-empty/);
    assert.equal((await library.dispatch("state")).rules.length,before);
  }finally{other.dispose();}
});
test("same display names do not combine project libraries",async t=>{
  const {library,vscode}=await setup(t);await seed(library);
  vscode.workspace.workspaceFolders[1].name=vscode.workspace.workspaceFolders[0].name;
  await library.dispatch("project",{id:vscode.workspace.workspaceFolders[1].uri.toString()});
  assert.equal((await library.dispatch("state")).rules.filter(r=>r.scope==="project").length,0);
});
test("folder-specific project rules cannot suppress a broader global rule",async t=>{
  const {library}=await setup(t);await seed(library);
  const state=await library.dispatch("state");
  await library.dispatch("saveGenerated",{scope:"project",project:state.project,rules:[{id:"scoped",title:"Scoped",category:"UI",text:"Only UI",related:[],appliesTo:"media"}]});
  await assert.rejects(library.dispatch("setRelationship",{kind:"override",from:key("project","scoped"),to:key("personal","global"),enabled:true}),/folder-specific/);
});
test("deleting a global rule cleans defaults and relationships in every project",async t=>{
  const {library,vscode}=await setup(t);await seed(library);
  const g=key("personal","global"),p=key("project","project");
  await library.dispatch("setDefault",{key:g,enabled:true});
  await library.dispatch("select",{keys:[g,p]});
  await library.dispatch("saveDefaults");
  await library.dispatch("setRelationship",{kind:"override",from:p,to:g,enabled:true});
  await library.dispatch("project",{id:vscode.workspace.workspaceFolders[1].uri.toString()});
  await library.dispatch("disableGlobal",{key:g,disabled:true});
  await library.dispatch("deleteRule",{scope:"personal",id:"global"});
  await library.dispatch("saveRule",{scope:"personal",rule:{id:"global",title:"Reimported",category:"Code",text:"New global"}});
  assert.equal((await library.dispatch("state")).rules[0].disabledHere,false);
  await library.dispatch("project",{id:vscode.workspace.workspaceFolders[0].uri.toString()});
  const state=await library.dispatch("state");
  assert.deepEqual(state.overrides,[]);
  assert.equal(state.defaults.includes(g),false);
});
test("shared export is explicit and shared import previews before changing SQLite",async t=>{
  const {library,root,vscode,answers}=await setup(t);await seed(library);
  const file=path.join(root,"project/.context-pouch/rules.json");
  vscode.window.showWarningMessage=async()=>"Export";
  await library.exportPack("project",false,true);
  const shared=JSON.parse(await fs.readFile(file,"utf8"));
  assert.equal(shared.rules[0].title,"Project length");
  shared.rules[0].text="Shared update";
  await fs.writeFile(file,JSON.stringify(shared));
  assert.notEqual((await library.dispatch("state")).rules.find(r=>r.scope==="project").text,"Shared update");
  answers.push("Replace matches");
  await library.importPack("project",true);
  assert.equal((await library.dispatch("state")).rules.find(r=>r.scope==="project").text,"Shared update");
});
