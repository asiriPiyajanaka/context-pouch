// Embedded in the Codex host bundle. Only ConPin messages are routed to ConPin.
function __contextPouchWrapVscode(vscode) {
  const cache =
    __contextPouchWrapVscode.cache ||
    (__contextPouchWrapVscode.cache = new WeakMap());
  if (cache.has(vscode)) return cache.get(vscode);
  const attached = new WeakSet();
  function attach(owner) {
    const webview = owner.webview;
    if (attached.has(webview)) return;
    attached.add(webview);
    const listener = webview.onDidReceiveMessage(async (message) => {
      if (
        message?.channel !== "context-pouch" ||
        typeof message.id !== "string"
      )
        return;
      try {
        const result = await vscode.commands.executeCommand(
          "conpin.bridge",
          message,
          webview,
        );
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
      listener.dispose();
      vscode.commands
        .executeCommand("conpin.disconnect", webview)
        .then(undefined, () => {});
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
