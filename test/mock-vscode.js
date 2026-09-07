"use strict";
const fs = require("fs/promises"),
  path = require("path"),
  vm = require("vm");
const { createRequire } = require("module");
function uri(file) {
  return {
    fsPath: file,
    path: file,
    toString() {
      return "file://" + file;
    },
  };
}
function state() {
  const data = new Map();
  return {
    get(key, fallback) {
      return data.has(key) ? data.get(key) : fallback;
    },
    async update(key, value) {
      data.set(key, value);
    },
  };
}
function environment(root) {
  const context = {
    globalStorageUri: uri(path.join(root, "personal")),
    globalState: state(),
    workspaceState: state(),
  };
  const events = [],
    answers = [],
    vscode = {
      Uri: {
        file: uri,
        joinPath(base, ...parts) {
          return uri(path.join(base.fsPath, ...parts));
        },
      },
      workspace: {
        isTrusted: true,
        workspaceFolders: [
          { name: "Demo project", uri: uri(path.join(root, "project")) },
          { name: "Second project", uri: uri(path.join(root, "second")) },
        ],
        fs: {
          readFile: (u) => fs.readFile(u.fsPath),
          writeFile: (u, data) => fs.writeFile(u.fsPath, data),
          createDirectory: (u) => fs.mkdir(u.fsPath, { recursive: true }),
          rename: (a, b) => fs.rename(a.fsPath, b.fsPath),
          delete: (u) => fs.unlink(u.fsPath),
        },
      },
      window: {
        async showOpenDialog() {
          return answers.shift();
        },
        async showSaveDialog() {
          return answers.shift();
        },
        async showInformationMessage(...args) {
          events.push(args);
          return answers.shift();
        },
      },
    };
  return { context, vscode, events, answers };
}
function load(file, vscode) {
  const abs = path.resolve(__dirname, "..", file),
    native = createRequire(abs),
    module = { exports: {} };
  const fn = vm.runInThisContext(
    `(function(require,module,exports,__dirname){${require("fs").readFileSync(abs, "utf8")}\n})`,
    { filename: abs },
  );
  fn(
    (name) => (name === "vscode" ? vscode : native(name)),
    module,
    module.exports,
    path.dirname(abs),
  );
  return module.exports;
}
module.exports = { environment, load, uri };
