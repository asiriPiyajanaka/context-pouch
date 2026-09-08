"use strict";
const {test} = require("node:test");
const assert = require("node:assert/strict");
const vm = require("vm"), fs = require("fs"), path = require("path");
const {resolve} = require("../rule-state"), M=require("../model");
function view() {
  const context={window:{}};
  vm.runInNewContext(fs.readFileSync(path.join(__dirname,"../media/library-view.js"),"utf8"),context);
  return context.window.PouchView;
}
function fixture() {
  const rules=[
    {id:"g",scope:"personal",key:M.key("personal","g"),title:"Global 500",text:"500 lines",category:"Code",related:[]},
    {id:"p",scope:"project",key:M.key("project","p"),title:"Project 300",text:"300 lines",category:"Code",related:[]},
  ];
  const prefs={selected:rules.map(r=>r.key),defaults:[],disabled:[],overrides:[[rules[1].key,rules[0].key]],conflicts:[]};
  return {project:"file:///project",projects:[{id:"file:///project",name:"Demo"}],scopes:[{id:"project",writable:true},{id:"personal",writable:true}],presets:[],...resolve(rules,prefs)};
}
test("library shows project rules first and globals collapsed with explicit state",()=>{
  const state=fixture(), html=view().list(state,null,"","",false);
  assert(html.indexOf("Project 300")<html.indexOf("Global 500"));
  assert.match(html,/<details class="global-section" >/);
  assert.match(html,/Overridden here/);
  assert.match(html,/aria-label="Select Global 500" checked disabled/);
  assert.match(html,/0 active/);
});
test("relationship view labels direction and includes only focused rule connections",()=>{
  const state=fixture(), html=view().relationships(state,M.key("project","p"));
  assert.match(html,/→ Overrides/);
  assert.match(html,/Global 500/);
  assert.doesNotMatch(html,/<canvas|Category|Preset/);
  assert.match(view().relationships(state,null),/Choose a rule/);
});
test("untrusted source and model text are escaped in list and inspector",()=>{
  const state=fixture();state.rules[1].title='<img src=x onerror="alert(1)">';
  state.rules[1].text='<script>bad()</script>';
  const html=view().list(state,null,"","",true)+view().inspector(state,state.rules[1].key);
  assert.doesNotMatch(html,/<img|<script>/);
  assert.match(html,/&lt;script&gt;/);
});
test("new global defaults remain in saved project defaults until explicitly excluded",()=>{
  const state=fixture(), p=state.rules[1].key, g=state.rules[0].key;
  const result=resolve(state.rules,{defaults:[p],selected:null,disabled:[g],overrides:[],conflicts:[]},[g]);
  assert.deepEqual(result.defaults,[g,p]);
  assert.deepEqual(result.selected,[p]);
});
