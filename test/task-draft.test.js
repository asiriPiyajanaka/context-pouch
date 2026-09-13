'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { create } = require('../task-draft');
const M = require('../model');
const rule = Object.freeze({ key: JSON.stringify(['project','a']), id: 'a', scope: 'project', text: 'Saved text', appliesTo: 'media', isDefault: true });
const state = Object.freeze({ project: 'one', rules: Object.freeze([rule]), selected: Object.freeze([rule.key]) });
test('draft edits affect payload without mutating saved rules and preserve scope', () => {
  const draft = create();
  draft.edit(state, rule.key, 'Task text');
  assert.equal(rule.text, 'Saved text');
  assert.match(M.payload(draft.effective(state)), /Only within media\/: Task text/);
  assert.equal(draft.editedCount(state), 1);
  draft.restore(state, rule.key);
  assert.equal(draft.effective(state)[0].text, 'Saved text');
});
test('draft edits are isolated by project, survive deselection, and reset', () => {
  const draft = create(); draft.edit(state, rule.key, 'Task text');
  assert.equal(draft.effective({...state, project:'two'})[0].text, 'Saved text');
  assert.deepEqual(draft.effective({...state, selected:[]}), []);
  assert.equal(draft.effective(state)[0].text, 'Task text');
  draft.reset(state); assert.equal(draft.editedCount(state), 0);
});
test('saved wording changes are identified and restore uses the latest saved text', () => {
  const draft = create(); draft.edit(state, rule.key, 'Task text');
  const latest = {...state, rules:[{...rule,text:'New saved text'}]};
  assert.match(draft.note(latest, latest.rules[0]), /saved wording has changed/);
  draft.restore(latest, rule.key);
  assert.equal(draft.effective(latest)[0].text, 'New saved text');
});
test('invalid edits cannot change the draft', () => {
  const draft = create();
  for (const value of ['', ' ', 'a'.repeat(5001), null]) assert.throws(()=>draft.edit(state, rule.key, value));
  assert.throws(()=>draft.edit({...state,selected:[]}, rule.key, 'text'));
  assert.equal(draft.editedCount(state),0);
});
test('preset provenance is recorded without changing its saved rule references', () => {
  const draft = create(); const preset = Object.freeze({title:'UI task',scope:'project',ruleIds:Object.freeze(['a'])});
  draft.usePreset(state,preset);
  assert.equal(draft.origin(state,rule),'From preset: UI task');
  assert.equal(draft.origin({...state,project:'two'},rule),'Project default');
});
