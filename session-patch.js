"use strict";

// Recognize the manager and native last-turn accessor, not minifier identifiers.
function inspect(source) {
  const legacy = [...source.matchAll(/setActiveConversation\((\w+),(\w+)\)\{this\.inactiveThreadUnsubscriber\.setActive\(\1,\2\),this\.streamState\.setConversationFollowing\(\1,\2\)\}/g)];
  const retained = [...source.matchAll(/retainActiveConversation\(([\w$]+)\)\{return this\.assertActive\(\),new [\w$]+\(this\.threadStore\.retainActiveConversation\(\1,([\w$]+)=>\{this\.inactiveThreadUnsubscriber\.handleConversationActivityChanged\(\1,\2\),this\.streamState\.setConversationFollowing\(\1,\2\)\}\)\)\}/g)];
  const active = [...legacy, ...retained];
  const latest = [...source.matchAll(/function ([\w$]+)\((\w+)\)\{if\(\2\.turnHistory\?\.kind===`canonical`\)\{let\{history:/g)]
    .filter(match => /\}\}return [\w$]+\(\w+\)\.at\(-1\)\?\?null$/.test(source.slice(match.index).split("}function", 1)[0]));
  if (active.length !== 1 || latest.length !== 1) return null;
  const methods = ["sendRequest(", "startTurn(", "interruptConversation(", "addConversationCallback("];
  if (!methods.every(method => source.includes(method))) return null;
  return { active: active[0][0], id: active[0][1], enabled: active[0][2], latest: latest[0][1], retained: retained.length === 1 };
}

function patch(source, bridge) {
  const match = inspect(source);
  if (!match) throw new Error("Unsupported Codex session controls. No bundles were changed.");
  const hook = `globalThis.window?.__contextPouchCaptureSession?.(this,${match.id},${match.enabled},${match.latest},${match.retained});`;
  const anchor = match.retained ? "=>{" : "{";
  return bridge + "\n" + source.replace(match.active, match.active.replace(anchor, anchor + hook));
}

module.exports = { inspect, patch };
