# Contributing to ConPin

## Code size

Keep each newly created JavaScript or TypeScript code file at or below 300 physical lines, including comments and blank lines. When a new file would exceed that limit, split it into focused modules. Existing larger files may remain during small fixes; do not expand their responsibilities, and extract new functionality into smaller files. Generated files and bundled output are excluded.

## Immutable values

Use `const` for JavaScript bindings that are not reassigned. Use `let` only when reassignment is necessary; do not use `var` in new code.

A `const` object can still be mutated. Treat function inputs and shared configuration as read-only: create a copy before changing them. When writing TypeScript, use `readonly` properties and `ReadonlyArray<T>` for data consumers must not mutate. Do not add TypeScript syntax to JavaScript files.

## Validation

Run `npm run check` and `npm test` after changing application behavior. Run `npm run package` when changing files shipped with the extension, and include new runtime modules in `.vscodeignore`.

## Local setup

Use Node.js 22.15 or newer (Node 22 and 24 are covered by CI), npm, and Python 3.10 or newer. There are no third-party runtime dependencies. Install the locked development tools:

```sh
npm ci
npx playwright install chromium
npm run check
npm test
npm run test:ui
npm run package
npm run package:verify
```

On Linux, Playwright may require `npx playwright install --with-deps chromium`. Browser checks use synthetic Codex markup; they do not replace installed-extension testing. Test patches against fixtures or a separate VS Code profile, never against another user's installation.

`scripts/package.py` invokes the pinned VS Code `vsce` tool. `.vscodeignore` lists the shipped runtime modules. Add new modules there and verify the archive. Node 22.15 is the minimum contributor runtime because the extension uses built-in SQLite.

Before a pull request, describe the behavior change and validation. Preserve unrelated changes. See [the release checklist](docs/release-checklist.md) for publishing gates, and [SECURITY.md](SECURITY.md) for private reports.
