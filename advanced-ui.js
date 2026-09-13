(() => {
  window.createPouchAdvancedUI = ({ panel, esc, getState, render, position }) => {
    const expanded = new Set();
    let selectedOnly = false;
    const action = name => panel.querySelector(`[data-action="${name}"]`);
    panel.querySelector('.cp-simple-toolbar').classList.remove('cp-simple-only');
    panel.querySelector('.cp-title strong').insertAdjacentHTML('beforeend', ' <span class="cp-advanced cp-mode-badge">Advanced</span>');
    panel.querySelector('.cp-simple-toolbar').insertAdjacentHTML('beforeend', '<button class="cp-advanced" data-action="tool-more" aria-label="More actions" title="More actions" aria-expanded="false"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M5 12h.01M12 12h.01M19 12h.01"/></svg></button>');
    action('inject').classList.remove('cp-simple-only');
    action('preview').className = 'cp-advanced cp-review';
    action('reinforce').remove();
    const tools = panel.querySelector('.cp-tools');
    const presetActions = action('preset').parentElement;
    presetActions.className = 'cp-advanced cp-preset-actions';
    presetActions.insertAdjacentHTML('afterbegin', '<small>Applying a preset replaces your current selection.</small>');
    action('preset').textContent = 'Save selection as preset';
    const more = document.createElement('div');
    more.className = 'cp-advanced cp-more-actions';
    more.tabIndex = -1;
    more.setAttribute('aria-label', 'More actions');
    tools.append(more);
    for (const name of ['add', 'generate', 'clear', 'save-defaults', 'restore-defaults']) more.append(action(name));
    action('generate').className = '';
    action('generate').textContent = 'Generate rules from project';
    action('add').textContent = 'Add rule';
    action('save-defaults').textContent = 'Save selection as project defaults';
    action('restore-defaults').textContent = 'Restore project defaults';
    panel.querySelector('.cp-meta').remove();
    panel.querySelector('.cp-filters').insertAdjacentHTML('beforeend', '<label class="cp-advanced cp-selected-filter"><input type="checkbox" class="cp-selected-only"> Selected only</label><button data-action="reset-filters">Reset filters</button>');
    const notice = document.createElement('div');
    notice.className = 'cp-advanced cp-wide cp-conflict';
    notice.setAttribute('role', 'status');
    panel.querySelector('.cp-footer').prepend(notice);
    panel.addEventListener('change', e => {
      if (e.target.matches('.cp-selected-only')) { selectedOnly = e.target.checked; render(); }
    });
    panel.addEventListener('click', e => {
      const button = e.target.closest('[data-action="details"]');
      if (!button) return;
      const key = button.dataset.key;
      if (expanded.has(key)) expanded.delete(key); else expanded.add(key);
      render();
      position();
    });
    return {
      reset() { selectedOnly = false; panel.querySelector('.cp-selected-only').checked = false; },
      matches: rule => !selectedOnly || getState().selected.includes(rule.key),
      get filtered() { return selectedOnly; },
      row(rule) {
        const state = getState();
        const replacement = state.rules.find(r => r.key === rule.overriddenBy);
        const status = rule.disabledHere ? 'Disabled for this project' : rule.overriddenBy ? `Replaced by “${replacement?.title || rule.overriddenBy}”` : '';
        const conflictNames = state.activeConflicts.filter(pair => pair.includes(rule.key)).flatMap(pair => pair.filter(key => key !== rule.key)).map(key => state.rules.find(r => r.key === key)?.title || key);
        const metadata = [rule.isDefault ? 'Default' : '', rule.appliesTo && rule.appliesTo !== '.' ? `${rule.appliesTo}/` : '', status, conflictNames.length ? `Conflicts with ${conflictNames.join(', ')}` : ''].filter(Boolean).join(' · ');
        const open = expanded.has(rule.key);
        const id = `cp-detail-${encodeURIComponent(rule.key)}`;
        const writable = state.scopes.some(s => s.id === rule.scope && s.writable);
        return `<div class="cp-row cp-advanced-row"><div class="cp-rule-heading"><label><input type="checkbox" data-key="${esc(rule.key)}" ${state.wanted.includes(rule.key) ? 'checked' : ''} ${rule.disabledHere || rule.overriddenBy ? 'disabled' : ''}><span><strong>${esc(rule.title)}</strong>${metadata ? `<small>${esc(metadata)}</small>` : ''}</span></label><button data-action="details" data-key="${esc(rule.key)}" aria-label="Details for ${esc(rule.title)}" aria-expanded="${open}" aria-controls="${esc(id)}">${open ? '⌃' : '⌄'}</button></div>${open ? `<div class="cp-rule-details" id="${esc(id)}"><p>${esc(rule.text)}</p><small>${esc(rule.category)} · ${rule.scope === 'personal' ? 'Global' : 'Project'} · ${esc(rule.appliesTo && rule.appliesTo !== '.' ? rule.appliesTo + '/' : 'Entire project')}</small><button data-action="edit" data-key="${esc(rule.key)}" ${writable ? '' : 'disabled'}>Edit rule</button></div>` : ''}</div>`;
      },
      update(shown, filtered) {
        const state = getState();
        const count = state.selected.length;
        const hidden = state.selected.filter(key => !shown.some(r => r.key === key)).length;
        panel.querySelector('.cp-count').textContent = `${count} selected${hidden ? ` · ${hidden} outside this filter` : ''}`;
        action('inject').textContent = count ? `Insert ${count} rule${count === 1 ? '' : 's'} into draft` : 'Select rules to insert';
        action('preview').textContent = `Review selected (${count})`;
        action('tool-filters').dataset.active = String(filtered || selectedOnly);
        const conflicts = state.activeConflicts.length > 0;
        notice.innerHTML = conflicts ? 'Selected rules conflict. <button data-action="review-conflicts">Review rules</button>' : '';
        notice.hidden = !conflicts;
        action('inject').disabled = !count || (panel.classList.contains('advanced') && conflicts);
      },
    };
  };
})();
