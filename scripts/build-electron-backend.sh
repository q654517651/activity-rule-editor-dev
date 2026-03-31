#!/bin/bash

set -euo pipefail

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
DIST_DIR="$ROOT_DIR/electron/backend-dist"
WORK_DIR="$ROOT_DIR/electron/backend-build"
SPEC_DIR="$ROOT_DIR/electron"
SPEC_FILE="$SPEC_DIR/activity-rule-editor-backend.spec"

echo "🐍 构建 Electron Python 后端单文件..."
echo "ROOT_DIR=$ROOT_DIR"

rm -rf "$DIST_DIR" "$WORK_DIR" "$SPEC_FILE"
mkdir -p "$DIST_DIR" "$WORK_DIR"

cd "$ROOT_DIR"

uv run pyinstaller \
  --noconfirm \
  --clean \
  --onefile \
  --name activity-rule-editor-backend \
  --distpath "$DIST_DIR" \
  --workpath "$WORK_DIR" \
  --specpath "$SPEC_DIR" \
  --paths "$ROOT_DIR" \
  --collect-submodules uvicorn \
  --collect-all openpyxl \
  --hidden-import python_multipart \
  "$ROOT_DIR/backend/electron_server.py"

chmod +x "$DIST_DIR/activity-rule-editor-backend" 2>/dev/null || true
rm -rf "$WORK_DIR" "$SPEC_FILE"

echo "✅ Python 后端单文件已生成：$DIST_DIR/activity-rule-editor-backend"
