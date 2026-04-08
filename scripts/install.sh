#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
PKG_JSON="$ROOT_DIR/package.json"

if ! command -v code >/dev/null 2>&1; then
  echo "ERROR: 'code' CLI not found. In VS Code: Command Palette -> 'Shell Command: Install code command in PATH'."
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: node is required."
  exit 1
fi

PUBLISHER="$(node -p "require(process.argv[1]).publisher" "$PKG_JSON")"
NAME="$(node -p "require(process.argv[1]).name" "$PKG_JSON")"
VERSION="$(node -p "require(process.argv[1]).version" "$PKG_JSON")"
TARGET_DIR="$HOME/.vscode/extensions/${PUBLISHER}.${NAME}-${VERSION}"

echo "[1/3] Building local kernel extension..."
(cd "$ROOT_DIR" && npm run build >/dev/null)

echo "[2/3] Installing markdown notebook extension..."
code --install-extension ms-vscode.vscode-markdown-notebook --force >/dev/null

echo "[3/3] Installing local markdown bash kernel extension..."
mkdir -p "$TARGET_DIR"
rsync -a --delete \
  --exclude '.git' \
  --exclude 'node_modules' \
  "$ROOT_DIR/" "$TARGET_DIR/"

echo

echo "Installed:"
echo "- ms-vscode.vscode-markdown-notebook"
echo "- ${PUBLISHER}.${NAME} v${VERSION}"
echo
echo "Next: reload VS Code window (Developer: Reload Window)."
