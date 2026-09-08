"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises"), path = require("path"), os = require("os");
const G = require("../generator"), M = require("../model");
const { environment, load } = require("./mock-vscode");
const docs = [{path:"frontend/AGENTS.md",text:"Use shared UI.\nRun UI tests."}];
const suggestion = () => ({ title:"Reuse components", category:"UI", text:"Use shared UI.", appliesTo:"frontend", sources:[{path:"frontend/AGENTS.md",line:1}] });
test("generated rules require real sources and retain nested scope in prompts and packs", () => {
  const result = G.normalize({rules:[suggestion(), suggestion()],warnings:[]}, docs, []);
  assert.equal(result.rules.length,1);
  assert.equal(result.duplicates,1);
  assert.match(M.payload(result.rules), /Only within frontend\/: Use shared UI/);
  assert.deepEqual(M.subset({version:1,rules:result.rules,presets:[]},[result.rules[0].id]).rules[0].sources, suggestion().sources);
  assert.throws(() => G.normalize({rules:[{...suggestion(),appliesTo:"."}],warnings:[]},docs,[]), /broadened/);
  assert.throws(() => G.normalize({rules:[{...suggestion(),sources:[{path:"missing.md",line:1}]}],warnings:[]},docs,[]), /unavailable/);
  assert.throws(() => G.normalize({rules:[{...suggestion(),sources:[{path:"frontend/AGENTS.md",line:99}]}],warnings:[]},docs,[]), /unavailable/);
  assert.throws(() => G.normalize({rules:[{...suggestion(),appliesTo:"../outside"}],warnings:[]},docs,[]), /relative/);
  assert.equal(G.normalize({rules:[suggestion()],warnings:[]},docs,result.rules).rules.length,0);
  assert.equal(G.normalize({rules:[suggestion()],warnings:[]},docs,[{...result.rules[0],appliesTo:"backend"}]).rules.length,1);
});
test("document loading rejects outside symlinks, oversized files and excluded directories", async t => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),"pouch-docs-"));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const project = path.join(root,"project"); await fs.mkdir(project);
  await fs.writeFile(path.join(root,"private.md"),"private");
  await fs.symlink(path.join(root,"private.md"),path.join(project,"AGENTS.md"));
  await assert.rejects(G.readDocument(project,"AGENTS.md"),/outside/);
  await assert.rejects(G.readDocument(project,"../private.md"),/Invalid/);
  await fs.writeFile(path.join(project,"large.md"),"a".repeat(64001));
  await assert.rejects(G.readDocument(project,"large.md"),/64 KB/);
  assert.equal(G.candidate("node_modules/pkg/README.md"),false);
  assert.equal(G.preferred(".cursor/rules/ui.mdc"),true);
});
test("OpenAI adapter sends a strict schema and handles errors without exposing credentials", async () => {
  let request;
  const output = {rules:[suggestion()],warnings:[]};
  const result = await G.openai("docs", {key:"secret",model:"chosen-model",fetchImpl:async (url, opts) => {
    request = JSON.parse(opts.body);
    assert.equal(url,"https://api.openai.com/v1/responses");
    return {ok:true,json:async()=>({status:"completed",output:[{content:[{type:"output_text",text:JSON.stringify(output)}]}]})};
  }});
  assert.deepEqual(result,output);
  assert.equal(request.model,"chosen-model");
  assert.equal(request.store,false);
  assert.equal(request.text.format.strict,true);
  assert.equal(request.tools,undefined);
  await assert.rejects(G.openai("",{key:"secret",fetchImpl:async()=>({ok:false,status:401})}), /authentication failed/);
  await assert.rejects(G.openai("",{key:"secret",fetchImpl:async()=>({ok:true,json:async()=>({status:"incomplete"})})}), /did not complete/);
});
async function wizard(t, choices, provider) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),"pouch-wizard-"));
  t.after(()=>fs.rm(root,{recursive:true,force:true}));
  const env = environment(root), {vscode,context} = env;
  await fs.mkdir(path.join(root,"project/frontend"),{recursive:true});
  await fs.writeFile(path.join(root,"project/frontend/AGENTS.md"),docs[0].text);
  const {Library} = load("library.js",vscode), library = new Library(context,()=>{});
  t.after(()=>library.dispose());
  context.secrets = {get:async()=>undefined};
  vscode.RelativePattern = class { constructor(uri,pattern){this.uri=uri;this.pattern=pattern;} };
  vscode.ProgressLocation = {Notification:15};
  vscode.workspace.findFiles = async()=>[vscode.Uri.file(path.join(root,"project/frontend/AGENTS.md"))];
  vscode.workspace.getConfiguration = ()=>({get:(_,fallback)=>fallback});
  vscode.window.showQuickPick = async(items,opts)=>{
    const choice = choices.shift();
    return typeof choice === "function" ? choice(items,opts) : choice;
  };
  vscode.window.withProgress = async(_,fn)=>fn({report(){}},{isCancellationRequested:false,onCancellationRequested(){return {dispose(){}};}});
  const {GenerationUI} = load("generation-ui.js",vscode);
  return {...env,root,library,ui:new GenerationUI(context,library,{codex:provider || (async()=>({rules:[suggestion()],warnings:[]}))})};
}
const all = items=>items, codex = items=>items.find(i=>i.id==="codex"), save = items=>items.find(i=>i.id==="save");
test("wizard saves only reviewed rules and preserves metadata on subsequent edits", async t=>{
  const {ui,library} = await wizard(t,[all,codex,all,save]);
  await ui.run();
  const state = await library.dispatch("state"), rule = state.rules.find(r=>r.scope==="project");
  assert.equal(rule.appliesTo,"frontend");
  assert.deepEqual(rule.sources,suggestion().sources);
  await library.dispatch("saveRule",{scope:"project",rule:{id:rule.id,title:"Edited",category:rule.category,text:"Updated text"}});
  const edited = (await library.dispatch("state")).rules.find(r=>r.id===rule.id);
  assert.equal(edited.appliesTo,"frontend");
  assert.deepEqual(edited.sources,suggestion().sources);
});
test("cancelling review leaves project storage untouched", async t=>{
  const {ui,library} = await wizard(t,[all,codex,undefined]);
  await ui.run();
  assert.equal((await library.dispatch("state")).rules.filter(r=>r.scope==="project").length,0);
  assert.equal(ui.running,false);
});
test("project changes during review reject saving", async t=>{
  const env = await wizard(t,[all,codex,all,async items=>{
    await env.library.dispatch("project",{id:env.vscode.workspace.workspaceFolders[1].uri.toString()});
    return save(items);
  }]);
  await assert.rejects(env.ui.run(),/changed during review/);
  assert.equal((await env.library.dispatch("state")).rules.filter(r=>r.scope==="project").length,0);
});
test("generation cancellation aborts provider and never opens review", async t=>{
  const env = await wizard(t,[all,codex], async(_, {signal})=>new Promise((resolve,reject)=>signal.addEventListener("abort",()=>reject(new Error("cancelled")))));
  env.vscode.window.withProgress = async(_,fn)=>{
    const token = {isCancellationRequested:false,onCancellationRequested(cb){setTimeout(()=>{token.isCancellationRequested=true;cb();},5);return {dispose(){}};}};
    return fn({report(){}},token);
  };
  await env.ui.run();
  assert.equal(env.ui.running,false);
  assert.equal((await env.library.dispatch("state")).rules.filter(r=>r.scope==="project").length,0);
});
test("Codex adapter uses stdin, isolated working directory, read-only flags and cleans up", async () => {
  const {EventEmitter} = require("events"), {Writable} = require("stream");
  let directory, input = "";
  const controller = new AbortController();
  const output = {rules:[suggestion()],warnings:[]};
  const result = await G.codex("document text with `shell` characters", {
    executable:"custom-codex", signal:controller.signal,
    spawnImpl(executable,args,opts) {
      assert.equal(executable,"custom-codex");
      assert.equal(opts.shell,false);
      assert.equal(opts.signal,controller.signal);
      assert(args.includes("--ignore-user-config"));
      assert(args.includes("features.shell_tool=false"));
      assert.equal(args[args.indexOf("--sandbox")+1],"read-only");
      directory = opts.cwd;
      const child = new EventEmitter();
      child.stdin = new Writable({write(chunk,encoding,cb){ input += chunk; cb(); }, final(cb){
        fs.writeFile(args[args.indexOf("--output-last-message")+1],JSON.stringify(output)).then(()=>{cb();child.emit("close",0);},cb);
      }});
      return child;
    },
  });
  assert.deepEqual(result,output);
  assert.equal(input,"document text with `shell` characters");
  await assert.rejects(fs.stat(directory),{code:"ENOENT"});
});
test("source edits during review reject saving stale suggestions", async t=>{
  const env = await wizard(t,[all,codex,all,async items=>{
    await fs.writeFile(path.join(env.root,"project/frontend/AGENTS.md"),"New instructions.");
    return save(items);
  }]);
  await assert.rejects(env.ui.run(),/source document changed/);
  assert.equal((await env.library.dispatch("state")).rules.filter(r=>r.scope==="project").length,0);
});
test("provider path formatting normalizes without changing folder scope or input", () => {
  for (const [scope, source] of [
    ["./frontend/", "./frontend/AGENTS.md"],
    ["frontend\\", "frontend\\AGENTS.md"],
    ["frontend//./", "./frontend//AGENTS.md"],
  ]) {
    const input = {...suggestion(), appliesTo:scope, sources:[{path:source,line:1}]};
    const result = G.normalize({rules:[input],warnings:[]},docs,[]);
    assert.equal(result.rules[0].appliesTo,"frontend");
    assert.equal(result.rules[0].sources[0].path,"frontend/AGENTS.md");
    assert.equal(input.appliesTo,scope);
    assert.equal(input.sources[0].path,source);
  }
  const root = G.normalize({rules:[{...suggestion(),appliesTo:"./",sources:[{path:"./AGENTS.md",line:1}]}],warnings:[]},[{path:"AGENTS.md",text:"Use shared UI."}],[]);
  assert.equal(root.rules[0].appliesTo,".");
});
test("invalid provider paths identify the rule and field without accepting traversal", () => {
  for (const invalid of ["../frontend", "frontend/../frontend", "/frontend", "C:\\frontend", "file:///frontend", "\\\\server\\frontend"]) {
    assert.throws(()=>G.normalize({rules:[{...suggestion(),appliesTo:invalid}],warnings:[]},docs,[]), /Reuse components.*invalid appliesTo scope/);
    assert.throws(()=>G.normalize({rules:[{...suggestion(),sources:[{path:invalid,line:1}]}],warnings:[]},docs,[]), /Reuse components.*invalid source path/);
  }
  assert.throws(()=>G.normalize({rules:[{...suggestion(),appliesTo:"./"}],warnings:[]},docs,[]), /broadened/);
});
