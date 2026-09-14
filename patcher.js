"use strict";
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const sessionPatch = require("./session-patch");
const SESSION = "/* CONTEXT_POUCH_SESSION */";
const START = "/* CONTEXT_POUCH_START */",
  END = "/* CONTEXT_POUCH_END */";
const BOOT = "/* CONTEXT_POUCH_BOOT */",
  BOOT_END = "/* CONTEXT_POUCH_BOOT_END */";
const HOST = "/* CONTEXT_POUCH_HOST */",
  HOST_END = "/* CONTEXT_POUCH_HOST_END */";
const BACKUP = ".context-pouch-backup",
  META = ".context-pouch-meta.json";
const read = (name) => fs.readFileSync(path.join(__dirname, name), "utf8");
const hash = (value) => crypto.createHash("sha256").update(value).digest("hex");
function strip(src, start, end) {
  const a = src.indexOf(start),
    b = src.indexOf(end);
  if (a < 0) return src;
  if (b < a)
    throw new Error(
      "Incomplete ConPin patch; refusing to overwrite the bundle.",
    );
  return src.slice(0, a) + src.slice(b + end.length);
}
function stripExistingPatch(src) {
  return strip(src, START, END);
}
function runtimeSource() {
  const logo = "data:image/png;base64," + fs.readFileSync(path.join(__dirname, "media/logo.png")).toString("base64");
  return `\n${START}\nwindow.__contextPouchLogo = ${JSON.stringify(logo)};\n${read("model.js")}\n${read("client.js")}\n${read("session-ui.js")}\n${read("task-draft.js")}\n${read("task-views.js")}\n${read("task-ui.js")}\n${read("advanced-ui.js")}\n(() => { const style = document.createElement("style"); style.id = "context-pouch-advanced-style"; style.textContent = ${JSON.stringify(read("media/pouch-theme.css") + "\n" + read("advanced-ui.css"))}; document.documentElement.appendChild(style); })();\n${read("runtime.js")}\n${END}\n`;
}
function resolveTargets(ext) {
  if (!ext)
    throw new Error(
      "OpenAI Codex extension (openai.chatgpt) is not installed.",
    );
  const dir = path.join(ext.extensionPath, "webview");
  const html = fs.readFileSync(path.join(dir, "index.html"), "utf8");
  const matches = [
    ...html.matchAll(/(?:\.\/)?assets\/(index-[^"'?#]+\.js)/g),
  ].map((m) => path.join(dir, "assets", m[1]));
  const candidates = [...new Set(matches.filter((f) => fs.existsSync(f)))];
  if (candidates.length !== 1)
    throw new Error(
      "Cannot identify a unique Codex webview entry in index.html. This Codex build is unsupported.",
    );
  const host = path.resolve(
    ext.extensionPath,
    ext.packageJSON.main || "out/extension.js",
  );
  if (!host.startsWith(ext.extensionPath + path.sep) || !fs.existsSync(host))
    throw new Error("Unsupported Codex host entry.");
  const acquisition = /\bacquireVsCodeApi\(\)/;
  const bridgeFiles = fs
    .readdirSync(path.join(dir, "assets"))
    .filter((name) => name.endsWith(".js"))
    .map((name) => path.join(dir, "assets", name))
    .filter((file) => acquisition.test(fs.readFileSync(file, "utf8")));
  if (bridgeFiles.length !== 1)
    throw new Error(
      "Cannot identify a unique Codex API acquisition chunk. This Codex build is unsupported.",
    );
  const sessions = fs.readdirSync(path.join(dir, "assets"))
    .filter(name => name.endsWith(".js"))
    .map(name => path.join(dir, "assets", name))
    .filter(file => sessionPatch.inspect(fs.readFileSync(fs.existsSync(file + BACKUP) ? file + BACKUP : file, "utf8")));
  return { webview: candidates[0], host, bridge: bridgeFiles[0],
    ...(sessions.length === 1 ? { session: sessions[0] } : {}) };
}
function original(file) {
  const live = fs.readFileSync(file, "utf8");
  if (!fs.existsSync(file + BACKUP)) {
    if ([START, HOST, BOOT, SESSION].some((m) => live.includes(m)))
      throw new Error(
        "A patched bundle is missing its backup. Restore Codex before installing.",
      );
    return { live, pristine: live };
  }
  const pristine = fs.readFileSync(file + BACKUP, "utf8");
  if (fs.existsSync(file + META)) {
    const meta = JSON.parse(fs.readFileSync(file + META, "utf8"));
    if (
      hash(pristine) !== meta.original ||
      (hash(live) !== meta.patched && live !== pristine)
    )
      throw new Error(
        "Codex bundle or backup changed outside ConPin. Refusing to overwrite it.",
      );
  } else if (
    live !== pristine &&
    stripExistingPatch(live).trimEnd() !== pristine.trimEnd()
  ) {
    throw new Error("The existing backup does not match this Codex bundle.");
  }
  return { live, pristine };
}
function builds(targets) {
  const plan = new Map();
  for (const file of new Set(Object.values(targets))) {
    const base = original(file);
    plan.set(file, { file, ...base, next: base.pristine });
  }
  const host = plan.get(targets.host),
    webview = plan.get(targets.webview),
    bridge = plan.get(targets.bridge);
  const requires = /\brequire\(["']vscode["']\)/g;
  if (
    !requires.test(host.pristine) ||
    !host.pristine.includes("registerWebviewViewProvider") ||
    !bridge ||
    !/\bacquireVsCodeApi\(\)/.test(bridge.pristine)
  )
    throw new Error(
      "Unsupported Codex bridge structure. No bundles were changed.",
    );
  const manifest = JSON.parse(read("package.json"));
  const extensionId = JSON.stringify(`${manifest.publisher}.${manifest.name}`);
  host.next =
    `${HOST}\n${read("host-bridge.js")}\n${HOST_END}\n` +
    host.pristine.replace(
      requires,
      (match) => `__contextPouchWrapVscode(${match}, ${extensionId})`,
    );
  bridge.next =
    `${BOOT}\n${read("webview-bootstrap.js")}\n${BOOT_END}\n` +
    bridge.next.replace(
      /(?<![.\w])acquireVsCodeApi\(\)/g,
      (match) => `__contextPouchCapture(${match})`,
    );
  if (!bridge.next.includes("__contextPouchCapture(acquireVsCodeApi())"))
    throw new Error("Unsupported Codex API acquisition call.");
  if (targets.session) {
    const session = plan.get(targets.session);
    session.next = sessionPatch.patch(session.next, `${SESSION}\n${read("session-bridge.js")}`);
  }
  webview.next += runtimeSource();
  return [...plan.values()];
}
function patchTargets(targets) {
  const plan = builds(targets);
  const previous = new Map();
  try {
    for (const item of plan) {
      for (const file of [item.file, item.file + BACKUP, item.file + META])
        previous.set(file, fs.existsSync(file) ? fs.readFileSync(file) : null);
      if (!fs.existsSync(item.file + BACKUP))
        fs.writeFileSync(item.file + BACKUP, item.pristine);
      fs.writeFileSync(item.file, item.next);
      fs.writeFileSync(
        item.file + META,
        JSON.stringify({
          original: hash(item.pristine),
          patched: hash(item.next),
        }),
      );
    }
  } catch (error) {
    for (const [file, data] of previous) {
      try {
        if (data === null) fs.rmSync(file, { force: true });
        else fs.writeFileSync(file, data);
      } catch (_) {}
    }
    throw error;
  }
  return plan.some((item) => item.live !== item.next);
}
function current(targets) {
  try {
    return builds(targets).every((item) => item.live === item.next);
  } catch (_) {
    return false;
  }
}
function restoreTarget(file) {
  if (!fs.existsSync(file)) return false;
  const { live, pristine } = original(file);
  if (live === pristine && !fs.existsSync(file + BACKUP)) return false;
  fs.writeFileSync(file, pristine);
  fs.rmSync(file + BACKUP, { force: true });
  fs.rmSync(file + META, { force: true });
  return true;
}
module.exports = {
  resolveTargets,
  patchTargets,
  current,
  restoreTarget,
  runtimeSource,
  stripExistingPatch,
  original,
};
