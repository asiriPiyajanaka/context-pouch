"use strict";
const { test } = require("node:test");
const assert = require("node:assert/strict");
const M = require("../model");
const rule = (id, text = id, related = []) => ({
  id,
  title: id,
  category: "Code",
  text,
  related,
});
test("packs reject dangling references, duplicate IDs, and unsupported versions", () => {
  assert.throws(() => M.validate({ version: 2, rules: [], presets: [] }));
  assert.throws(() =>
    M.validate({ version: 1, rules: [rule("a"), rule("a")], presets: [] }),
  );
  assert.throws(() =>
    M.validate({
      version: 1,
      rules: [rule("a", "a", ["missing"])],
      presets: [],
    }),
  );
  assert.throws(() =>
    M.validate({
      version: 1,
      rules: [rule("a")],
      presets: [{ id: "p", title: "p", ruleIds: ["missing"] }],
    }),
  );
  assert.deepEqual(M.validate(M.empty()), M.empty());
});
test("duplicate text imports remap related rules and preset membership", () => {
  const current = {
    version: 1,
    rules: [rule("old", "Do not refactor.")],
    presets: [],
  };
  const incoming = {
    version: 1,
    rules: [
      rule("new", "Do NOT refactor."),
      rule("other", "Keep layout.", ["new"]),
    ],
    presets: [{ id: "p", title: "UI", ruleIds: ["new", "other"] }],
  };
  const result = M.mergePack(current, incoming);
  assert.equal(result.added, 1);
  assert.equal(result.duplicates, 1);
  assert.deepEqual(result.pack.rules[1].related, ["old"]);
  assert.deepEqual(result.pack.presets[0].ruleIds, ["old", "other"]);
  assert.equal(result.pack.rules[0].text, "Do not refactor.");
  assert.equal(
    M.mergePack(current, incoming, true).pack.rules[0].text,
    "Do NOT refactor.",
  );
});
test("subset exports only complete presets and valid links", () => {
  const pack = {
    version: 1,
    rules: [rule("a", "a", ["b"]), rule("b")],
    presets: [{ id: "p", title: "Pair", ruleIds: ["a", "b"] }],
  };
  assert.deepEqual(M.subset(pack, ["a"]), {
    version: 1,
    rules: [rule("a")],
    presets: [],
  });
});
test("instructions are plain text with scoped rules and no tracking markers", () => {
  const rules = [{...rule("a", "Use theme variables."), appliesTo:"media"}];
  assert.equal(M.payload(rules), "Instructions for the current task:\n- Only within media/: Use theme variables.");
  assert.equal(M.payload(rules, "reinforce"), "Reminder for the current task:\n- Only within media/: Use theme variables.");
  assert.equal(M.payload([]), "");
});
test("scope keys cannot collide and an empty library stays empty", () => {
  assert.notEqual(M.key("personal", "a"), M.key("project", "a"));
  assert.equal(M.validate(M.empty()).rules.length, 0);
});

test("former block markers are ordinary editable rule text", () => {
  const text = "Explain [/CONTEXT POUCH]";
  assert.equal(M.validate({version:1, rules:[rule("a",text)], presets:[]}).rules[0].text, text);
});
