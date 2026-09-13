(() => {
  'use strict';
  window.createPouchLibraryLayout = ({app}) => {
    app.innerHTML = `<div class="app"><header class="topbar"><div class="brand"><strong>ConPin</strong><span class="muted">Rule library</span></div><label class="project-label">Project<select id="project" aria-label="Active project"></select></label><details class="library-tools"><summary>Tools</summary><div class="library-tool-menu"><strong>Project defaults</strong><button data-action="save-defaults">Save selection as project defaults</button><button data-action="restore-defaults">Restore project defaults</button><strong>Import & export</strong><button data-action="import">Import rule pack</button><button data-action="export">Export rule pack</button><button data-action="import-shared">Import repository rules</button><button data-action="export-shared">Export repository rules</button><small>Repository sharing uses .context-pouch/rules.json.</small></div></details></header><div class="toolbar"><nav aria-label="Library views"><button data-tab="library" aria-pressed="true">Rules</button><button data-tab="presets" aria-pressed="false">Presets</button><button data-tab="relationships" aria-pressed="false">Graph</button></nav><button data-action="new" class="primary">Add rule</button></div><main class="workspace"><section class="library"><div class="filters"><input id="search" type="search" placeholder="Find a rule…" aria-label="Search rules"><select id="category" aria-label="Category filter"></select><select id="focused-rule" aria-label="Choose a rule to visualize" hidden></select></div><div class="library-actions"><label><input id="selected-only" type="checkbox"> Selected only</label><button data-action="reset-filters" hidden>Reset filters</button><button data-action="generate">Generate from project</button></div><p class="filter-summary" role="status"></p><div class="rules-content"></div><div class="graph-container" hidden></div><section class="presets" hidden><div class="section-heading"><div><h2>Task presets</h2><p class="muted">Reuse a selection for a recurring task.</p></div><button data-action="new-preset" class="primary">Save selection as preset</button></div><p class="muted">Applying a preset replaces your selection. It does not change saved defaults.</p><div id="preset-list"></div></section></section><aside class="inspector" aria-label="Rule details" tabindex="-1"></aside></main><footer class="statusbar"><span id="summary">Loading your library…</span><button data-action="clear">Clear selection</button><button data-action="preview" class="primary">Review selection</button><span class="message" role="status"></span></footer><dialog id="editor-dialog"></dialog></div>`;
    const inspector = app.querySelector('.inspector');
    const openSections = new Set();
    let detailKey = null;
    inspector.addEventListener('toggle', e => {
      const name = e.target.dataset.detailSection;
      if (name) e.target.open ? openSections.add(name) : openSections.delete(name);
    }, true);
    app.addEventListener('click', e => {
      if (e.target.closest('.library-tool-menu button')) app.querySelector('.library-tools').open = false;
    });
    document.addEventListener('click', e => { if (!e.target.closest('.library-tools')) app.querySelector('.library-tools').open = false; });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') app.querySelector('.library-tools').open = false; });
    function update(state, tab, focus, query, category, selectedOnly) {
      app.querySelector('.app').dataset.view = tab;
      app.querySelector('.workspace').classList.toggle('has-detail', Boolean(focus));
      inspector.hidden = tab === 'presets' || (tab === 'library' && !focus);
      app.querySelector('.workspace').classList.toggle('without-inspector', inspector.hidden);
      app.querySelector('.presets').hidden = tab !== 'presets';
      app.querySelector('[data-action="new"]').hidden = tab !== 'library';
      app.querySelector('.filter-summary').hidden = tab !== 'library';
      const matches = state.rules.filter(r => (!selectedOnly || state.selected.includes(r.key)) && (!category || r.category === category) && `${r.title} ${r.text} ${r.category}`.toLowerCase().includes(query.toLowerCase()));
      const outside = state.selected.filter(key => !matches.some(r => r.key === key)).length;
      app.querySelector('.filter-summary').textContent = `${matches.length} rules${outside ? ` · ${outside} selected outside this filter` : ''}`;
      app.querySelector('[data-action="reset-filters"]').hidden = !query && !category && !selectedOnly;
      app.querySelector('[data-action="preview"]').textContent = `Review ${state.selected.length} selected`;
      app.querySelector('[data-action="clear"]').disabled = !state.selected.length;
      app.querySelector('[data-action="new-preset"]').disabled = !state.selected.length;
      if (detailKey !== focus) { openSections.clear(); detailKey = focus; inspector.scrollTop = 0; }
      inspector.querySelectorAll('[data-detail-section]').forEach(section => { section.open = openSections.has(section.dataset.detailSection); });
    }
    return { update, focusDetails() { inspector.focus({preventScroll:true}); } };
  };
})();
