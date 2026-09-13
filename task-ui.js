(() => {
  window.createPouchTaskUI = ({ panel, esc, getState, render, request, dialog, closeDialog, edit, preview, error, draft }) => {
    let view = 'compose', picking = false;
    const expanded = new Set();
    const views = window.createPouchTaskViews({ esc, draft, payload: window.ContextPouchModel.payload });
    const nav = document.createElement('nav');
    nav.className = 'cp-advanced cp-task-nav';
    nav.setAttribute('aria-label', 'Advanced views');
    nav.innerHTML = ['compose', 'inspect', 'manage'].map(name => `<button data-action="task-view" data-view="${name}" aria-pressed="${name === view}">${name[0].toUpperCase() + name.slice(1)}</button>`).join('');
    panel.querySelector('.cp-tools').after(nav);
    function show(next) { view = next; render(); }
    function confirm(title, explanation, label, operation) {
      const revision = getState().revision;
      dialog(`<strong>${esc(title)}</strong><p>${esc(explanation)}</p><div class="cp-actions"><button class="cp-primary cp-task-confirm">${esc(label)}</button><button data-action="cancel">Cancel</button></div>`);
      panel.querySelector('.cp-task-confirm').onclick = async e => {
        e.target.disabled = true;
        try { await operation(revision); closeDialog(); render(); }
        catch (err) { error(err.message); e.target.disabled = false; }
      };
    }
    panel.addEventListener('click', async e => {
      const target = e.target.closest('[data-action^="task-"]');
      if (!target || !getState()) return;
      const action = target.dataset.action.slice(5), state = getState();
      const rule = state.rules.find(r => r.key === target.dataset.key);
      try {
        if (action === 'view') { show(target.dataset.view); return; }
        if (action === 'pick') { picking = !picking; render(); return; }
        if (action === 'expand') { expanded.has(rule.key) ? expanded.delete(rule.key) : expanded.add(rule.key); render(); return; }
        if (action === 'remove' || action === 'keep') await request('toggle', { key: rule.key, checked: false });
        if (action === 'restore') { draft.restore(state, rule.key); render(); }
        if (action === 'reset-draft') { draft.reset(state); render(); }
        if (action === 'draft-edit') {
          const project = state.project, original = rule.text;
          const current = draft.effective(state).find(r => r.key === rule.key);
          dialog(`<strong>Edit for this draft</strong><p>${esc(rule.title)} · ${esc(rule.appliesTo || 'Entire project')}</p><p>Saved wording stays unchanged. This edit lasts until reset or reload.</p><label><span>Task instructions</span><textarea class="cp-task-text" aria-label="Task instructions" maxlength="5000">${esc(current.text)}</textarea></label><div class="cp-actions"><button class="cp-primary cp-save-task">Apply to this draft</button><button data-action="cancel">Cancel</button></div>`);
          panel.querySelector('.cp-save-task').onclick = () => {
            try {
              const latest = getState();
              if (latest.project !== project || latest.rules.find(r => r.key === rule.key)?.text !== original) throw new Error('The saved rule or project changed. Reopen the draft edit.');
              draft.edit(latest, rule.key, panel.querySelector('.cp-task-text').value);
              closeDialog(); render();
            } catch (err) { error(err.message); }
          };
        }
        if (action === 'saved-edit') edit(rule);
        if (action === 'new') edit();
        if (action === 'generate') await request('generate');
        if (action === 'library') await request('graph', { key: rule.key, project: state.project });
        if (action === 'reminder') preview('reinforce');
        if (action === 'default') {
          const enabled = !(rule.scope === 'personal' ? rule.globalDefault : rule.isDefault);
          confirm('Update saved default', `${enabled ? 'Add' : 'Remove'} “${rule.title}” ${enabled ? 'to' : 'from'} ${rule.scope === 'personal' ? 'global defaults across projects' : 'defaults for this project'}. Restore defaults applies this to your selection.`, 'Update default', revision => request('setDefault', { revision, key: rule.key, enabled }));
        }
        if (action === 'disable') await request('disableGlobal', { key: rule.key, disabled: !rule.disabledHere });
        if (action === 'defaults') panel.querySelector('[data-action="save-defaults"]').click();
        if (action === 'restore-defaults') await request('restoreDefaults');
        if (action === 'preset') panel.querySelector('[data-action="preset"]').click();
        if (action === 'apply-preset' || action === 'update-preset') {
          const preset = state.presets.find(p => p.key === target.dataset.key);
          if (action === 'apply-preset') confirm('Apply preset', `“${preset.title}” replaces the current selection.`, 'Apply preset', async revision => {
            await request('select', { revision, keys: preset.ruleIds.map(id => window.ContextPouchModel.key(preset.scope, id)) });
            draft.usePreset(getState(), preset);
          });
          else {
            const selected = state.rules.filter(r => state.selected.includes(r.key));
            if (!selected.length || selected.some(r => r.scope !== preset.scope)) throw new Error('Choose rules from the preset’s library before updating it.');
            confirm('Update saved preset', `Replace “${preset.title}” with these ${selected.length} saved rule references. Draft-only wording is not saved.`, 'Update preset', revision => request('savePreset', { revision, scope: preset.scope, id: preset.id, title: preset.title, ruleIds: selected.map(r => r.id) }));
          }
        }
      } catch (err) { error(err.message); }
    });
    return {
      draft, show,
      updateCount() {
        const state = getState();
        if (view === 'compose') panel.querySelector('.cp-count').textContent = `${state.selected.length} selected${draft.editedCount(state) ? ` · ${draft.editedCount(state)} edited for draft` : ''}`;
      },
      render(shown, pickerRow) {
        const state = getState();
        panel.dataset.taskView = view;
        nav.querySelectorAll('button').forEach(button => button.setAttribute('aria-pressed', String(button.dataset.view === view)));
        const list = panel.querySelector('.cp-list');
        list.innerHTML = view === 'compose' ? views.compose(state, shown, expanded, picking, pickerRow) : view === 'inspect' ? views.inspect(state) : views.manage(state, shown, expanded);
        if (view === 'compose') panel.querySelector('.cp-count').textContent = `${state.selected.length} selected${draft.editedCount(state) ? ` · ${draft.editedCount(state)} edited for draft` : ''}`;
      },
    };
  };
})();
