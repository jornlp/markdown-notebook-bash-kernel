const vscode = require('vscode');
const cp = require('node:child_process');
const path = require('node:path');

/** @type {vscode.NotebookController | undefined} */
let controller;
/** @type {Map<string, Set<import('node:child_process').ChildProcess>>} */
const runningByNotebook = new Map();
/** @type {Map<string, vscode.Terminal>} */
const terminalByNotebook = new Map();

function getShellConfig() {
  const cfg = vscode.workspace.getConfiguration('markdownNotebookBashKernel');
  const shellExecutable = cfg.get('shellExecutable', '/bin/bash');
  const shellArgs = cfg.get('shellArgs', ['-lc']);
  const terminalShellExecutable = cfg.get('terminalShellExecutable', '');
  const terminalShellArgs = cfg.get('terminalShellArgs', []);
  const runInTerminal = cfg.get('runInTerminal', true);
  const cwdModeSetting = cfg.get('cwdMode', 'workspace');
  const cwdMode = cwdModeSetting === 'notebook' ? 'notebook' : 'workspace';

  return {
    runInTerminal,
    cwdMode,
    shellExecutable: String(shellExecutable || '/bin/bash'),
    shellArgs: Array.isArray(shellArgs) ? shellArgs.map((x) => String(x)) : ['-lc'],
    terminalShellExecutable: String(terminalShellExecutable || ''),
    terminalShellArgs: Array.isArray(terminalShellArgs) ? terminalShellArgs.map((x) => String(x)) : []
  };
}

function buildExecArgs(shellArgs, code) {
  const marker = '{code}';
  if (shellArgs.includes(marker)) {
    return shellArgs.map((arg) => (arg === marker ? code : arg));
  }

  return [...shellArgs, code];
}

function getCwd(notebook, cwdMode) {
  const ws = vscode.workspace.workspaceFolders;

  if (cwdMode === 'workspace' && ws && ws.length > 0) {
    return ws[0].uri.fsPath;
  }

  if (notebook.uri.scheme === 'file') {
    return path.dirname(notebook.uri.fsPath);
  }

  if (ws && ws.length > 0) {
    return ws[0].uri.fsPath;
  }

  return process.cwd();
}

function getWorkspaceFolderPath() {
  const ws = vscode.workspace.workspaceFolders;
  if (ws && ws.length > 0) {
    return ws[0].uri.fsPath;
  }
  return '';
}

function resolveToken(value, cwd) {
  if (typeof value !== 'string') {
    return value;
  }
  const workspaceFolder = getWorkspaceFolderPath();
  return value.replace(/\$\{([^}]+)\}/g, (full, tokenName) => {
    const normalized = String(tokenName || '').trim().toLowerCase();
    if (normalized === 'workspacefolder' || normalized === 'workspaceroot') {
      return workspaceFolder;
    }
    if (normalized === 'cwd') {
      return cwd;
    }
    return full;
  });
}

function resolveArgs(args, cwd) {
  return args.map((arg) => resolveToken(arg, cwd));
}

