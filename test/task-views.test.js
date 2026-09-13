'use strict';
const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs'), vm = require('node:vm');
const M = require('../model'), {create} = require('../task-draft');
const window = {};
vm.runInNewContext(fs.readFileSync(require.resolve('../task-views'),'utf8'),{window});
const esc = value => String(value).replaceAll('&','&amp;').replaceAll('<','&lt;').replaceAll('"','&quot;');
const rules = [
  {key:M.key('project','a'),id:'a',scope:'project',title:'Project rule',text:'Saved',appliesTo:'media'},
  {key:M.key('personal','b'),id:'b',scope:'personal',title:'<Global>',text:'Other',overriddenBy:M.key('project','a')},
];
const state = {project:'one',rules,selected:[rules[0].key],wanted:rules.map(r=>r.key),activeConflicts:[],scopes:[],presets:[]};
test('inspect renders effective edited text, folder scope, and escaped exclusion reasons',()=>{
  const draft=create();draft.edit(state,rules[0].key,'<Temporary>');
  const views=window.createPouchTaskViews({esc,draft,payload:M.payload});
  const html=views.inspect(state);
  assert.match(html,/Only within media\/: &lt;Temporary>/);
  assert.match(html,/Replaced by “Project rule”/);
  assert.match(html,/&lt;Global>/);
  assert.doesNotMatch(html,/<Temporary>|<Global>/);
});
test('conflict resolution buttons deselect the opposite rule',()=>{
  const draft=create(),views=window.createPouchTaskViews({esc,draft,payload:M.payload});
  const html=views.inspect({...state,selected:rules.map(r=>r.key),activeConflicts:[rules.map(r=>r.key)]});
  assert.ok(html.includes(`data-key="${esc(rules[1].key)}" >Keep “Project rule”`));
});
