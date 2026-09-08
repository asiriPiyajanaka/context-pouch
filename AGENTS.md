# Context Pouch project instructions

Read `CONTRIBUTING.md` for code-size, immutability, and validation requirements. Read `docs/architecture.md` for module and provider boundaries. These documents also serve as input for testing Pouch's project-rule generator.

## Working rules

Keep newly created code files at or below 300 physical lines. Existing larger files do not require wholesale refactoring for a small change. See `CONTRIBUTING.md` for the complete scope of this limit.

Implement focused modules with clear responsibilities. Keep the shared prompt model independent of VS Code and browser APIs.

Preserve unrelated user changes. Do not modify existing project rules merely to make a generator test pass.

Nested `AGENTS.md` instructions apply only to their own directories and descendants. Preserve that scope when converting documentation into Pouch rules.
