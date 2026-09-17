(() => {
  window.createPouchTaskViews = ({ esc, draft, payload }) => {
    const button = (action, text, key = '', extra = '') => `<button data-action="task-${action}" data-key="${esc(key)}" ${extra}>${esc(text)}</button>`;
    const scope = rule => rule.appliesTo && rule.appliesTo !== '.' ? `Only within ${rule.appliesTo}/` : 'Entire project';
    function row(state, rule, expanded, manage = false) {
      const open = expanded.has(rule.key), note = draft.note(state, rule);
      const effective = draft.effective(state).find(r => r.key === rule.key) || rule;
      const writable = state.scopes.some(s => s.id === rule.scope && s.writable);
      const projectWritable = state.scopes.some(s => s.id === 'project' && s.writable);
      const selected = state.selected.includes(rule.key);
      const actions = manage
        ? `${button('saved-edit', 'Edit saved rule', rule.key, writable ? '' : 'disabled')}${button('default', rule.scope === 'personal' ? (rule.globalDefault ? 'Remove global default' : 'Make global default') : (rule.isDefault ? 'Remove project default' : 'Make project default'), rule.key, writable ? '' : 'disabled')}${rule.scope === 'personal' ? button('disable', rule.disabledHere ? 'Enable for this project' : 'Disable for this project', rule.key, projectWritable ? '' : 'disabled') : ''}${button('library', 'Overrides & conflicts ↗', rule.key)}`
        : `${button('draft-edit', 'Edit for this draft', rule.key)}${note ? button('restore', 'Restore saved wording', rule.key) : ''}${button('remove', 'Remove from task', rule.key)}`;
      const id = `cp-task-detail-${encodeURIComponent(rule.key)}`;
      return `<article class="cp-row cp-task-rule ${selected ? 'cp-task-selected' : ''}"><button class="cp-task-rule-title" data-action="task-expand" data-key="${esc(rule.key)}" aria-expanded="${open}" aria-controls="${esc(id)}"><span><strong>${esc(rule.title)}</strong><small>${esc(manage ? [rule.scope === 'personal' ? 'Global' : 'Project', rule.isDefault ? 'Default' : '', rule.disabledHere ? 'Disabled for this project' : ''].filter(Boolean).join(' · ') : draft.origin(state, rule))} · ${esc(scope(rule))}</small>${note ? `<small class="cp-draft-note">${esc(note)}</small>` : ''}</span><span aria-hidden="true">${open ? '⌃' : '⌄'}</span></button><div id="${esc(id)}" class="cp-rule-details" ${open ? '' : 'hidden'}><p>${esc(manage ? rule.text : effective.text)}</p><div class="cp-task-actions">${actions}</div></div></article>`;
    }
    function compose(state, shown, expanded, picking, pickerRow) {
      const selected = state.selected.map(key => state.rules.find(r => r.key === key)).filter(Boolean);
      return `<div class="cp-task-heading"><strong>For this task · ${selected.length}</strong>${button('pick', picking ? 'Done adding' : 'Add rules', '', `aria-expanded="${picking}"`)}</div>${selected.map(rule => row(state, rule, expanded)).join('') || '<p class="cp-empty">Start with a few rules for this task. Add rules or choose a preset.</p>'}${draft.editedCount(state) ? `<p class="cp-task-hint">Temporary wording stays for this project, including normal mode. Reset it for a new task or reload to discard. ${button('reset-draft', 'Reset draft edits')}</p>` : ''}${picking ? `<section class="cp-task-picker" aria-label="Add rules"><strong>Available rules</strong><div class="cp-picker-results">${shown.filter(rule => !state.selected.includes(rule.key)).map(pickerRow).join('') || '<p class="cp-empty">No more matching rules.</p>'}</div></section>` : ''}`;
    }
    function inspect(state) {
      const included = draft.effective(state);
      const excluded = state.rules.filter(rule => rule.disabledHere || rule.overriddenBy || (state.wanted.includes(rule.key) && !state.selected.includes(rule.key)));
      const conflicts = state.activeConflicts.map(([a, b]) => {
        const first = state.rules.find(r => r.key === a), second = state.rules.find(r => r.key === b);
        if (!first || !second) return '';
        return `<article class="cp-task-conflict"><strong>${esc(first.title)} ↔ ${esc(second.title)}</strong><p>Confirmed conflict. Choose which rule to keep for this task.</p><div class="cp-task-actions">${button('keep', `Keep “${first.title}”`, b)}${button('keep', `Keep “${second.title}”`, a)}</div></article>`;
      }).join('');
      return `${conflicts ? `<h3>Resolve conflicts</h3>${conflicts}` : ''}<div class="cp-task-heading"><strong>Exact draft preview</strong>${button('reminder', 'Prepare a reminder', '', included.length ? '' : 'disabled')}</div><p class="cp-task-hint">This text will be appended to your draft. Project rules come first; folder scope is included.</p><pre class="cp-exact-preview">${esc(payload(included) || 'No rules selected.')}</pre><details open class="cp-inspect-group"><summary>Included · ${included.length}</summary>${included.map(rule => `<div class="cp-inspect-rule"><strong>${esc(rule.title)}</strong><small>${esc(scope(rule))} · ${esc(draft.origin(state, rule))}${draft.note(state, rule) ? ` · ${esc(draft.note(state, rule))}` : ''}</small></div>`).join('')}</details><details class="cp-inspect-group" ${excluded.length ? 'open' : ''}><summary>Excluded · ${excluded.length}</summary>${excluded.map(rule => {
        const replacement = state.rules.find(r => r.key === rule.overriddenBy);
        const why = rule.disabledHere ? 'Disabled for this project' : replacement ? `Replaced by “${replacement.title}”` : 'Not active in this task';
        return `<div class="cp-inspect-rule"><strong>${esc(rule.title)}</strong><small>${esc(why)} · ${esc(scope(rule))}</small>${button('library', 'Manage this rule ↗', rule.key)}</div>`;
      }).join('') || '<p class="cp-task-hint">No disabled or overridden rules.</p>'}</details>`;
    }
    function manage(state, shown, expanded) {
      const projectWritable = state.scopes.some(s => s.id === 'project' && s.writable);
      return `<p class="cp-task-hint">Changes here update your saved library. Draft-only wording is kept separate.</p><div class="cp-task-actions">${button('new', 'Add rule')}<button data-action="import">Import rules</button>${button('generate', 'Generate rules', '', projectWritable ? '' : 'disabled')}${button('defaults', 'Save selection as project defaults', '', projectWritable ? '' : 'disabled')}${button('restore-defaults', 'Restore project defaults')}${button('preset', 'Save selection as preset', '', state.selected.length ? '' : 'disabled')}</div><h3>Saved rules</h3>${shown.map(rule => row(state, rule, expanded, true)).join('') || '<p class="cp-empty">No matching saved rules.</p>'}<h3>Task presets</h3><p class="cp-task-hint">Presets store saved rule references. Temporary wording is not saved in a preset.</p>${state.presets.map(p => `<div class="cp-inspect-rule"><strong>${esc(p.title)}</strong><small>${p.scope === 'personal' ? 'Global' : 'Project'} · ${p.ruleIds.length} rules</small><div class="cp-task-actions">${button('apply-preset', 'Apply preset', p.key)}${button('update-preset', 'Update with selection', p.key, state.selected.length && state.scopes.some(s => s.id === p.scope && s.writable) ? '' : 'disabled')}</div></div>`).join('') || '<p class="cp-task-hint">No presets saved yet.</p>'}`;
    }
    return { compose, inspect, manage };
  };
})();