async function runCell(cell, notebook, execution) {
  execution.start(Date.now());

  const language = String(cell.document.languageId || '').toLowerCase();
  const supported = new Set(['bash', 'shellscript', 'sh', 'zsh']);

  if (!supported.has(language)) {
    execution.replaceOutput([
      new vscode.NotebookCellOutput([
        vscode.NotebookCellOutputItem.stderr(
          Buffer.from(`Unsupported language '${language}'. Use bash/sh/zsh.\n`)
        )
      ])
    ]);
    execution.end(false, Date.now());
    return;
  }

  const code = cell.document.getText();
  const notebookKey = notebook.uri.toString();
  const shellCfg = getShellConfig();
  const cwd = getCwd(notebook, shellCfg.cwdMode);

  execution.clearOutput();
  if (shellCfg.runInTerminal) {
    let terminal = terminalByNotebook.get(notebookKey);
    if (terminal && terminal.exitStatus !== undefined) {
      terminalByNotebook.delete(notebookKey);
      terminal = undefined;
    }
    if (!terminal) {
      const terminalOptions = {
        name: `Markdown Bash: ${path.basename(notebook.uri.path) || 'Notebook'}`,
        cwd
      };
      if (shellCfg.terminalShellExecutable) {
        terminalOptions.shellPath = resolveToken(shellCfg.terminalShellExecutable, cwd);
        terminalOptions.shellArgs = resolveArgs(shellCfg.terminalShellArgs, cwd);
      }
      terminal = vscode.window.createTerminal(terminalOptions);
      terminalByNotebook.set(notebookKey, terminal);
    }
    terminal.show(true);
    terminal.sendText(code, true);
    execution.replaceOutput([
      new vscode.NotebookCellOutput([
        vscode.NotebookCellOutputItem.stdout(
          Buffer.from('Sent to integrated terminal.\n')
        )
      ])
    ]);
    execution.end(true, Date.now());
    return;
  }

  await new Promise((resolve) => {
    let finished = false;
    const finish = (ok, outputs) => {
      if (finished) {
        return;
      }
      finished = true;
      execution.replaceOutput(outputs);
      execution.end(ok, Date.now());
      resolve();
    };

    const child = cp.execFile(
      resolveToken(shellCfg.shellExecutable, cwd),
      buildExecArgs(resolveArgs(shellCfg.shellArgs, cwd), code),
      { cwd, env: process.env, maxBuffer: 10 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const items = [];

        if (stdout && stdout.length > 0) {
          items.push(vscode.NotebookCellOutputItem.stdout(Buffer.from(stdout)));
        }
        if (stderr && stderr.length > 0) {
          items.push(vscode.NotebookCellOutputItem.stderr(Buffer.from(stderr)));
        }
        if (items.length === 0) {
          items.push(vscode.NotebookCellOutputItem.stdout(Buffer.from('')));
        }

        finish(!err, [new vscode.NotebookCellOutput(items)]);
      }
    );
    let running = runningByNotebook.get(notebookKey);
    if (!running) {
      running = new Set();
      runningByNotebook.set(notebookKey, running);
    }
    running.add(child);

    const disposeCancel = execution.token.onCancellationRequested(() => {
      if (child && child.exitCode === null && !child.killed) {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (child.exitCode === null && !child.killed) {
            child.kill('SIGKILL');
          }
        }, 1200);
      }
    });

    child.on('error', (err) => {
      finish(false, [
        new vscode.NotebookCellOutput([
          vscode.NotebookCellOutputItem.stderr(
            Buffer.from(`Failed to launch shell: ${String(err.message || err)}\n`)
          )
        ])
      ]);
    });

    child.on('exit', () => {
      disposeCancel.dispose();
      const current = runningByNotebook.get(notebookKey);
      if (current) {
        current.delete(child);
        if (current.size === 0) {
          runningByNotebook.delete(notebookKey);
        }
      }
    });
  });
}

/**
 * @param {vscode.ExtensionContext} context
 */
function activate(context) {
  vscode.window.setStatusBarMessage('Markdown Bash kernel ready', 3000);
  controller = vscode.notebooks.createNotebookController(
    'markdown-notebook-bash-kernel',
    'markdown-notebook',
    'Markdown Bash'
  );

  controller.supportedLanguages = ['bash', 'shellscript', 'sh', 'zsh'];
  controller.description = 'Execute markdown-notebook shell code cells with /bin/bash';
  controller.interruptHandler = async (notebook) => {
    const terminal = terminalByNotebook.get(notebook.uri.toString());
    if (terminal) {
      terminal.dispose();
      terminalByNotebook.delete(notebook.uri.toString());
    }

    const running = runningByNotebook.get(notebook.uri.toString());
    if (!running || running.size === 0) {
      return;
    }
    for (const child of running) {
      if (child.exitCode === null && !child.killed) {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (child.exitCode === null && !child.killed) {
            child.kill('SIGKILL');
          }
        }, 1200);
      }
    }
  };
  controller.executeHandler = async (cells, notebook) => {
    for (const cell of cells) {
      const execution = controller.createNotebookCellExecution(cell);
      await runCell(cell, notebook, execution);
    }
  };

  context.subscriptions.push(
    vscode.window.onDidCloseTerminal((closedTerminal) => {
      for (const [key, terminal] of terminalByNotebook.entries()) {
        if (terminal === closedTerminal) {
          terminalByNotebook.delete(key);
        }
      }
    })
  );

  context.subscriptions.push(controller);
}

function deactivate() {
  if (controller) {
    controller.dispose();
    controller = undefined;
  }

  for (const terminal of terminalByNotebook.values()) {
    terminal.dispose();
  }
  terminalByNotebook.clear();
}

module.exports = {
  activate,
  deactivate
};
