"use strict";
const vscode = require("vscode");
const path = require("path");
const G = require("./generator");
const M = require("./model");
const KEY = "contextPouch.openaiKey";
class GenerationUI {
  constructor(context, library, providers = G) { this.context = context; this.library = library; this.providers = providers; this.running = false; }
  async setKey() {
    const key = await vscode.window.showInputBox({ title: "OpenAI API key", prompt: "Stored in VS Code SecretStorage. Leave blank to remove the saved key.", password: true, ignoreFocusOut: true });
    if (key === undefined) return false;
    if (key.trim()) await this.context.secrets.store(KEY, key.trim());
    else await this.context.secrets.delete(KEY);
    return Boolean(key.trim());
  }
  async run() {
    if (this.running) { vscode.window.showInformationMessage("A rule generation wizard is already open."); return; }
    this.running = true;
    try { await this.wizard(); }
    finally { this.running = false; }
  }
  async wizard() {
    if (!vscode.workspace.isTrusted) throw new Error("Trust this workspace before generating project rules.");
    const initial = await this.library.dispatch("state");
    const project = this.library.roots().find(r => r.uri.toString() === initial.project);
    if (!project) throw new Error("Open a project folder to generate rules.");
    if (project.uri.scheme && project.uri.scheme !== "file") throw new Error("Generation currently supports local project folders.");
    const files = await vscode.workspace.findFiles(new vscode.RelativePattern(project.uri, "**/*.{md,mdc}"), "**/{node_modules,vendor,dist,build,.git,.context-pouch,coverage}/**", 501);
    const truncated = files.length > 500;
    const candidates = files.slice(0, 500).map(uri => ({ uri, path: path.relative(project.uri.fsPath, uri.fsPath).split(path.sep).join("/") })).filter(d => G.candidate(d.path)).sort((a,b) => Number(G.preferred(b.path)) - Number(G.preferred(a.path)) || a.path.localeCompare(b.path));
    if (!candidates.length) { vscode.window.showInformationMessage("No project Markdown documents found. Add AGENTS.md, CLAUDE.md, a README, or project documentation first."); return; }
    const chosen = await vscode.window.showQuickPick(candidates.map(d => ({ label: d.path, picked: G.preferred(d.path), document: d })), {
      title: `Generate rules · ${project.name} · 1/3`, canPickMany: true, ignoreFocusOut: true,
      placeHolder: `${truncated ? "Showing the first 500 documents. " : ""}Choose documents to send to your provider. Exclude private or irrelevant files.`,
    });
    if (!chosen?.length) return;
    const documents = await Promise.all(chosen.map(d => G.readDocument(project.uri.fsPath, d.document.path)));
    if (documents.reduce((n,d) => n + Buffer.byteLength(d.text),0) > 200000) throw new Error("Selected documents exceed 200 KB. Choose fewer documents.");
    const saved = this.context.globalState.get("contextPouch.generatorProvider", "codex");
    const keyReady = Boolean(await this.context.secrets.get(KEY));
    const providers = [
      { label: "Codex CLI", id: "codex", description: "Uses your Codex CLI login", detail: "Requires a current Codex CLI installed on this computer." },
      { label: "OpenAI API key", id: "openai", description: keyReady ? "Key saved" : "Set up API key", detail: "Uses your OpenAI API account and API billing." },
    ].sort((a,b) => Number(b.id === saved) - Number(a.id === saved));
    const provider = await vscode.window.showQuickPick(providers, { title: "Generate rules · 2/3", placeHolder: "Choose how to generate rules", ignoreFocusOut: true });
    if (!provider) return;
    let key, model;
    const config = vscode.workspace.getConfiguration("contextPouch");
    if (provider.id === "openai") {
      if (!keyReady && !await this.setKey()) return;
      key = await this.context.secrets.get(KEY);
      model = await vscode.window.showInputBox({ title: "OpenAI model", prompt: "Enter a model available to your API account that supports structured outputs.", value: this.context.globalState.get("contextPouch.generatorModel", ""), ignoreFocusOut: true, validateInput: v => v.trim() ? undefined : "Enter a model ID." });
      if (!model) return;
      await this.context.globalState.update("contextPouch.generatorModel", model.trim());
    }
    await this.context.globalState.update("contextPouch.generatorProvider", provider.id);
    const existing = initial.rules.filter(r => r.scope === "project");
    const prompt = G.promptFor(documents, existing);
    if (!vscode.workspace.isTrusted) throw new Error("Trust this workspace before generating project rules.");
    const output = await vscode.window.withProgress({ location: vscode.ProgressLocation.Notification, title: `Generating project rules with ${provider.label}`, cancellable: true }, async (progress, token) => {
      const controller = new AbortController();
      this.controller = controller;
      const sub = token.onCancellationRequested(() => controller.abort());
      const timer = setTimeout(() => controller.abort(), 180000);
      progress.report({ message: `Reading ${documents.length} selected documents…` });
      try {
        if (token.isCancellationRequested) controller.abort();
        const result = await (provider.id === "codex" ? this.providers.codex(prompt, { executable: config.get("codexPath", "codex"), signal: controller.signal }) : this.providers.openai(prompt, { key, model: model.trim(), signal: controller.signal }));
        if (controller.signal.aborted) return null;
        return result;
      } catch (e) {
        if (controller.signal.aborted) {
          if (!token.isCancellationRequested) throw new Error("Generation timed out after three minutes. Try fewer documents.");
          return null;
        }
        throw e;
      } finally { clearTimeout(timer); sub.dispose(); this.controller = undefined; }
    });
    if (!output) return;
    const review = G.normalize(output, documents, existing);
    if (review.warnings.length) {
      const proceed = await vscode.window.showWarningMessage("Some source instructions need attention.", { modal: true, detail: review.warnings.join("\n\n") }, "Review suggestions");
      if (!proceed) return;
    }
    if (!review.rules.length) { vscode.window.showInformationMessage(`No new rules to save. ${review.duplicates} duplicate suggestions skipped.`); return; }
    let selected = review.rules;
    while (true) {
      const picks = await vscode.window.showQuickPick(review.rules.map(rule => ({
        label: rule.title, description: `${rule.category} · ${rule.appliesTo || "."}`,
        detail: `${rule.text}\nSources: ${rule.sources.map(s => `${s.path}:${s.line}`).join(", ")}`,
        picked: selected.includes(rule), rule,
      })), { title: `Review generated rules · 3/3 · ${review.duplicates} duplicates skipped`, canPickMany: true, ignoreFocusOut: true, matchOnDetail: true, placeHolder: "Select suggestions to keep. You can edit them before saving." });
      if (!picks?.length) return;
      selected = picks.map(p => p.rule);
      const next = await vscode.window.showQuickPick([
        { label: `Save ${selected.length} rules to ${project.name}`, id: "save", detail: "Adds these rules to .context-pouch/rules.json. Existing rules are kept." },
        { label: "Inspect / edit a suggestion", id: "edit" },
        { label: "Change selection", id: "back" },
      ], { title: "Review generated rules", ignoreFocusOut: true });
      if (!next) return;
      if (next.id === "edit") {
        const item = await vscode.window.showQuickPick(selected.map(rule => ({label:rule.title, rule})), { title: "Choose a suggestion to inspect / edit", ignoreFocusOut:true });
        if (item) await this.edit(item.rule, initial.project);
      } else if (next.id === "save") {
        for (const document of documents) {
          const latest = await G.readDocument(project.uri.fsPath, document.path);
          if (latest.text !== document.text) throw new Error("A source document changed during review. Generate again using the updated documentation.");
        }
        // Reject changes to either the active project or its library during review.
        const current = await this.library.dispatch("state");
        if (current.project !== initial.project || current.revision !== initial.revision) throw new Error("The project or library changed during review. Generate again against the latest rules.");
        const state = await this.library.dispatch("saveGenerated", { scope: "project", project: initial.project, revision: initial.revision, rules: selected });
        const count = state.rules.filter(r => r.scope === "project").length - existing.length;
        vscode.window.showInformationMessage(`Saved ${count} project rules. They are available in Pouch and the rule graph.`);
        return;
      }
    }
  }
  async edit(rule, projectId) {
    const choice = await vscode.window.showQuickPick([
      { label: "Edit title", field: "title", max: 100 },
      { label: "Edit category", field: "category", max: 50 },
      { label: "Edit instruction text", field: "text", max: 5000 },
      ...rule.sources.map(s => ({ label: `Open ${s.path}:${s.line}`, source: s })),
    ], { title: rule.title, ignoreFocusOut: true });
    if (!choice) return;
    if (choice.source) { await this.openSource(choice.source, projectId); return; }
    const text = await vscode.window.showInputBox({ title: choice.label, value: rule[choice.field], ignoreFocusOut: true,
      validateInput: v => !v.trim() || v.length > choice.max ? `Enter 1–${choice.max} characters.` : /\[\/?CONTEXT POUCH/.test(v) ? "Pouch block markers are reserved." : undefined });
    if (text !== undefined) rule[choice.field] = text.trim();
    M.validate({version:1, rules:[rule], presets:[]});
  }
  async openSource(source, projectId) {
    const state = await this.library.dispatch("state");
    const project = this.library.roots().find(r => r.uri.toString() === (projectId || state.project));
    if (!project) throw new Error("Open the source project first.");
    await G.readDocument(project.uri.fsPath, source.path);
    const doc = await vscode.workspace.openTextDocument(vscode.Uri.joinPath(project.uri, source.path));
    const editor = await vscode.window.showTextDocument(doc, { preview: true });
    const pos = new vscode.Position(Math.max(0, Math.min(source.line - 1, doc.lineCount - 1)), 0);
    editor.selection = new vscode.Selection(pos, pos);
    editor.revealRange(new vscode.Range(pos, pos));
  }
  dispose() { this.controller?.abort(); }
}
module.exports = { GenerationUI };
