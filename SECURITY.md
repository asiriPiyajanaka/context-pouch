# Security policy

ConPin is experimental. Security fixes target the latest release; older versions are not maintained separately.

Do not include API keys, private project documents, database exports, or active conversation contents in public issues.

Use GitHub's private vulnerability reporting on this repository when its **Security → Report a vulnerability** option is available. If that option is absent, open a minimal issue asking the maintainer to enable private reporting, without publishing vulnerability details or an exploit. The maintainer must enable and verify this route before public release.

Include the ConPin, VS Code, and Codex versions, operating system, impact, and minimal reproduction in the private report. There is no guaranteed response-time commitment.

ConPin modifies installed Codex bundles only after consent. Backups and hash checks support restoration. If a bundle or backup has changed externally, recovery refuses to overwrite it. See [support and recovery](SUPPORT.md).
