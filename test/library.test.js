"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("fs/promises"),
  os = require("os"),
  path = require("path");
const { environment, load, uri } = require("./mock-vscode");
const M = require("../model");
async function setup(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "pouch-library-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  const env = environment(root);
  const { Library } = load("library.js", env.vscode);
  const updates = [];
  return {
    root,
    ...env,
    library: new Library(env.context, (s) => updates.push(s)),
    updates,
  };
}
test("project CRUD, presets, relation cleanup, and durable selection share one store", async (t) => {
  const { library, root, updates } = await setup(t);
  await library.dispatch("saveRule", {
    scope: "project",
    rule: { id: "a", title: "A", category: "UI", text: "Keep layout." },
  });
  await library.dispatch("saveRule", {
    scope: "project",
    rule: {
      id: "b",
      title: "B",
      category: "UI",
      text: "Use components.",
      related: ["a"],
    },
  });
  await library.dispatch("savePreset", {
    scope: "project",
    id: "p",
    title: "UI work",
    ruleIds: ["a", "b"],
  });
  await library.dispatch("select", { keys: [M.key("project", "a")] });
  assert.deepEqual((await library.dispatch("state")).selected, [
    M.key("project", "a"),
  ]);
  await library.dispatch("deleteRule", { scope: "project", id: "a" });
  const state = await library.dispatch("state");
  assert.deepEqual(state.selected, []);
  assert.deepEqual(state.presets[0].ruleIds, ["b"]);
  assert.deepEqual(state.rules.find((r) => r.id === "b").related, []);
  const saved = JSON.parse(
    await fs.readFile(
      path.join(root, "project/.context-pouch/rules.json"),
      "utf8",
    ),
  );
  assert.equal(saved.rules.length, 1);
  assert(updates.length >= 5);
});
test("stale edits and invalid project files cannot overwrite data", async (t) => {
  const { library, root } = await setup(t);
  const first = await library.dispatch("state");
  await library.dispatch("saveRule", {
    scope: "personal",
    rule: { id: "new", title: "New", text: "New rule", category: "Code" },
  });
  await assert.rejects(
    library.dispatch("deleteRule", {
      scope: "personal",
      id: "new",
      revision: first.revision,
    }),
    /changed elsewhere/,
  );
  const file = path.join(root, "project/.context-pouch/rules.json");
  await fs.mkdir(path.dirname(file), { recursive: true });
  await fs.writeFile(file, "{broken");
  await assert.rejects(
    library.dispatch("saveRule", {
      scope: "project",
      rule: { title: "No overwrite" },
    }),
    /Cannot load/,
  );
  assert.equal(await fs.readFile(file, "utf8"), "{broken");
});
test("multi-root selection is isolated and project writes honor workspace trust", async (t) => {
  const { library, vscode } = await setup(t);
  await library.dispatch("saveRule", {
    scope: "project",
    rule: { id: "a", title: "A", text: "A", category: "Code" },
  });
  await library.dispatch("select", { keys: [M.key("project", "a")] });
  await library.dispatch("project", {
    id: vscode.workspace.workspaceFolders[1].uri.toString(),
  });
  assert.deepEqual((await library.dispatch("state")).selected, []);
  await library.dispatch("project", {
    id: vscode.workspace.workspaceFolders[0].uri.toString(),
  });
  assert.deepEqual((await library.dispatch("state")).selected, [
    M.key("project", "a"),
  ]);
  vscode.workspace.isTrusted = false;
  await assert.rejects(
    library.dispatch("deleteRule", { scope: "project", id: "a" }),
    /Trust this workspace/,
  );
});
test("migration preserves existing rules and import/export remaps duplicate references", async (t) => {
  const { library, answers, root, events } = await setup(t);
  await library.dispatch("saveRule", {
    scope: "personal",
    rule: {
      id: "existing",
      title: "Existing",
      text: "Existing rule",
      category: "Code",
    },
  });
  await library.dispatch("migrate", {
    rules: [
      {
        id: "custom",
        title: "My rule",
        category: "Code",
        text: "Unique rule.",
      },
    ],
    selected: ["custom"],
  });
  assert.equal(
    (await library.dispatch("state")).rules.length,
    M.defaults().rules.length + 2,
  );
  const pack = {
    version: 1,
    rules: [
      {
        id: "other-id",
        title: "Imported title",
        category: "Code",
        text: "Unique rule.",
      },
    ],
    presets: [{ id: "p", title: "Imported preset", ruleIds: ["other-id"] }],
  };
  const file = uri(path.join(root, "import.json"));
  await fs.writeFile(file.fsPath, JSON.stringify(pack));
  answers.push([file], "Keep existing");
  await library.importPack("personal");
  assert.match(events[0][1].detail, /1 duplicate rules/);
  assert.deepEqual((await library.dispatch("state")).presets[0].ruleIds, [
    "custom",
  ]);
  const out = uri(path.join(root, "out.json"));
  answers.push(out);
  await library.exportPack("personal", true);
  const exported = M.validate(
    JSON.parse(await fs.readFile(out.fsPath, "utf8")),
  );
  assert.equal(exported.rules.length, 1);
  assert.equal(exported.presets.length, 1);
});

test("simultaneous checkbox updates do not lose selections", async (t) => {
  const { library } = await setup(t);
  const rules = (await library.dispatch("state")).rules.slice(0, 2);
  await Promise.all(
    rules.map((rule) =>
      library.dispatch("toggle", { key: rule.key, checked: true }),
    ),
  );
  assert.deepEqual(
    (await library.dispatch("state")).selected,
    rules.map((r) => r.key),
  );
});
