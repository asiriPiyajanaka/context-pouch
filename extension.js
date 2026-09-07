'use strict';

const vscode = require('vscode');
const fs = require('fs');
const path = require('path');

const START = '/* CONTEXT_POUCH_START */';
const END = '/* CONTEXT_POUCH_END */';
const BACKUP_SUFFIX = '.context-pouch-backup';
const ENABLED_KEY = 'contextPouch.enabled';
const LAST_TARGET_KEY = 'contextPouch.lastTarget';

function runtimeSource() {
  const runtimePath = path.join(__dirname, 'runtime.js');
  const runtime = fs.readFileSync(runtimePath, 'utf8').trim();
  return `\n${START}\n${runtime}\n${END}\n`;
}

function getCodexExtension() {
  return vscode.extensions.getExtension('openai.chatgpt');
}

function resolveTarget() {
  const ext = getCodexExtension();
  if (!ext) throw new Error('OpenAI Codex extension (openai.chatgpt) is not installed in this VS Code environment.');
  const webviewDir = path.join(ext.extensionPath, 'webview');
  const assetsDir = path.join(webviewDir, 'assets');
  if (!fs.existsSync(assetsDir)) throw new Error(`Codex webview assets not found: ${assetsDir}`);

  const indexHtml = path.join(webviewDir, 'index.html');
  if (fs.existsSync(indexHtml)) {
    const html = fs.readFileSync(indexHtml, 'utf8');
    const matches = [...html.matchAll(/(?:\.\/)?assets\/(index-[^"'?#]+\.js)/g)];
    for (const m of matches) {
      const p = path.join(assetsDir, m[1]);
      if (fs.existsSync(p)) return { target: p, ext };
    }
  }

  const candidates = fs.readdirSync(assetsDir)
    .filter(n => /^index-.*\.js$/.test(n) && !n.endsWith('.js.map'))
    .map(n => path.join(assetsDir, n))
    .sort((a,b) => fs.statSync(b).size - fs.statSync(a).size);
  if (!candidates.length) throw new Error('Could not find Codex webview entry bundle (webview/assets/index-*.js).');
  return { target: candidates[0], ext };
}

function isPatchedFile(file) {
  try { return fs.readFileSync(file, 'utf8').includes(START); } catch (_) { return false; }
}

function stripExistingPatch(src) {
  const start = src.indexOf(START);
  const end = src.indexOf(END);
  if (start === -1 || end === -1 || end < start) return src;
  return src.slice(0, start).replace(/\n?$/, '\n') + src.slice(end + END.length).replace(/^\n?/, '');
}

function patchTarget(target) {
  const backup = target + BACKUP_SUFFIX;
  let live = fs.readFileSync(target, 'utf8');
  if (live.includes(START)) return { changed: false, backup };

  let pristine = live;
  if (fs.existsSync(backup)) {
    const backed = fs.readFileSync(backup, 'utf8');
    if (!backed.includes(START)) pristine = backed;
  } else {
    fs.writeFileSync(backup, pristine, 'utf8');
  }
  pristine = stripExistingPatch(pristine);
  fs.writeFileSync(target, pristine.replace(/\s*$/, '') + runtimeSource(), 'utf8');
  return { changed: true, backup };
}

function restoreTarget(target) {
  const backup = target + BACKUP_SUFFIX;
  if (fs.existsSync(backup)) {
    fs.copyFileSync(backup, target);
    fs.unlinkSync(backup);
    return true;
  }
  if (fs.existsSync(target)) {
    const live = fs.readFileSync(target, 'utf8');
    if (live.includes(START)) {
      fs.writeFileSync(target, stripExistingPatch(live), 'utf8');
      return true;
    }
  }
  return false;
}

async function offerReload(message) {
  const choice = await vscode.window.showInformationMessage(message, 'Reload Window', 'Later');
  if (choice === 'Reload Window') await vscode.commands.executeCommand('workbench.action.reloadWindow');
}

async function install(context, quiet = false) {
  try {
    const { target, ext } = resolveTarget();
    const result = patchTarget(target);
    await context.globalState.update(ENABLED_KEY, true);
    await context.globalState.update(LAST_TARGET_KEY, target);
    if (!quiet) {
      await offerReload(result.changed
        ? `Context Pouch installed into Codex ${ext.packageJSON.version || ''}. Reload VS Code to show the pouch button.`
        : 'Context Pouch is already installed. Reload if the button is not visible.');
    }
    return true;
  } catch (err) {
    if (!quiet) vscode.window.showErrorMessage(`Context Pouch: ${err.message || err}`);
    return false;
  }
}

async function restore(context) {
  let restored = false;
  const paths = new Set();
  const last = context.globalState.get(LAST_TARGET_KEY);
  if (last) paths.add(last);
  try { paths.add(resolveTarget().target); } catch (_) {}

  for (const p of paths) {
    try { restored = restoreTarget(p) || restored; } catch (_) {}
  }
  await context.globalState.update(ENABLED_KEY, false);
  await context.globalState.update(LAST_TARGET_KEY, undefined);
  if (restored) await offerReload('Context Pouch was removed from Codex. Reload VS Code to finish restoring the original UI.');
  else vscode.window.showInformationMessage('Context Pouch: no active patch was found.');
}

async function showStatus(context) {
  try {
    const { target, ext } = resolveTarget();
    const patched = isPatchedFile(target);
    vscode.window.showInformationMessage(`Context Pouch: ${patched ? 'installed' : 'not installed'} · Codex ${ext.packageJSON.version || 'unknown'} · ${path.basename(target)}`);
  } catch (err) {
    vscode.window.showErrorMessage(`Context Pouch: ${err.message || err}`);
  }
}

async function activate(context) {
  context.subscriptions.push(
    vscode.commands.registerCommand('contextPouch.install', () => install(context, false)),
    vscode.commands.registerCommand('contextPouch.restore', () => restore(context)),
    vscode.commands.registerCommand('contextPouch.status', () => showStatus(context))
  );

  const enabled = context.globalState.get(ENABLED_KEY, false);
  const auto = vscode.workspace.getConfiguration('contextPouch').get('autoRepatch', true);
  if (enabled && auto) {
    try {
      const { target } = resolveTarget();
      if (!isPatchedFile(target)) {
        const ok = await install(context, true);
        if (ok) vscode.window.showInformationMessage('Context Pouch was re-applied after a Codex update. Reload VS Code if the pouch button is not visible.');
      }
    } catch (_) {}
  } else if (!context.globalState.get('contextPouch.firstPromptShown', false)) {
    await context.globalState.update('contextPouch.firstPromptShown', true);
    const codex = getCodexExtension();
    if (codex) {
      const choice = await vscode.window.showInformationMessage('Context Pouch can add a selectable rules button directly inside the Codex composer.', 'Install into Codex', 'Later');
      if (choice === 'Install into Codex') await install(context, false);
    }
  }
}

function deactivate() {}
module.exports = { activate, deactivate, _test: { runtimeSource, stripExistingPatch, patchTarget, restoreTarget } };
