// Embedded in the Codex host bundle. Only ConPin messages are routed to ConPin.
function __contextPouchWrapVscode(vscode, extensionId) {
  const cache =
    __contextPouchWrapVscode.cache ||
    (__contextPouchWrapVscode.cache = new WeakMap());
  if (cache.has(vscode)) return cache.get(vscode);
  const attached = new WeakSet();
  function attach(owner) {
    const webview = owner.webview;
    if (attached.has(webview)) return;
    attached.add(webview);
    let connection;
    let disposed = false;
    const listener = webview.onDidReceiveMessage(async (message) => {
      if (
        message?.channel !== "context-pouch" ||
        typeof message.id !== "string"
      )
        return;
      try {
        const extension = vscode.extensions.getExtension(extensionId);
        if (!extension) throw new Error("ConPin is unavailable. Enable or reinstall ConPin, then reload VS Code.");
        const api = await extension.activate();
        if (disposed) return;
        if (typeof api?.request !== "function" || typeof api?.disconnect !== "function")
          throw new Error("ConPin could not connect. Check workspace trust and disable the old Context Pouch extension, then reload VS Code.");
        connection = api;
        const result = await api.request(message, webview);
        await webview.postMessage({
          channel: "context-pouch",
          id: message.id,
          result,
        });
      } catch (error) {
        await webview.postMessage({
          channel: "context-pouch",
          id: message.id,
          error: String(error.message || error),
        });
      }
    });
    owner.onDidDispose(() => {
      disposed = true;
      listener.dispose();
      connection?.disconnect(webview);
    });
  }
  const window = new Proxy(
    {},
    {
      get(_target, property) {
        const target = vscode.window;
        if (property === "createWebviewPanel")
          return (...args) => {
            const panel = target.createWebviewPanel(...args);
            attach(panel);
            return panel;
          };
        if (property === "registerWebviewViewProvider")
          return (id, provider, options) =>
            target.registerWebviewViewProvider(
              id,
              {
                resolveWebviewView(view, context, token) {
                  attach(view);
                  return provider.resolveWebviewView(view, context, token);
                },
              },
              options,
            );
        return Reflect.get(target, property);
      },
      has(_target, property) {
        return property in vscode.window;
      },
      ownKeys() {
        return Reflect.ownKeys(vscode.window);
      },
      getOwnPropertyDescriptor(_target, property) {
        const descriptor = Object.getOwnPropertyDescriptor(
          vscode.window,
          property,
        );
        return descriptor ? { ...descriptor, configurable: true } : undefined;
      },
    },
  );
  const wrapped = { ...vscode, window };
  cache.set(vscode, wrapped);
  return wrapped;
}
