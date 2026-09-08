/* Pure selection and precedence model shared by host and tests. */
"use strict";
const M = require("./model");
function resolve(rules, preferences, globalDefaults = []) {
  const available = new Set(rules.map(r => r.key));
  const defaults = [...new Set([...globalDefaults, ...(preferences.defaults || [])])].filter(k => available.has(k));
  const wanted = (preferences.selected ?? defaults).filter(k => available.has(k));
  const disabled = new Set(preferences.disabled || []);
  const overrides = (preferences.overrides || []).filter(([p,g]) => available.has(p) && available.has(g));
  const suppressed = new Map(overrides.filter(([p]) => wanted.includes(p)).map(([p,g]) => [g,p]));
  const effective = rules.filter(r => wanted.includes(r.key) && !disabled.has(r.key) && !suppressed.has(r.key))
    .sort((a,b) => Number(b.scope === "project") - Number(a.scope === "project"));
  const selected = effective.map(r => r.key);
  const conflicts = (preferences.conflicts || []).filter(([a,b]) => available.has(a) && available.has(b));
  return {
    defaults, wanted, selected, overrides, conflicts,
    activeConflicts: conflicts.filter(([a,b]) => selected.includes(a) && selected.includes(b)),
    rules: rules.map(r => ({...r, isDefault:defaults.includes(r.key), globalDefault:globalDefaults.includes(r.key), disabledHere:disabled.has(r.key),
      overriddenBy:suppressed.get(r.key) || null})),
    instructions: M.payload(effective),
  };
}
module.exports = { resolve };
