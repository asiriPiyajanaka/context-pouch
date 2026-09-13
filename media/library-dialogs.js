(() => {
  "use strict";
  window.createPouchDialogs = ({modal, getState, request, status}) => {
    const esc = window.PouchView.esc;
    let pending = false;
    const value = name => modal.querySelector(`[name="${name}"]`).value.trim();
    function show(title, body, onSave, label="Save", extra="") {
      const revision = getState().revision;
      modal.innerHTML = `<form><h2>${esc(title)}</h2>${body}<p class="dialog-error" role="alert"></p><div class="dialog-actions">${extra}<button type="button" data-cancel>Cancel</button><button class="primary" type="submit">${esc(label)}</button></div></form>`;
      if (!modal.open) modal.showModal();
      modal.querySelector("input,select,button")?.focus();
      modal.querySelector("form").onsubmit = async e => {
        e.preventDefault();
        if (pending) return;
        pending = true;
        const submit = modal.querySelector('[type="submit"]'); submit.disabled = true;
        try { await onSave(revision); modal.close(); }
        catch (e) { modal.querySelector(".dialog-error").textContent = e.message; }
        finally { pending = false; submit.disabled = false; }
      };
    }
    modal.addEventListener("click", e=>{if(e.target.closest("[data-cancel]") && !pending) modal.close();});
    modal.addEventListener("cancel", e=>{if(pending)e.preventDefault();});
    const scopes = chosen => getState().scopes.filter(s=>s.writable).map(s=>`<option value="${s.id}" ${s.id===chosen ? "selected" : ""}>${esc(s.id === "personal" ? "Global" : s.name)}</option>`).join("");
    function rule(rule, chosen = "project") {
      chosen = rule?.scope || chosen;
      show(rule ? "Edit rule" : "Create rule", `<label>Library<select name="scope" ${rule ? "disabled" : ""}>${scopes(chosen)}</select></label><label>Title<input name="title" required maxlength="100" value="${esc(rule?.title)}"></label><label>Category<input name="category" required maxlength="50" value="${esc(rule?.category || "Code")}"></label><label>Instructions<textarea name="text" required maxlength="5000">${esc(rule?.text)}</textarea></label><label>Related rules · same library</label><div class="link-picker"></div>`, async revision=>{
        await request("saveRule",{revision,scope:value("scope"),rule:{id:rule?.id,title:value("title"),category:value("category"),text:value("text"),related:[...modal.querySelectorAll('[name="related"]:checked')].map(x=>x.value)}});
        status("Rule saved.");
      }, "Save rule", rule ? '<button type="button" class="danger" data-delete>Delete</button>' : "");
      const renderLinks = ()=>{modal.querySelector(".link-picker").innerHTML=getState().rules.filter(r=>r.scope===value("scope") && r.id!==rule?.id).map(r=>`<label><input type="checkbox" name="related" value="${esc(r.id)}" ${rule?.related.includes(r.id) ? "checked" : ""}>${esc(r.title)}</label>`).join("");};
      renderLinks(); modal.querySelector('[name="scope"]').onchange=renderLinks;
      if(rule)modal.querySelector("[data-delete]").onclick=()=>remove("rule",rule);
    }
    function remove(kind,item) {
      show(`Delete ${kind}?`,`<p>Delete “${esc(item.title)}”? ${kind === "rule" ? "It will also disappear from active selections, presets, and relationships." : ""}</p>`,revision=>request(kind === "rule" ? "deleteRule" : "deletePreset",{revision,scope:item.scope,id:item.id}),"Delete");
    }
    function preset(preset) {
      const state=getState(), selected=state.rules.filter(r=>state.selected.includes(r.key));
      const scope=preset?.scope || selected[0]?.scope;
      if(!preset && (!selected.length || new Set(selected.map(r=>r.scope)).size!==1)) {status("Select rules from one library to create a preset.");return;}
      const ids=preset?.ruleIds || selected.map(r=>r.id);
      show(preset ? "Edit preset" : "Save task preset",`<label>Name<input name="title" required maxlength="100" value="${esc(preset?.title)}"></label><div class="link-picker">${state.rules.filter(r=>r.scope===scope).map(r=>`<label><input type="checkbox" name="member" value="${esc(r.id)}" ${ids.includes(r.id)?"checked":""}>${esc(r.title)}</label>`).join("")}</div>`,revision=>request("savePreset",{revision,scope,id:preset?.id,title:value("title"),ruleIds:[...modal.querySelectorAll('[name="member"]:checked')].map(x=>x.value)}),"Save preset",preset?'<button type="button" class="danger" data-delete>Delete</button>':"");
      if(preset)modal.querySelector("[data-delete]").onclick=()=>remove("preset",preset);
    }
    function pack(action) {
      show(action === "import" ? "Import rule pack" : "Export rule pack",`<label>Library<select name="scope">${scopes(getState().project ? "project" : "personal")}</select></label>${action === "export" ? '<label>Include<select name="include"><option value="all">Whole library</option><option value="selected">Selected rules and complete presets</option></select></label>' : '<p>You will review duplicates before importing into your local library.</p>'}`,()=>request(action,{scope:value("scope"),selectedOnly:action === "export" && value("include")==="selected"}),"Choose file…");
    }
    function relationship(kind, from) {
      const candidates=getState().rules.filter(r=>r.key!==from.key && (kind!=="override" || r.scope==="personal"));
      if(!candidates.length) {status("Add another rule first.");return;}
      show(kind === "override" ? "Override a global rule" : "Confirm a conflict",`<p>${kind === "override" ? "When this project rule is selected, the chosen global rule will be excluded from instructions." : "Mark instructions that should not be used together. ConPin will ask you to resolve an active conflict before insertion."}</p><label>Rule<select name="target">${candidates.map(r=>`<option value="${esc(r.key)}">${esc(r.title)} · ${r.scope==="personal"?"Global":"Project"}</option>`).join("")}</select></label>`,revision=>request("setRelationship",{revision,kind,from:from.key,to:value("target"),enabled:true}),"Confirm relationship");
    }
    function preview() {
      const state=getState();
      show("Preview active instructions",`${state.activeConflicts.length ? '<p class="notice">Selected rules have confirmed conflicts. Deselect one side before inserting.</p>' : ""}<p class="muted">Project rules first. Disabled and overridden global rules are excluded.</p><pre>${esc(state.instructions || "No rules selected.")}</pre>`,async()=>{},"Done");
    }
    function defaults() {
      show("Save project defaults",'<p>Remember the current saved rule selection for this project. Unselected global defaults will be disabled here. Draft-only edits in the composer are not saved.</p>',revision=>request("saveDefaults",{revision}),"Save project defaults");
    }
    function applyPreset(preset) {
      show("Apply preset",`<p>Replace the current selection with “${esc(preset.title)}”? Saved defaults stay unchanged.</p>`,revision=>request("select",{revision,keys:preset.ruleIds.map(id=>window.ContextPouchModel.key(preset.scope,id))}),"Apply preset");
    }
    return {rule,preset,pack,relationship,preview,defaults,applyPreset};
  };
})();
