# Contributing to Context Pouch

## Code size

Keep each newly created JavaScript or TypeScript code file at or below 300 physical lines, including comments and blank lines. When a new file would exceed that limit, split it into focused modules. Existing larger files may remain during small fixes; do not expand their responsibilities, and extract new functionality into smaller files. Generated files and bundled output are excluded.

## Immutable values

Use `const` for JavaScript bindings that are not reassigned. Use `let` only when reassignment is necessary; do not use `var` in new code.

A `const` object can still be mutated. Treat function inputs and shared configuration as read-only: create a copy before changing them. When writing TypeScript, use `readonly` properties and `ReadonlyArray<T>` for data consumers must not mutate. Do not add TypeScript syntax to JavaScript files.

## Validation

Run `npm run check` and `npm test` after changing application behavior. Run `npm run package` when changing files shipped with the extension, and include new runtime modules in `scripts/package.py`.
