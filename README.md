# Markdown Notebook Bash Kernel (Local)

This local VS Code extension provides a runnable `bash` kernel for `markdown-notebook` (`.md`) documents.

## One-command install

```bash
./scripts/install.sh
```

This does all of the following:

- Builds this extension.
- Installs `ms-vscode.vscode-markdown-notebook`.
- Installs this local kernel extension into `~/.vscode/extensions`.

## Manual build

```bash
npm run build
```

## Release package

Published GitHub Releases include a downloadable `.vsix` package built by GitHub Actions.

For local installation and development, continue using:

```bash
./scripts/install.sh
```

## Use in VS Code

1. Reload VS Code (`Developer: Reload Window`).
2. Open an `.md` file with the **Markdown Notebook** editor.
3. Select kernel **Markdown Bash**.
4. Run cells. By default commands are sent to the integrated terminal.

## Execution mode

- Default mode is terminal mode (`markdownNotebookBashKernel.runInTerminal: true`).
- To capture output directly in notebook cells, set `markdownNotebookBashKernel.runInTerminal` to `false`.
- Working directory mode is configurable via `markdownNotebookBashKernel.cwdMode`:
  - `workspace` (default): use current workspace folder
  - `notebook`: use markdown file folder
- Direct execution mode uses configurable `shellExecutable` and `shellArgs`.
- Terminal mode can optionally use `terminalShellExecutable` and `terminalShellArgs`.

## Docker-backed execution example

To run cell execution inside an existing container named `workshop`:

```json
{
  "markdownNotebookBashKernel.runInTerminal": false,
  "markdownNotebookBashKernel.shellExecutable": "docker",
  "markdownNotebookBashKernel.shellArgs": ["exec", "-i", "workshop", "bash", "-lc", "{code}"]
}
```

To open integrated terminals directly as Docker shells:

```json
{
  "markdownNotebookBashKernel.runInTerminal": true,
  "markdownNotebookBashKernel.terminalShellExecutable": "docker",
  "markdownNotebookBashKernel.terminalShellArgs": ["exec", "-it", "workshop", "bash", "-l"]
}
```

## Notes

- By default executes code through `/bin/bash -lc` (configurable).
- Known placeholders in shell settings are case-insensitive:
  - `${workspaceFolder}` / `${workspacefolder}` / `${workspaceRoot}`
  - `${cwd}`
- Supported language IDs: `bash`, `shellscript`, `sh`, `zsh`.
