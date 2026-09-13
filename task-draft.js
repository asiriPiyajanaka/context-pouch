/* Temporary working instructions; independent of storage and browser APIs. */
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.PouchTaskDraft = factory();
})(typeof globalThis !== 'undefined' ? globalThis : this, () => {
  'use strict';
  function create() {
    const projects = new Map();
    function bucket(state) {
      const id = state.project || '@no-project';
      if (!projects.has(id)) projects.set(id, { edits: new Map(), preset: null });
      return projects.get(id);
    }
    function edit(state, key, text) {
      const rule = state.rules.find(r => r.key === key);
      if (!rule || !state.selected.includes(key)) throw new Error('Select this rule before editing it for the draft.');
      if (typeof text !== 'string' || !text.trim() || text.length > 5000)
        throw new Error('Enter instructions between 1 and 5000 characters.');
      const entries = bucket(state).edits;
      if (text.trim() === rule.text) entries.delete(key);
      else entries.set(key, { text: text.trim(), original: rule.text });
    }
    function effective(state) {
      const entries = bucket(state).edits;
      return state.selected.map(key => state.rules.find(r => r.key === key)).filter(Boolean)
        .map(rule => entries.has(rule.key) ? { ...rule, text: entries.get(rule.key).text } : { ...rule });
    }
    function note(state, rule) {
      const entry = bucket(state).edits.get(rule.key);
      return entry ? (entry.original !== rule.text ? 'Edited for this draft · saved wording has changed' : 'Edited for this draft') : '';
    }
    function origin(state, rule) {
      const preset = bucket(state).preset;
      if (preset?.keys.includes(rule.key)) return `From preset: ${preset.title}`;
      return rule.isDefault ? (rule.scope === 'personal' ? 'Global default' : 'Project default') : 'Selected for task';
    }
    return {
      edit, effective, note, origin,
      restore(state, key) { bucket(state).edits.delete(key); },
      reset(state) { bucket(state).edits.clear(); },
      usePreset(state, preset) { bucket(state).preset = { title: preset.title, keys: preset.ruleIds.map(id => JSON.stringify([preset.scope, id])) }; },
      editedCount(state) { return effective(state).filter(rule => bucket(state).edits.has(rule.key)).length; },
    };
  }
  return { create };
});
