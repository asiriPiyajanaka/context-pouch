"use strict";
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

// Snapshot the old database, including committed WAL writes, without modifying it.
// Keep legacy filenames and JSON formats so project rule packs remain compatible.
function migrateLegacyStorage(destination) {
  const previous = path.join(path.dirname(destination), "asiri-local.context-pouch-codex");
  if (previous === destination) return false;
  const target = path.join(destination, "pouch.sqlite");
  if (fs.existsSync(target)) return false;
  const source = path.join(previous, "pouch.sqlite");
  if (!fs.existsSync(source)) {
    const json = path.join(previous, "rules.json"), output = path.join(destination, "rules.json");
    if (!fs.existsSync(json) || fs.existsSync(output)) return false;
    fs.mkdirSync(destination, { recursive: true });
    fs.copyFileSync(json, output, fs.constants.COPYFILE_EXCL);
    return true;
  }
  const { DatabaseSync } = require("node:sqlite");
  const db = new DatabaseSync(source, { readOnly: true });
  const temporary = path.join(destination, `migration-${crypto.randomUUID()}.sqlite`);
  try {
    if (db.prepare("PRAGMA user_version").get().user_version !== 1)
      throw new Error("The previous ConPin/Context Pouch database has an unsupported version. Export rule packs from the previous extension first.");
    if (db.prepare("PRAGMA integrity_check").get().integrity_check !== "ok")
      throw new Error("The previous rule database failed its integrity check. Restore a backup before migrating.");
    fs.mkdirSync(destination, { recursive: true });
    db.prepare("VACUUM INTO ?").run(temporary);
    // Exclusive creation prevents two VS Code windows overwriting each other's data.
    fs.linkSync(temporary, target);
    return true;
  } catch (error) {
    if (error.code === "EEXIST") return false;
    throw error;
  } finally {
    db.close();
    fs.rmSync(temporary, { force: true });
  }
}
module.exports = { migrateLegacyStorage };
