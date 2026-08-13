#!/usr/bin/env bash
# setup.sh — cài prerequisites cho RAP framework (macOS/Linux/Git Bash).
# Chạy:  bash scripts/setup.sh  [--daemon-path ../adt-mcp] [--skip-memory]
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DAEMON_PATH="$(dirname "$ROOT")/adt-mcp"
SKIP_MEMORY=0

while [ $# -gt 0 ]; do
  case "$1" in
    --daemon-path) DAEMON_PATH="$2"; shift 2 ;;
    --skip-memory) SKIP_MEMORY=1; shift ;;
    *) echo "tham số lạ: $1"; exit 1 ;;
  esac
done

need() {
  command -v "$1" >/dev/null 2>&1 || { echo "[X] thiếu '$1' — $2"; exit 1; }
  echo "[ok] $1"
}

PY=python3; command -v python3 >/dev/null 2>&1 || PY=python

echo "== 1. Check prerequisites =="
need git  "https://git-scm.com"
need node "Node >= 18: https://nodejs.org"
need "$PY" "Python >= 3.10: https://python.org"

NODE_MAJOR="$(node -v | sed 's/^v//' | cut -d. -f1)"
[ "$NODE_MAJOR" -ge 18 ] || { echo "[X] Node $NODE_MAJOR quá cũ, cần >= 18 (hook dùng fetch)"; exit 1; }

echo
echo "== 2. Daemon sap-adt -> $DAEMON_PATH =="
if [ -d "$DAEMON_PATH/.git" ]; then
  echo "đã có, git pull..."
  git -C "$DAEMON_PATH" pull --ff-only
else
  git clone https://github.com/nhattuan1305/adt-mcp "$DAEMON_PATH"
fi

echo
echo "== 3. pip install daemon =="
"$PY" -m pip install -e "$DAEMON_PATH"

if [ ! -f "$DAEMON_PATH/systems.json" ] && [ -f "$DAEMON_PATH/systems.example.json" ]; then
  cp "$DAEMON_PATH/systems.example.json" "$DAEMON_PATH/systems.json"
  echo "[!] đã tạo systems.json từ example — cấu hình SAP system tại http://127.0.0.1:8765"
fi

if [ "$SKIP_MEMORY" -eq 0 ]; then
  echo
  echo "== 4. agentmemory (tùy chọn) =="
  npm i -g @agentmemory/agentmemory || echo "[!] bỏ qua agentmemory"
fi

cat <<EOF

== Xong. Bước tiếp theo ==
  1) Chạy daemon:   cd "$DAEMON_PATH" && $PY -m adt_mcp
  2) Cấu hình system tại http://127.0.0.1:8765  (bật allow_write nếu cần deploy)
  3) agentmemory (tùy chọn):  agentmemory
  4) cd "$ROOT" && claude   →  /mcp  và  list_systems  để verify
Chi tiết: SETUP.md
EOF
