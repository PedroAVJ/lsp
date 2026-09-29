# Repository guidance

- This repository is the canonical source for the public `lsp` plugin in both Codex and Claude Code, installed as `lsp@near`.
- Keep `package.json`, `.codex-plugin/plugin.json`, and `.claude-plugin/plugin.json` versions aligned.
- Keep the CLI read-only: no source edits, rewrites, renames, formatting, or deployment.
- Add a language as `servers/<language>.json` plus, for npm servers, `runtime/<language>/package.json` and `package-lock.json`, a fixture, and skill notes. Changing a server configuration changes its runtime hash and requires a new setup.
- Pin runtime dependencies. Never commit installed runtimes, `node_modules`, `bin/`, `obj/`, credentials, or private project names and paths.
- Run `npm test`, `CODE_NAV_LIVE_TEST=1 npm test` when the runtimes are installed, `claude plugin validate .`, and `git diff --check` before release.
- Release through both Package Manager catalogs and verify installation in Codex and Claude.
