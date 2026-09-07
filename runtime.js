;(() => {
  if (window.__contextPouchLoaded) return;
  window.__contextPouchLoaded = true;

  const STORAGE_KEY = 'context-pouch.rules.v1';
  const SELECTED_KEY = 'context-pouch.selected.v1';
  const DEFAULT_RULES = [
    { id: 'ui-existing-buttons', category: 'UI', title: 'Use existing app buttons', text: 'Use the existing app button components. Do not create replacement button implementations.' },
    { id: 'ui-no-new-buttons', category: 'UI', title: 'Do not add new buttons', text: 'Do not add new buttons, CTAs, or controls unless they were explicitly requested.' },
    { id: 'ui-reuse-components', category: 'UI', title: 'Reuse existing components', text: 'Reuse existing project components and patterns before creating new UI components.' },
    { id: 'ui-preserve-layout', category: 'UI', title: 'Preserve current layout', text: 'Preserve the current layout and visual structure except for the changes explicitly requested.' },
    { id: 'assets-generate', category: 'Assets', title: 'Generate/use icons when needed', text: 'When the design requires an icon or visual asset, use or generate an appropriate asset instead of replacing it with extra text or a new button.' },
    { id: 'nav-no-change', category: 'Project', title: 'Do not change navigation', text: 'Do not change routes, navigation structure, or navigation behavior unless explicitly requested.' },
    { id: 'code-no-deps', category: 'Code', title: 'No new dependencies', text: 'Do not add a new dependency unless the task cannot reasonably be completed with the existing stack.' },
    { id: 'code-no-unrelated', category: 'Code', title: 'Do not refactor unrelated code', text: 'Do not refactor, rename, or modify unrelated code while completing this task.' }
  ];

  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#039;'}[c]));
  const uid = () => 'r-' + Math.random().toString(36).slice(2, 10) + Date.now().toString(36).slice(-4);
  const loadRules = () => {
    try {
      const v = JSON.parse(localStorage.getItem(STORAGE_KEY) || 'null');
      if (Array.isArray(v) && v.length) return v;
    } catch (_) {}
    localStorage.setItem(STORAGE_KEY, JSON.stringify(DEFAULT_RULES));
    return DEFAULT_RULES.map(r => ({...r}));
  };
  const loadSelected = () => {
    try { return new Set(JSON.parse(sessionStorage.getItem(SELECTED_KEY) || '[]')); } catch (_) { return new Set(); }
  };
  let rules = loadRules();
  let selected = loadSelected();
  let filter = 'All';
  let search = '';
  let editingId = null;

  const save = () => localStorage.setItem(STORAGE_KEY, JSON.stringify(rules));
  const saveSelected = () => sessionStorage.setItem(SELECTED_KEY, JSON.stringify([...selected]));

  const style = document.createElement('style');
  style.id = 'context-pouch-style';
  style.textContent = `
    #context-pouch-button{position:fixed;z-index:2147483600;width:30px;height:30px;border-radius:10px;border:1px solid color-mix(in srgb,currentColor 16%,transparent);background:color-mix(in srgb,var(--vscode-input-background,#2b2d3b) 86%,#ffffff 14%);color:var(--vscode-foreground,#d7d9e7);display:none;align-items:center;justify-content:center;cursor:pointer;box-shadow:0 4px 16px rgba(0,0,0,.16);padding:0;transition:transform .12s ease,background .12s ease}
    #context-pouch-button:hover{transform:translateY(-1px);background:color-mix(in srgb,var(--vscode-input-background,#2b2d3b) 76%,#ffffff 24%)}
    #context-pouch-button svg{width:16px;height:16px;pointer-events:none}
    #context-pouch-panel{position:fixed;z-index:2147483601;width:min(390px,calc(100vw - 20px));max-height:min(620px,calc(100vh - 24px));overflow:hidden;display:none;flex-direction:column;border:1px solid color-mix(in srgb,var(--vscode-foreground,#ddd) 14%,transparent);border-radius:14px;background:var(--vscode-editorWidget-background,#1e1f2a);color:var(--vscode-foreground,#e8e8ef);box-shadow:0 16px 44px rgba(0,0,0,.38);font:12px/1.4 -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif}
    #context-pouch-panel.open{display:flex}
    .cp-head{display:flex;align-items:center;gap:8px;padding:12px 12px 9px;border-bottom:1px solid color-mix(in srgb,currentColor 10%,transparent)}
    .cp-title{font-weight:700;font-size:13px;flex:1}.cp-count{font-size:11px;opacity:.65}.cp-icon-btn{border:0;background:transparent;color:inherit;opacity:.72;cursor:pointer;border-radius:7px;padding:5px}.cp-icon-btn:hover{background:color-mix(in srgb,currentColor 10%,transparent);opacity:1}
    .cp-tools{padding:10px 12px 8px;display:flex;gap:7px;flex-wrap:wrap}.cp-search{width:100%;box-sizing:border-box;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:9px;padding:8px 10px;background:var(--vscode-input-background,#2b2d3b);color:var(--vscode-input-foreground,#fff);outline:none}.cp-search:focus{border-color:var(--vscode-focusBorder,#6f8cff)}
    .cp-chip{font-size:10px;border:1px solid color-mix(in srgb,currentColor 13%,transparent);background:transparent;color:inherit;border-radius:999px;padding:4px 8px;cursor:pointer;opacity:.8}.cp-chip.active{background:color-mix(in srgb,var(--vscode-button-background,#4f67c8) 35%,transparent);opacity:1}
    .cp-list{overflow:auto;padding:3px 8px 8px;min-height:80px}.cp-row{display:grid;grid-template-columns:22px 1fr auto;gap:7px;align-items:start;padding:8px;border-radius:9px}.cp-row:hover{background:color-mix(in srgb,currentColor 7%,transparent)}.cp-row input{margin-top:2px}.cp-row-title{font-weight:600;font-size:12px}.cp-row-text{font-size:10.5px;opacity:.62;margin-top:2px}.cp-badge{display:inline-block;margin-top:3px;font-size:9px;opacity:.55}.cp-row-actions{display:flex;gap:1px;opacity:.32}.cp-row:hover .cp-row-actions{opacity:.85}
    .cp-empty{padding:20px;text-align:center;opacity:.55}.cp-footer{padding:10px 12px 12px;border-top:1px solid color-mix(in srgb,currentColor 10%,transparent);display:grid;grid-template-columns:1fr 1fr;gap:7px}.cp-btn{border:0;border-radius:9px;padding:8px 10px;cursor:pointer;font-weight:600;font-size:11px}.cp-primary{background:var(--vscode-button-background,#5066c8);color:var(--vscode-button-foreground,#fff)}.cp-secondary{background:var(--vscode-button-secondaryBackground,#343646);color:var(--vscode-button-secondaryForeground,#eee)}.cp-btn:disabled{opacity:.4;cursor:default}.cp-footer-meta{grid-column:1/-1;display:flex;align-items:center;gap:8px}.cp-link{border:0;background:transparent;color:var(--vscode-textLink-foreground,#7aa2ff);font-size:10px;cursor:pointer;padding:0}.cp-spacer{flex:1}
    #context-pouch-modal{position:absolute;inset:0;display:none;align-items:center;justify-content:center;background:rgba(0,0,0,.48);padding:16px;z-index:4}#context-pouch-modal.open{display:flex}.cp-card{width:100%;background:var(--vscode-editorWidget-background,#222431);border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:12px;padding:12px;box-shadow:0 12px 32px rgba(0,0,0,.3)}.cp-field{display:block;margin:8px 0}.cp-field span{display:block;font-size:10px;opacity:.65;margin-bottom:4px}.cp-field input,.cp-field textarea{width:100%;box-sizing:border-box;background:var(--vscode-input-background,#2b2d3b);color:inherit;border:1px solid color-mix(in srgb,currentColor 14%,transparent);border-radius:8px;padding:7px 8px;font:inherit;outline:none}.cp-field textarea{min-height:86px;resize:vertical}.cp-modal-actions{display:flex;justify-content:flex-end;gap:7px;margin-top:10px}
    #context-pouch-toast{position:fixed;z-index:2147483602;display:none;padding:7px 10px;border-radius:8px;background:var(--vscode-notifications-background,#252735);color:var(--vscode-notifications-foreground,#fff);box-shadow:0 8px 24px rgba(0,0,0,.3);font:11px -apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;pointer-events:none}
  `;
  document.documentElement.appendChild(style);

  const button = document.createElement('button');
  button.id = 'context-pouch-button';
  button.title = 'Context Pouch';
  button.setAttribute('aria-label', 'Open Context Pouch');
  button.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8 7h8l1.2 3.2c.8 2.1 1.3 4.2 1.3 6.5A2.3 2.3 0 0 1 16.2 19H7.8a2.3 2.3 0 0 1-2.3-2.3c0-2.3.5-4.4 1.3-6.5L8 7Z"/><path d="M9 7c0-1.8 1.2-3 3-3s3 1.2 3 3"/><path d="M9 12h6"/></svg>';
  document.body.appendChild(button);

  const panel = document.createElement('div');
  panel.id = 'context-pouch-panel';
  panel.innerHTML = `
    <div class="cp-head"><div class="cp-title">Context Pouch</div><div class="cp-count"></div><button class="cp-icon-btn" data-cp="add" title="Add rule">＋</button><button class="cp-icon-btn" data-cp="close" title="Close">✕</button></div>
    <div class="cp-tools"><input class="cp-search" placeholder="Search rules…"/><div class="cp-chips"></div></div>
    <div class="cp-list"></div>
    <div class="cp-footer">
      <button class="cp-btn cp-primary" data-cp="inject">Inject selected</button>
      <button class="cp-btn cp-secondary" data-cp="reinforce">Reinforce selected</button>
      <div class="cp-footer-meta"><button class="cp-link" data-cp="clear">Clear selection</button><span class="cp-spacer"></span><button class="cp-link" data-cp="reset">Reset defaults</button></div>
    </div>
    <div id="context-pouch-modal"><div class="cp-card"><strong class="cp-modal-title">Add rule</strong><label class="cp-field"><span>Title</span><input data-cp-field="title" maxlength="70"/></label><label class="cp-field"><span>Category</span><input data-cp-field="category" maxlength="30" placeholder="UI, Code, Project…"/></label><label class="cp-field"><span>Rule text injected into Codex</span><textarea data-cp-field="text" maxlength="500"></textarea></label><div class="cp-modal-actions"><button class="cp-btn cp-secondary" data-cp="cancel-edit">Cancel</button><button class="cp-btn cp-primary" data-cp="save-edit">Save rule</button></div></div></div>`;
  document.body.appendChild(panel);

  const toast = document.createElement('div');
  toast.id = 'context-pouch-toast';
  document.body.appendChild(toast);

  const editorCandidates = () => [...document.querySelectorAll('.ProseMirror')].filter(el => {
    const r = el.getBoundingClientRect();
    const cs = getComputedStyle(el);
    return r.width > 120 && r.height > 20 && cs.visibility !== 'hidden' && cs.display !== 'none';
  });
  const findEditor = () => editorCandidates().sort((a,b) => b.getBoundingClientRect().width - a.getBoundingClientRect().width)[0] || null;

  function positionUI() {
    const ed = findEditor();
    if (!ed) { button.style.display = 'none'; return; }
    const r = ed.getBoundingClientRect();
    button.style.display = 'flex';
    const left = Math.min(window.innerWidth - 38, Math.max(8, r.right - 31));
    const top = Math.min(window.innerHeight - 38, Math.max(8, r.top - 35));
    button.style.left = left + 'px';
    button.style.top = top + 'px';
    const rightGap = Math.max(8, window.innerWidth - r.right);
    panel.style.right = rightGap + 'px';
    panel.style.left = 'auto';
    const wantedBottom = Math.max(10, window.innerHeight - r.top + 8);
    panel.style.bottom = wantedBottom + 'px';
    panel.style.top = 'auto';
    requestAnimationFrame(() => {
      if (!panel.classList.contains('open')) return;
      const pr = panel.getBoundingClientRect();
      if (pr.top < 10) { panel.style.top = '10px'; panel.style.bottom = 'auto'; }
    });
    toast.style.right = rightGap + 'px';
    toast.style.bottom = Math.max(10, window.innerHeight - r.top + 8) + 'px';
  }

  function categories() { return ['All', ...new Set(rules.map(r => r.category || 'Other'))]; }
  function render() {
    const chips = panel.querySelector('.cp-chips');
    chips.innerHTML = categories().map(c => '<button class="cp-chip ' + (c===filter?'active':'') + '" data-cat="' + esc(c) + '">' + esc(c) + '</button>').join('');
    const q = search.trim().toLowerCase();
    const shown = rules.filter(r => (filter === 'All' || (r.category || 'Other') === filter) && (!q || (r.title + ' ' + r.text + ' ' + r.category).toLowerCase().includes(q)));
    const list = panel.querySelector('.cp-list');
    list.innerHTML = shown.length ? shown.map(r => `
      <div class="cp-row" data-id="${esc(r.id)}">
        <input type="checkbox" data-cp="toggle" ${selected.has(r.id)?'checked':''}/>
        <label><div class="cp-row-title">${esc(r.title)}</div><div class="cp-row-text">${esc(r.text)}</div><span class="cp-badge">${esc(r.category || 'Other')}</span></label>
        <div class="cp-row-actions"><button class="cp-icon-btn" data-cp="edit" title="Edit">✎</button><button class="cp-icon-btn" data-cp="delete" title="Delete">×</button></div>
      </div>`).join('') : '<div class="cp-empty">No matching rules.</div>';
    const n = selected.size;
    panel.querySelector('.cp-count').textContent = n ? n + ' selected' : '';
    panel.querySelector('[data-cp="inject"]').disabled = !n;
    panel.querySelector('[data-cp="reinforce"]').disabled = !n;
  }

  function showToast(msg) {
    toast.textContent = msg; toast.style.display = 'block'; positionUI();
    clearTimeout(showToast.t); showToast.t = setTimeout(() => toast.style.display = 'none', 1800);
  }

  function setCaretToEnd(el) {
    const sel = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(el); range.collapse(false); sel.removeAllRanges(); sel.addRange(range);
  }

  function insertIntoComposer(text) {
    const ed = findEditor();
    if (!ed) return false;
    try {
      ed.focus(); setCaretToEnd(ed);
      const ok = document.execCommand('insertText', false, text);
      if (ok) return true;
    } catch (_) {}
    return false;
  }

  function buildPayload(mode) {
    const picked = rules.filter(r => selected.has(r.id));
    if (!picked.length) return '';
    const header = mode === 'reinforce' ? '[CONTEXT POUCH — constraint reminder]' : '[CONTEXT POUCH — constraints for this task]';
    const tail = mode === 'reinforce' ? 'Continue the current task while respecting these constraints.' : 'Treat these as hard constraints for the current task.';
    return '\n\n' + header + '\n' + picked.map(r => '- ' + r.text).join('\n') + '\n' + tail;
  }

  function inject(mode) {
    const payload = buildPayload(mode);
    if (!payload) return;
    if (insertIntoComposer(payload)) {
      showToast((mode === 'reinforce' ? 'Reinforced ' : 'Injected ') + selected.size + ' rule' + (selected.size===1?'':'s'));
      panel.classList.remove('open');
    } else {
      navigator.clipboard?.writeText(payload).then(() => showToast('Composer unavailable — rules copied')).catch(() => showToast('Could not access Codex composer'));
    }
  }

  function openEditor(id) {
    editingId = id || null;
    const r = id ? rules.find(x => x.id === id) : null;
    panel.querySelector('.cp-modal-title').textContent = r ? 'Edit rule' : 'Add rule';
    panel.querySelector('[data-cp-field="title"]').value = r?.title || '';
    panel.querySelector('[data-cp-field="category"]').value = r?.category || '';
    panel.querySelector('[data-cp-field="text"]').value = r?.text || '';
    panel.querySelector('#context-pouch-modal').classList.add('open');
    setTimeout(() => panel.querySelector('[data-cp-field="title"]').focus(), 30);
  }
  function closeEditor() { editingId = null; panel.querySelector('#context-pouch-modal').classList.remove('open'); }
  function saveEditor() {
    const title = panel.querySelector('[data-cp-field="title"]').value.trim();
    const category = panel.querySelector('[data-cp-field="category"]').value.trim() || 'Other';
    const text = panel.querySelector('[data-cp-field="text"]').value.trim();
    if (!title || !text) { showToast('Title and rule text are required'); return; }
    if (editingId) {
      const idx = rules.findIndex(r => r.id === editingId);
      if (idx >= 0) rules[idx] = {...rules[idx], title, category, text};
    } else {
      rules.push({id:uid(), title, category, text});
    }
    save(); closeEditor(); render();
  }

  button.addEventListener('click', (e) => { e.stopPropagation(); panel.classList.toggle('open'); render(); positionUI(); });
  panel.querySelector('.cp-search').addEventListener('input', (e) => { search = e.target.value; render(); });
  panel.addEventListener('click', (e) => {
    const cat = e.target.closest('[data-cat]');
    if (cat) { filter = cat.getAttribute('data-cat'); render(); return; }
    const act = e.target.closest('[data-cp]');
    if (!act) return;
    const action = act.getAttribute('data-cp');
    const row = act.closest('.cp-row');
    const id = row?.getAttribute('data-id');
    if (action === 'close') panel.classList.remove('open');
    else if (action === 'add') openEditor(null);
    else if (action === 'inject') inject('inject');
    else if (action === 'reinforce') inject('reinforce');
    else if (action === 'clear') { selected.clear(); saveSelected(); render(); }
    else if (action === 'reset') {
      if (confirm('Reset Context Pouch rules to the defaults?')) { rules = DEFAULT_RULES.map(r => ({...r})); selected.clear(); save(); saveSelected(); filter='All'; search=''; panel.querySelector('.cp-search').value=''; render(); }
    }
    else if (action === 'edit' && id) openEditor(id);
    else if (action === 'delete' && id) {
      const r = rules.find(x => x.id === id);
      if (confirm('Delete “' + (r?.title || 'this rule') + '”?')) { rules = rules.filter(x => x.id !== id); selected.delete(id); save(); saveSelected(); render(); }
    }
    else if (action === 'cancel-edit') closeEditor();
    else if (action === 'save-edit') saveEditor();
  });
  panel.addEventListener('change', (e) => {
    if (e.target.getAttribute('data-cp') !== 'toggle') return;
    const id = e.target.closest('.cp-row')?.getAttribute('data-id');
    if (!id) return;
    e.target.checked ? selected.add(id) : selected.delete(id); saveSelected(); render();
  });
  document.addEventListener('keydown', (e) => { if (e.key === 'Escape') { if (panel.querySelector('#context-pouch-modal').classList.contains('open')) closeEditor(); else panel.classList.remove('open'); } });

  const mo = new MutationObserver(() => positionUI());
  mo.observe(document.documentElement, {subtree:true, childList:true});
  window.addEventListener('resize', positionUI);
  setInterval(positionUI, 1000);
  render(); positionUI();
})();
