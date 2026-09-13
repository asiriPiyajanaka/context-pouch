# Architecture guidelines

ConPin consists of a VS Code extension host, a shared library/model, and browser-based composer and graph views.

## Modular code

Give each module one clear responsibility. Keep document discovery, provider requests, suggestion validation, persistence, and UI orchestration in separate modules as these areas grow. Avoid placing unrelated helper functions in a generic utilities module.

Keep VS Code-specific UI and filesystem orchestration out of the shared prompt model. The model should remain usable in both Node.js and webviews without importing VS Code.

## Provider boundaries

Inject provider/network dependencies so automated tests can simulate successful responses, authentication failures, cancellation, and invalid output without live paid requests.

Store API keys only through VS Code SecretStorage. Never send a key to the webview, include it in project JSON, or print it in logs.

## Saving generated rules

Require explicit review and save before persisting generated suggestions. Cancelling generation or review must leave saved rules unchanged.
