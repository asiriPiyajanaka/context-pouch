"use strict";
const vscode = require("vscode");
const crypto = require("crypto");
const M = require("./model");
const { SqliteStore } = require("./sqlite-store");
const { resolve } = require("./rule-state");
const files = require("./pack-files");
const { graphSnapshot } = require("./graph-snapshot");
const GLOBAL = "@global";
class Library {
  constructor(context, changed) {
    this.context = context;
    this.changed = changed;
    this.queue = Promise.resolve();
    this.personalUri = vscode.Uri.joinPath(context.globalStorageUri, "rules.json");
    this.store = new SqliteStore(vscode.Uri.joinPath(context.globalStorageUri, "pouch.sqlite").fsPath);
  }
  roots() { return vscode.workspace.workspaceFolders || []; }
  async read(uri, fallback) { return files.read(vscode, uri, fallback); }
  async load() {
    const roots = this.roots();
    const active = roots.find(r => r.uri.toString() === this.context.workspaceState.get("contextPouch.project")) || roots[0];
    this.projectId = active?.uri.toString() || "";
    this.scopes = [{id:"personal", name:"Global", uri:this.personalUri, writable:true, storage:GLOBAL}];
    if (active) this.scopes.unshift({id:"project", name:active.name,
      uri:vscode.Uri.joinPath(active.uri,".context-pouch","rules.json"), writable:vscode.workspace.isTrusted, storage:this.projectId});
    for (const scope of this.scopes) {
      if (!this.store.has(scope.storage)) {
        const pack = await this.read(scope.uri, M.empty);
        const legacy = this.context.workspaceState.get("contextPouch.selection:" + this.projectId);
        this.store.initialize(scope.storage, pack,
          scope.id === "project" ? {uri:this.projectId, name:scope.name} : null,
          scope.id === "project" ? {selected:legacy ?? null, defaults:legacy ?? null, disabled:[], overrides:[], conflicts:[]} : null);
      }
    }
    this.store.snapshot(() => this.readStoredState());
    const state = this.snapshot();
    this.selected = state.selected;
    return state;
  }
  readStoredState() {
    this.packs = Object.fromEntries(this.scopes.map(s => [s.id, this.store.read(s.storage)]));
    this.preferences = this.store.preferences(this.projectId || "@no-project");
    this.globalDefaults = this.store.preferences(GLOBAL).defaults || [];
    this.dbRevision = this.store.revision();
    this.revision = `${this.dbRevision}:${this.projectId}`;
  }
  snapshot() {
    const rules = this.scopes.flatMap(s => this.packs[s.id].rules.map(r => ({...r, scope:s.id, key:M.key(s.id,r.id)})));
    const resolution = resolve(rules, this.preferences, this.globalDefaults);
    return {
      revision:this.revision, project:this.projectId,
      projects:this.roots().map(r => ({id:r.uri.toString(),name:r.name})),
      scopes:this.scopes.map(({id,name,writable})=>({id,name,writable})),
      presets:this.scopes.flatMap(s => this.packs[s.id].presets.map(p=>({...p,scope:s.id,key:M.key(s.id,p.id)}))),
      ...resolution,
    };
  }
  scope(id) {
    const scope = this.scopes.find(s=>s.id === id);
    if (!scope) throw new Error("Choose an available library.");
    if (!scope.writable) throw new Error("Trust this workspace before changing project rules.");
    return scope;
  }
  validKeys(keys) {
    if (!Array.isArray(keys) || keys.length > 4000 || keys.some(k=>typeof k !== "string")) throw new Error("Invalid rule selection.");
    const valid = new Set(this.snapshot().rules.map(r=>r.key));
    return [...new Set(keys.filter(k=>valid.has(k)))];
  }
  preferencesAction(action, data) {
    const prefs = structuredClone(this.preferences), state = this.snapshot();
    const selected = new Set(state.wanted);
    if (action === "select") prefs.selected = this.validKeys(data.keys);
    if (action === "toggle") {
      if (!state.rules.some(r=>r.key === data.key)) throw new Error("Rule no longer exists.");
      const include = typeof data.checked === "boolean" ? data.checked : !selected.has(data.key);
      include ? selected.add(data.key) : selected.delete(data.key);
      prefs.selected = [...selected];
    }
    if (action === "saveDefaults") {
      this.scope("project");
      prefs.defaults = [...state.selected];
      prefs.disabled = [...new Set([...prefs.disabled, ...this.globalDefaults.filter(k=>!state.selected.includes(k))])];
    }
    if (action === "restoreDefaults") prefs.selected = null;
    if (action === "disableGlobal") {
      this.scope("project");
      if (!state.rules.some(r=>r.key === data.key && r.scope === "personal")) throw new Error("Choose a global rule.");
      const disabled = new Set(prefs.disabled);
      data.disabled ? disabled.add(data.key) : disabled.delete(data.key);
      prefs.disabled = [...disabled];
    }
    if (action === "setDefault") {
      const rule = state.rules.find(r=>r.key === data.key);
      if (!rule) throw new Error("Rule no longer exists.");
      if (rule.scope === "personal") {
        const global = this.store.preferences(GLOBAL), defaults = new Set(global.defaults || []);
        data.enabled ? defaults.add(data.key) : defaults.delete(data.key);
        this.store.setPreferences(GLOBAL, {...global, defaults:[...defaults]});
        return;
      }
      this.scope("project");
      const defaults = new Set(state.defaults);
      data.enabled ? defaults.add(data.key) : defaults.delete(data.key);
      prefs.defaults = [...defaults];
    }
    if (action === "setRelationship") {
      this.scope("project");
      const a = state.rules.find(r=>r.key === data.from), b = state.rules.find(r=>r.key === data.to);
      if (!a || !b || a.key === b.key) throw new Error("Choose two different existing rules.");
      if (!["override","conflict"].includes(data.kind)) throw new Error("Unknown relationship.");
      if (data.kind === "override" && (a.scope !== "project" || b.scope !== "personal")) throw new Error("Only a project rule can override a global rule.");
      if (data.kind === "override" && b.appliesTo && b.appliesTo !== "." && a.appliesTo !== b.appliesTo)
        throw new Error("An override must have the same folder scope as the global rule.");
      if (data.kind === "override" && a.appliesTo && a.appliesTo !== "." && (b.appliesTo || ".") !== a.appliesTo)
        throw new Error("A folder-specific rule cannot override a project-wide global rule.");
      const field = data.kind === "override" ? "overrides" : "conflicts";
      prefs[field] = prefs[field].filter(([x,y])=>!((x===a.key && y===b.key) || (data.kind === "conflict" && x===b.key && y===a.key)));
      if (data.enabled) prefs[field].push([a.key,b.key]);
    }
    this.store.setPreferences(this.projectId || "@no-project", prefs);
  }
  editPack(action, data) {
    const scope = this.scope(data.scope);
    let pack = structuredClone(this.packs[scope.id]);
    if (["saveGenerated","importReviewed"].includes(action) && data.project !== this.projectId)
      throw new Error("Active project changed. Try again for the current project.");
    if (action === "saveRule") {
      const id = data.rule?.id || crypto.randomUUID(), previous = pack.rules.find(r=>r.id === id);
      const rule = {...previous, id, title:data.rule?.title, category:data.rule?.category,
        text:data.rule?.text, related:data.rule?.related || []};
      if (previous) pack.rules[pack.rules.indexOf(previous)] = rule;
      else pack.rules.push(rule);
    } else if (action === "saveGenerated") {
      pack = M.mergePack(pack,{version:1,rules:data.rules,presets:[]}).pack;
    } else if (action === "importReviewed") {
      pack = M.mergePack(pack,data.incoming,data.replace === true).pack;
    } else if (action === "deleteRule") {
      pack.rules = pack.rules.filter(r=>r.id !== data.id).map(r=>({...r,related:r.related.filter(id=>id !== data.id)}));
      pack.presets = pack.presets.map(p=>({...p,ruleIds:p.ruleIds.filter(id=>id !== data.id)}));
      this.store.removeReferences(scope.storage,M.key(scope.id,data.id));
    } else if (action === "savePreset") {
      const preset = {id:data.id || crypto.randomUUID(),title:data.title,ruleIds:data.ruleIds};
      const index = pack.presets.findIndex(p=>p.id === preset.id);
      if (index < 0) pack.presets.push(preset); else pack.presets[index] = preset;
    } else if (action === "deletePreset") pack.presets = pack.presets.filter(p=>p.id !== data.id);
    else throw new Error("Unknown library action.");
    this.store.write(scope.storage, pack);
  }
  dispatch(action, data = {}) {
    const job = this.queue.then(async () => {
      await this.load();
      if (action === "state") return this.snapshot();
      if (action === "graphState") return {graph:this.store.snapshot(()=>{
        this.readStoredState();
        return graphSnapshot(this.store,this.snapshot(),this.roots().map(r=>({id:r.uri.toString(),name:r.name})));
      })};
      if (data.revision && data.revision !== this.revision) throw new Error("The library changed elsewhere. Refresh and try again.");
      if (action === "project") {
        if (!this.roots().some(r=>r.uri.toString() === data.id)) throw new Error("Project is no longer open.");
        await this.context.workspaceState.update("contextPouch.project",data.id);
      } else if (action === "migrate") {
        if (!this.context.globalState.get("contextPouch.migratedV1",false)) {
          this.store.transaction(()=>this.store.write(GLOBAL,M.mergePack(this.packs.personal,{version:1,rules:data.rules,presets:[]}).pack),this.dbRevision);
          await this.context.globalState.update("contextPouch.migratedV1",true);
          await this.load();
          if (Array.isArray(data.selected)) this.store.transaction(()=>this.preferencesAction("select",{keys:data.selected.map(id=>M.key("personal",id))}),this.dbRevision);
        }
      } else this.store.transaction(() => {
        if (["select","toggle","saveDefaults","restoreDefaults","setDefault","disableGlobal","setRelationship"].includes(action)) this.preferencesAction(action,data);
        else this.editPack(action,data);
      },this.dbRevision);
      const state = await this.load();
      this.changed(state);
      return state;
    });
    this.queue = job.catch(()=>{});
    return job;
  }
  importPack(scopeId, shared) { return files.importPack(this,vscode,scopeId,shared); }
  exportPack(scopeId, selectedOnly, shared) { return files.exportPack(this,vscode,scopeId,selectedOnly,shared); }
  dispose() { this.store.close(); }
}
module.exports = { Library };
