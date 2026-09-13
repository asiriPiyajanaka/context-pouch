"use strict";
const { recover } = require("../recovery");
const args = process.argv.slice(2);
if (args.length < 1 || args.length > 2 || (args.length === 2 && args[1] !== "--apply")) {
  console.error('Usage: npm run recover -- "/path/to/openai.chatgpt-version" [--apply]');
  process.exitCode = 1;
} else {
  try {
    const apply = args[1] === "--apply";
    const files = recover(args[0], apply);
    console.log(`${apply ? "Restored" : "Validated"} ${files.length} Codex bundle(s).`);
    for (const file of files) console.log(file);
    console.log(apply ? "Start VS Code again. Your rule libraries were kept." : "Close all VS Code windows, then repeat with --apply to restore these files.");
  } catch (error) {
    console.error(`Recovery stopped: ${error.message}`);
    process.exitCode = 1;
  }
}
