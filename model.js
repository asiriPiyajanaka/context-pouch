/* Shared, dependency-free rule and prompt model (extension host + webviews). */
(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ContextPouchModel = factory();
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";
  const VERSION = 1;
  const empty = () => ({ version: VERSION, rules: [], presets: [] });
  function string(value, name, max, fallback) {
    if (value == null && fallback !== undefined) return fallback;
    if (typeof value !== "string" || !value.trim() || value.length > max)
      throw new Error(
        `${name} must be non-empty text, up to ${max} characters.`,
      );
    return value.trim();
  }
  function ids(value, name) {
    if (!Array.isArray(value) || value.length > 2000)
      throw new Error(`${name} must be a list of IDs.`);
    return [...new Set(value.map((v) => string(v, name, 150)))];
  }
  function relativePath(value) {
    const p = string(value, "Source path", 500);
    if (p.startsWith("/") || p.includes("\\") || p.includes(":") || /[\x00-\x1f]|\[\/?CONTEXT POUCH/.test(p) || p.split("/").some((x) => !x || x === ".." || (x === "." && p !== ".")))
      throw new Error("Expected a project-relative source path.");
    return p;
  }
  function sources(value) {
    if (!Array.isArray(value) || value.length > 20)
      throw new Error("Sources must be a list of up to 20 references.");
    return value.map((s) => {
      if (!Number.isInteger(s?.line) || s.line < 1)
        throw new Error("Invalid source line.");
      return { path: relativePath(s.path), line: s.line };
    });
  }
  function validate(input) {
    if (
      !input ||
      input.version !== VERSION ||
      !Array.isArray(input.rules) ||
      !Array.isArray(input.presets)
    )
      throw new Error(
        "Expected a Context Pouch pack with version: 1, rules, and presets.",
      );
    if (input.rules.length > 2000 || input.presets.length > 200)
      throw new Error("A pack supports up to 2,000 rules and 200 presets.");
    const rules = input.rules.map((r) => ({
      id: string(r?.id, "Rule ID", 150),
      title: string(r?.title, "Title", 100),
      category: string(r?.category, "Category", 50, "Other"),
      text: string(r?.text, "Rule text", 5000),
      related: ids(r?.related ?? [], "Related rules"),
      ...(r?.sources !== undefined ? { sources: sources(r.sources) } : {}),
      ...(r?.appliesTo ? { appliesTo: relativePath(r.appliesTo) } : {}),
    }));
    const presets = input.presets.map((p) => ({
      id: string(p?.id, "Preset ID", 150),
      title: string(p?.title, "Preset title", 100),
      ruleIds: ids(p?.ruleIds, "Preset rules"),
    }));
    const ruleIds = new Set(rules.map((r) => r.id));
    if (
      ruleIds.size !== rules.length ||
      new Set(presets.map((p) => p.id)).size !== presets.length
    )
      throw new Error("Duplicate IDs in this pack.");
    for (const r of rules)
      if (r.related.some((id) => !ruleIds.has(id) || id === r.id))
        throw new Error(`Invalid related rule in “${r.title}”.`);
    for (const p of presets)
      if (p.ruleIds.some((id) => !ruleIds.has(id)))
        throw new Error(`Missing rule referenced by preset “${p.title}”.`);
    return { version: VERSION, rules, presets };
  }
  const key = (scope, id) => JSON.stringify([scope, id]);
  const canonical = (text) => text.trim().replace(/\s+/g, " ").toLowerCase();
  function mergePack(current, incoming, replace = false) {
    current = validate(current);
    incoming = validate(incoming);
    const result = structuredClone(current),
      remap = new Map(),
      matches = new Map();
    let added = 0,
      duplicates = 0;
    for (const rule of incoming.rules) {
      const match = result.rules.find(
        (r) => r.id === rule.id || (canonical(r.text) === canonical(rule.text) && (r.appliesTo || ".") === (rule.appliesTo || ".")),
      );
      if (match) {
        remap.set(rule.id, match.id);
        matches.set(rule.id, match.id);
        duplicates++;
      } else {
        remap.set(rule.id, rule.id);
        result.rules.push({ ...rule, related: [] });
        added++;
      }
    }
    for (const rule of incoming.rules) {
      if (matches.has(rule.id) && !replace) continue;
      const id = remap.get(rule.id);
      result.rules[result.rules.findIndex((r) => r.id === id)] = {
        ...rule,
        id,
        related: [...new Set(rule.related.map((x) => remap.get(x)))].filter(
          (x) => x !== id,
        ),
      };
    }
    for (const p of incoming.presets) {
      const index = result.presets.findIndex(
        (x) => x.id === p.id || canonical(x.title) === canonical(p.title),
      );
      const next = {
        ...p,
        ruleIds: [...new Set(p.ruleIds.map((id) => remap.get(id)))],
      };
      if (index < 0) result.presets.push(next);
      else if (replace)
        result.presets[index] = { ...next, id: result.presets[index].id };
    }
    return { pack: validate(result), added, duplicates };
  }
  function subset(pack, ruleIds) {
    const selected = new Set(ruleIds);
    return validate({
      version: VERSION,
      rules: pack.rules
        .filter((r) => selected.has(r.id))
        .map((r) => ({
          ...r,
          related: r.related.filter((id) => selected.has(id)),
        })),
      presets: pack.presets.filter(
        (p) => p.ruleIds.length && p.ruleIds.every((id) => selected.has(id)),
      ),
    });
  }
  function payload(rules, mode = "inject") {
    if (!rules.length) return "";
    return `${mode === "reinforce" ? "Reminder for the current task:" : "Instructions for the current task:"}\n${rules.map((r) => "- " + (r.appliesTo && r.appliesTo !== "." ? `Only within ${r.appliesTo}/: ` : "") + r.text).join("\n")}`;
  }
  return {
    VERSION,
    empty,
    validate,
    key,
    mergePack,
    subset,
    payload,
  };
});
