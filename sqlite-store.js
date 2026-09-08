"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const M = require("./model");

class SqliteStore {
  constructor(file) {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    let DatabaseSync;
    try { ({ DatabaseSync } = require("node:sqlite")); }
    catch (_) { throw new Error("Pouch requires VS Code 1.101 or newer with built-in SQLite. Update VS Code and reload."); }
    this.db = new DatabaseSync(file);
    if (this.db.prepare("PRAGMA user_version").get().user_version > 1) {
      this.db.close();
      throw new Error("This library was created by a newer Pouch version. Update Pouch before opening it.");
    }
    this.db.exec(`PRAGMA busy_timeout=5000; PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
      CREATE TABLE IF NOT EXISTS metadata (key TEXT PRIMARY KEY, value TEXT NOT NULL);
      INSERT OR IGNORE INTO metadata VALUES ('revision', '0');
      CREATE TABLE IF NOT EXISTS projects (id TEXT PRIMARY KEY, uri TEXT UNIQUE NOT NULL, name TEXT NOT NULL);
      CREATE TABLE IF NOT EXISTS libraries (id TEXT PRIMARY KEY, migrated INTEGER NOT NULL DEFAULT 1);
      CREATE TABLE IF NOT EXISTS rules (library TEXT NOT NULL REFERENCES libraries(id), id TEXT NOT NULL,
        title TEXT NOT NULL, category TEXT NOT NULL, text TEXT NOT NULL, details TEXT NOT NULL,
        PRIMARY KEY (library,id));
      CREATE TABLE IF NOT EXISTS presets (library TEXT NOT NULL REFERENCES libraries(id), id TEXT NOT NULL,
        title TEXT NOT NULL, members TEXT NOT NULL, PRIMARY KEY (library,id));
      CREATE TABLE IF NOT EXISTS preferences (project TEXT PRIMARY KEY, data TEXT NOT NULL);
      PRAGMA user_version=1;`);
  }
  revision() { return this.db.prepare("SELECT value FROM metadata WHERE key='revision'").get().value; }
  transaction(fn, expected) {
    this.db.exec("BEGIN IMMEDIATE");
    try {
      if (expected !== undefined && expected !== this.revision())
        throw new Error("The library changed elsewhere. Refresh and try again.");
      const result = fn();
      this.db.exec("UPDATE metadata SET value=CAST(value AS INTEGER)+1 WHERE key='revision'; COMMIT;");
      return result;
    } catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }
  has(id) { return Boolean(this.db.prepare("SELECT id FROM libraries WHERE id=?").get(id)); }
  initialize(id, pack, project, preferences) {
    if (this.has(id)) return;
    this.transaction(() => {
      if (this.has(id)) return;
      this.db.prepare("INSERT INTO libraries(id) VALUES (?)").run(id);
      if (project) this.db.prepare("INSERT OR IGNORE INTO projects VALUES (?,?,?)")
        .run(crypto.randomUUID(), project.uri, project.name);
      this.write(id, pack);
      if (preferences) this.setPreferences(id, preferences);
    });
  }
  read(id) {
    if (!this.has(id)) return M.empty();
    const rules = this.db.prepare("SELECT * FROM rules WHERE library=? ORDER BY rowid").all(id)
      .map(r => ({ ...JSON.parse(r.details), id:r.id, title:r.title, category:r.category, text:r.text }));
    const presets = this.db.prepare("SELECT * FROM presets WHERE library=? ORDER BY rowid").all(id)
      .map(p => ({id:p.id, title:p.title, ruleIds:JSON.parse(p.members)}));
    return M.validate({version:1, rules, presets});
  }
  write(id, input) {
    const pack = M.validate(input);
    this.db.prepare("DELETE FROM rules WHERE library=?").run(id);
    this.db.prepare("DELETE FROM presets WHERE library=?").run(id);
    const add = this.db.prepare("INSERT INTO rules VALUES (?,?,?,?,?,?)");
    for (const {id:ruleId,title,category,text,...details} of pack.rules)
      add.run(id,ruleId,title,category,text,JSON.stringify(details));
    const preset = this.db.prepare("INSERT INTO presets VALUES (?,?,?,?)");
    for (const p of pack.presets) preset.run(id,p.id,p.title,JSON.stringify(p.ruleIds));
  }
  preferences(id) {
    const row = this.db.prepare("SELECT data FROM preferences WHERE project=?").get(id);
    return row ? JSON.parse(row.data) : { selected:null, defaults:null, disabled:[], overrides:[], conflicts:[] };
  }
  setPreferences(id, data) {
    this.db.prepare("INSERT INTO preferences VALUES (?,?) ON CONFLICT(project) DO UPDATE SET data=excluded.data")
      .run(id, JSON.stringify(data));
  }
  removeReferences(library, key) {
    const rows = library === "@global"
      ? this.db.prepare("SELECT * FROM preferences").all()
      : this.db.prepare("SELECT * FROM preferences WHERE project=?").all(library);
    for (const row of rows) {
      const prefs = JSON.parse(row.data);
      for (const field of ["selected", "defaults", "disabled"])
        if (Array.isArray(prefs[field])) prefs[field] = prefs[field].filter(k=>k!==key);
      for (const field of ["overrides", "conflicts"])
        prefs[field] = (prefs[field] || []).filter(pair=>!pair.includes(key));
      this.setPreferences(row.project, prefs);
    }
  }
  snapshot(fn) {
    this.db.exec("BEGIN");
    try { const result = fn(); this.db.exec("COMMIT"); return result; }
    catch (e) { this.db.exec("ROLLBACK"); throw e; }
  }
  close() { this.db.close(); }
}
module.exports = { SqliteStore };
