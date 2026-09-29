---
name: navigate
description: Batch TypeScript, JavaScript, Python, Bash and C# navigation through pinned language servers. Use when inspecting LSP definitions, references, callers, outlines, hover types or diagnostics in .ts/.tsx/.js/.jsx/.mjs/.cjs, .py/.pyi, .sh/.bash or .cs files.
---

# LSP navigation

Use for language-server definitions, references, outlines and types. Use rg for literal text/filenames and ast-grep for structural patterns.

## Reduce model round trips

Collect related lookup questions into one batch (1–20 queries). Prefer inspect to separate definition, references, and hover calls. Read relevant bodies afterward only if needed. Do not repeat broad searches when results answer the question. This reduces lookup turns, not necessary reasoning, tests or verification. Do not claim measured savings without a benchmark.

Set PLUGIN_ROOT to this skill's plugin directory (two levels above this SKILL.md). Use the loaded location, not a hard-coded cache version.

```sh
node "$PLUGIN_ROOT/scripts/query.mjs" --root /absolute/project --queries '[{"op":"inspect","file":"relative/file.ts","symbol":"ExactIdentifier","occurrence":1},{"op":"symbols","file":"relative/file.ts"}]' --limit 20
```

One batch runs one language server. The language is inferred from the queried file extensions; split mixed-language questions into one batch per language. Pass `--language typescript|python|bash|csharp` for a batch that contains only workspaceSymbols.

Operations: inspect (definition + references + hover), definition, references, hover, implementation, typeDefinition, symbols, workspaceSymbols, diagnostics. workspaceSymbols takes query instead of file. Other operations take file; positional operations take symbol (plus occurrence if ambiguous) or line and column. Coordinates/occurrences are 1-based; columns are UTF-16 units. Symbol is a lexical locator, not semantic disambiguation; use a position if the name also occurs in strings/comments. Ambiguity is reported, not guessed.

JSON results use --limit (default 40, maximum 200) and text caps. Check truncated/omitted indicators; narrow or increase the limit only when omitted results matter. Unsupported, timed-out, unresolved and not-received are not evidence of absence. Exit 1 means at least one query failed; successful entries remain usable.

## Languages

- **TypeScript / JavaScript** (`typescript`): .ts/.tsx/.js/.jsx/.mjs/.cjs. Choose the tsconfig/jsconfig project root. Uses typescript-language-server 5.3.0, with TypeScript 5.9.3 as fallback; the server may use the project's installed TypeScript. Missing dependencies/excluded files reduce coverage. Do not install packages into the target project merely to answer a read-only query.
- **Python** (`python`): .py/.pyi with Pyright 1.1.414. Select the Python project root. For an existing virtual environment use --settings '{"python":{"pythonPath":"/absolute/venv/bin/python"}}'. Open-file diagnostic mode avoids a repository-wide sweep. Missing packages/stubs can produce Unknown; do not present that as a concrete type.
- **Bash** (`bash`): .sh/.bash via bash-language-server 5.6.0, not full zsh/fish semantics. Waits for parsing before querying each opened file. ShellCheck and shfmt are disabled; scripts are parsed, not executed. References depend on opened/sourced files and background indexing; they are not proof of whole-project absence. Open related files in the same batch. Diagnostics are parser diagnostics, not full shell lint.
- **C#** (`csharp`): .cs via csharp-ls 0.20.0. Choose the .sln root for solution-wide references; a .csproj directory deliberately narrows coverage. The client waits for project loading. Select an ambiguous solution with --settings '{"csharp":{"solution":"Name.sln"}}'. Requires .NET SDK 9. Missing restores/references reduce semantic accuracy. Do not silently restore/build the target project on a read-only request. MSBuild evaluates project configuration: query trusted workspaces only. Run heavy C# queries serially with other memory-heavy work.

## Runtime

If a language's runtime is missing, the query names the setup command. Run it once for that language:

```sh
node "$PLUGIN_ROOT/scripts/setup.mjs" typescript
```

With no argument, setup installs every language. Setup downloads pinned packages into ~/.local/share/code-navigation, outside the target repository; no global tools or model API calls. Requires Node 20+ and npm, plus .NET SDK 9 for C#. Queries never download packages automatically. Servers process one batch then exit; no permanent indexer. Default per-request timeout 90000 ms, total deadline 180 seconds. Servers may read local dependencies and evaluate configuration; use only trusted workspaces. No automatic source edits, rename, formatting, deployment, or production access.
