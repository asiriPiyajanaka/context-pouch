"use strict";
const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");
const root = path.resolve(__dirname, "..");
for (const dir of ["", "media", "scripts", "test"]) {
  for (const name of fs.readdirSync(path.join(root, dir))) {
    if (!/\.(?:js|cjs)$/.test(name)) continue;
    const result = spawnSync(process.execPath, ["--check", path.join(root, dir, name)], { stdio: "inherit" });
    if (result.error) throw result.error;
    if (result.status !== 0) process.exit(result.status || 1);
  }
}
console.log("All source, script, and test syntax checks passed.");
