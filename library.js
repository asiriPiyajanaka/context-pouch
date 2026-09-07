"use strict";
const vscode = require("vscode");
const crypto = require("crypto");
const M = require("./model");
const MAX_BYTES = 2 * 1024 * 1024;
class Library {
  constructor(context, changed) {
    this.context = context;
    this.changed = changed;
    this.queue = Promise.resolve();
    this.personalUri = vscode.Uri.joinPath(
      context.globalStorageUri,
      "rules.json",
    );
  }
  async read(uri, fallback) {
    try {
      const bytes = await vscode.workspace.fs.readFile(uri);
      if (bytes.length > MAX_BYTES) throw new Error("Rule file exceeds 2 MB.");
      return M.validate(JSON.parse(Buffer.from(bytes).toString("utf8")));
    } catch (error) {
      if (error.code === "FileNotFound" || error.code === "ENOENT")
        return fallback();
      throw new Error(
        `Cannot load ${uri.fsPath || uri.path}: ${error.message}. Fix the file before editing rules.`,
      );
    }
  }
  async write(uri, pack) {
    pack = M.validate(pack);
    const bytes = Buffer.from(JSON.stringify(pack, null, 2) + "\n");
    if (bytes.length > MAX_BYTES) throw new Error("Rule file exceeds 2 MB.");
    const dir = vscode.Uri.joinPath(uri, "..");
    await vscode.workspace.fs.createDirectory(dir);
    const temp = vscode.Uri.joinPath(dir, `.pouch-${crypto.randomUUID()}.tmp`);
    try {
      await vscode.workspace.fs.writeFile(temp, bytes);
      await vscode.workspace.fs.rename(temp, uri, { overwrite: true });
    } finally {
      try {
        await vscode.workspace.fs.delete(temp);
      } catch (_) {}
    }
  }
  roots() {
    return vscode.workspace.workspaceFolders || [];
  }
  async load() {
    const roots = this.roots();
    const active =
      roots.find(
        (r) =>
          r.uri.toString() ===
          this.context.workspaceState.get("contextPouch.project"),
      ) || roots[0];
    this.scopes = [
      {
        id: "personal",
        name: "Personal",
        uri: this.personalUri,
        writable: true,
      },
    ];
    if (active)
      this.scopes.push({
        id: "project",
        name: active.name,
        uri: vscode.Uri.joinPath(active.uri, ".context-pouch", "rules.json"),
        writable: vscode.workspace.isTrusted,
      });
    this.packs = Object.fromEntries(
      await Promise.all(
        this.scopes.map(async (s) => [
          s.id,
          await this.read(s.uri, s.id === "personal" ? M.defaults : M.empty),
        ]),
      ),
    );
    this.projectId = active?.uri.toString() || "";
    const available = new Set(
      this.scopes.flatMap((s) =>
        this.packs[s.id].rules.map((r) => M.key(s.id, r.id)),
      ),
    );
    this.selected = this.context.workspaceState
      .get("contextPouch.selection:" + this.projectId, [])
      .filter((k) => available.has(k));
    this.revision = crypto
      .createHash("sha256")
      .update(JSON.stringify([this.projectId, this.packs]))
      .digest("hex");
    return this.snapshot();
  }
  snapshot() {
    return {
      revision: this.revision,
      selected: this.selected,
      project: this.projectId,
      projects: this.roots().map((r) => ({
        id: r.uri.toString(),
        name: r.name,
      })),
      scopes: this.scopes.map(({ id, name, writable }) => ({
        id,
        name,
        writable,
      })),
      rules: this.scopes.flatMap((s) =>
        this.packs[s.id].rules.map((r) => ({
          ...r,
          scope: s.id,
          key: M.key(s.id, r.id),
        })),
      ),
      presets: this.scopes.flatMap((s) =>
        this.packs[s.id].presets.map((p) => ({
          ...p,
          scope: s.id,
          key: M.key(s.id, p.id),
        })),
      ),
    };
  }
  scope(id) {
    const scope = this.scopes.find((s) => s.id === id);
    if (!scope) throw new Error("Choose an available library.");
    if (!scope.writable)
      throw new Error("Trust this workspace before changing project rules.");
    return scope;
  }
  async select(keys) {
    if (
      !Array.isArray(keys) ||
      keys.length > 4000 ||
      keys.some((k) => typeof k !== "string")
    )
      throw new Error("Invalid rule selection.");
    const valid = new Set(this.snapshot().rules.map((r) => r.key));
    await this.context.workspaceState.update(
      "contextPouch.selection:" + this.projectId,
      [...new Set(keys.filter((k) => valid.has(k)))],
    );
  }
  async dispatch(action, data = {}) {
    const job = this.queue.then(async () => {
      await this.load();
      if (action === "state") return this.snapshot();
      if (data.revision && data.revision !== this.revision)
        throw new Error(
          "The library changed elsewhere. Refresh and try again.",
        );
      if (action === "select") await this.select(data.keys);
      else if (action === "toggle") {
        if (typeof data.key !== "string") throw new Error("Invalid rule key.");
        const selected = new Set(this.selected);
        const include =
          typeof data.checked === "boolean"
            ? data.checked
            : !selected.has(data.key);
        include ? selected.add(data.key) : selected.delete(data.key);
        await this.select([...selected]);
      } else if (action === "project") {
        if (!this.roots().some((r) => r.uri.toString() === data.id))
          throw new Error("Project is no longer open.");
        await this.context.workspaceState.update(
          "contextPouch.project",
          data.id,
        );
      } else if (action === "migrate") {
        if (!this.context.globalState.get("contextPouch.migratedV1", false)) {
          const legacy = M.validate({
            version: 1,
            rules: data.rules,
            presets: [],
          });
          let existing = false;
          try {
            await vscode.workspace.fs.readFile(this.personalUri);
            existing = true;
          } catch (e) {
            if (e.code !== "FileNotFound" && e.code !== "ENOENT") throw e;
          }
          await this.write(
            this.personalUri,
            existing ? M.mergePack(this.packs.personal, legacy).pack : legacy,
          );
          await this.load();
          if (Array.isArray(data.selected))
            await this.select(data.selected.map((id) => M.key("personal", id)));
          await this.context.globalState.update(
            "contextPouch.migratedV1",
            true,
          );
        }
      } else {
        const scope = this.scope(data.scope),
          pack = structuredClone(this.packs[scope.id]);
        if (action === "saveRule") {
          const rule = {
            id: data.rule?.id || crypto.randomUUID(),
            title: data.rule?.title,
            category: data.rule?.category,
            text: data.rule?.text,
            related: data.rule?.related || [],
          };
          const i = pack.rules.findIndex((r) => r.id === rule.id);
          if (i < 0) pack.rules.push(rule);
          else pack.rules[i] = rule;
        } else if (action === "deleteRule") {
          pack.rules = pack.rules
            .filter((r) => r.id !== data.id)
            .map((r) => ({
              ...r,
              related: r.related.filter((id) => id !== data.id),
            }));
          pack.presets = pack.presets.map((p) => ({
            ...p,
            ruleIds: p.ruleIds.filter((id) => id !== data.id),
          }));
        } else if (action === "savePreset") {
          const p = {
            id: data.id || crypto.randomUUID(),
            title: data.title,
            ruleIds: data.ruleIds,
          };
          const i = pack.presets.findIndex((x) => x.id === p.id);
          if (i < 0) pack.presets.push(p);
          else pack.presets[i] = p;
        } else if (action === "deletePreset")
          pack.presets = pack.presets.filter((p) => p.id !== data.id);
        else throw new Error("Unknown library action.");
        await this.write(scope.uri, pack);
      }
      const state = await this.load();
      this.changed(state);
      return state;
    });
    this.queue = job.catch(() => {});
    return job;
  }
  async importPack(scopeId) {
    const files = await vscode.window.showOpenDialog({
      canSelectMany: false,
      filters: { "Pouch rule pack": ["json"] },
      title: "Import a Context Pouch rule pack",
    });
    if (!files?.length) return;
    const incoming = await this.read(files[0], () => {
      throw new Error("Import file was not found.");
    });
    await this.queue;
    await this.load();
    const scope = this.scope(scopeId),
      revision = this.revision;
    const preview = M.mergePack(this.packs[scopeId], incoming);
    const choice = await vscode.window.showInformationMessage(
      `Import into ${scope.name}?`,
      {
        modal: true,
        detail: `${incoming.rules.length} rules and ${incoming.presets.length} presets.\n${preview.added} new rules; ${preview.duplicates} duplicate rules.\n\nRules: ${incoming.rules
          .slice(0, 20)
          .map((r) => r.title)
          .join(
            ", ",
          )}${incoming.rules.length > 20 ? "…" : ""}\n\nKeeping existing preserves matching rules and presets. Replacing updates matches from this pack.`,
      },
      "Keep existing",
      "Replace matches",
    );
    if (!choice) return;
    const job = this.queue.then(async () => {
      await this.load();
      if (revision !== this.revision)
        throw new Error(
          "Library changed during import. Import again to review the latest differences.",
        );
      await this.write(
        this.scope(scopeId).uri,
        M.mergePack(this.packs[scopeId], incoming, choice === "Replace matches")
          .pack,
      );
      const state = await this.load();
      this.changed(state);
      return state;
    });
    this.queue = job.catch(() => {});
    return job;
  }
  async exportPack(scopeId, selectedOnly) {
    await this.queue;
    await this.load();
    if (!this.packs[scopeId]) throw new Error("Choose an available library.");
    let pack = this.packs[scopeId];
    if (selectedOnly)
      pack = M.subset(
        pack,
        this.snapshot()
          .rules.filter(
            (r) => r.scope === scopeId && this.selected.includes(r.key),
          )
          .map((r) => r.id),
      );
    if (!pack.rules.length && !pack.presets.length)
      throw new Error("No rules or presets to export in this library.");
    const file = await vscode.window.showSaveDialog({
      defaultUri: vscode.Uri.file("context-pouch-pack.json"),
      filters: { "Pouch rule pack": ["json"] },
      title: selectedOnly
        ? "Export selected rules and complete presets"
        : "Export library",
    });
    if (file)
      await vscode.workspace.fs.writeFile(
        file,
        Buffer.from(JSON.stringify(pack, null, 2) + "\n"),
      );
  }
}
module.exports = { Library };
