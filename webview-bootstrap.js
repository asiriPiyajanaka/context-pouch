// Runs at the existing acquisition site, including when Codex splits it into a chunk.
function __contextPouchCapture(api) {
  window.__contextPouchApi = {
    postMessage: (message) => api.postMessage(message),
  };
  return api;
}
