# LSP

Batch TypeScript, JavaScript, Python, Bash and C# navigation through pinned
language servers, in one plugin with one shared read-only CLI.

## Install

From the [Package Manager](https://github.com/PedroAVJ/near) marketplace:

```sh
codex plugin add lsp@near
claude plugin install lsp@near
```

Self-contained plugin for Codex and Claude Code: both client manifests and a
skill-exposed CLI. No MCP daemon or editor extension is required.

| Language | Extensions | Server |
| --- | --- | --- |
| `typescript` | .ts .tsx .js .jsx .mjs .cjs | typescript-language-server 5.3.0 (TypeScript 5.9.3 fallback) |
| `python` | .py .pyi | Pyright 1.1.414 |
| `bash` | .sh .bash | bash-language-server 5.6.0 |
| `csharp` | .cs | csharp-ls 0.20.0 (.NET SDK 9) |

- Setup: `node scripts/setup.mjs [language ...]` (no argument installs every language)
- Usage: `node scripts/query.mjs --help`
- Tests: `npm test`; `CODE_NAV_LIVE_TEST=1 npm test` exercises every installed server
- [Agent instructions](skills/navigate/SKILL.md)

Each language's pins live in `servers/<language>.json` and, for npm-based
servers, `runtime/<language>/package-lock.json`. Runtimes install under
`~/.local/share/code-navigation/<server>/<config-hash>`, outside the plugin
archive. Query wrappers do not send code to external services or models; setup
contacts package registries. This is not a sandbox: language servers read
dependencies and evaluate trusted project configuration. Project tests are still
required.

This plugin replaces the former `typescript-lsp`, `python-lsp`, `bash-lsp` and
`csharp-lsp` plugins. Server names and configurations are unchanged, so runtimes
they installed are reused. ast-grep remains a separate plugin.

Objective: replace repeated model-driven searches/reads with one deterministic
bounded batch. Actual task-level response/cost savings have not been benchmarked.

## License

First-party source is MIT licensed; see [LICENSE](LICENSE). Runtime language
tools are downloaded at setup and keep their own licenses; see
[third-party notices](THIRD_PARTY_NOTICES.md) and [icon provenance](ICON-SOURCES.md).
