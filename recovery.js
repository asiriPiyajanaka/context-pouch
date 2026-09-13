"use strict";
const fs = require("node:fs");
const path = require("node:path");
const patcher = require("./patcher");
const BACKUP = ".context-pouch-backup";

function recoveryFiles(directory) {
  const root = fs.realpathSync(directory);
  const manifest = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8"));
  if (manifest.publisher !== "openai" || manifest.name !== "chatgpt")
    throw new Error("Choose the installed openai.chatgpt extension directory.");
  const files = [];
  function visit(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const file = path.join(dir, entry.name);
      if (entry.isSymbolicLink()) throw new Error("Recovery refuses symbolic links. Reinstall Codex to recover this installation.");
      if (entry.isDirectory()) visit(file);
      else if (entry.isFile() && entry.name.endsWith(BACKUP)) {
        const target = file.slice(0, -BACKUP.length);
        if (!target.endsWith(".js") || !fs.existsSync(target)) throw new Error("A backup has no matching JavaScript bundle. Reinstall Codex to recover.");
        files.push(target);
      }
    }
  }
  visit(root);
  for (const file of files) patcher.original(file);
  return files;
}
function recover(directory, apply = false) {
  const files = recoveryFiles(directory);
  if (apply) for (const file of files) patcher.restoreTarget(file);
  return files;
}
module.exports = { recover };
