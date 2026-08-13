# setup.ps1 — cài prerequisites cho RAP framework trên Windows.
# Chạy:  ./scripts/setup.ps1  [-DaemonPath ..\adt-mcp] [-SkipMemory]
param(
  [string]$DaemonPath = "",
  [switch]$SkipMemory
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $PSScriptRoot
if (-not $DaemonPath) { $DaemonPath = Join-Path (Split-Path -Parent $root) "adt-mcp" }

function Need($cmd, $hint) {
  if (-not (Get-Command $cmd -ErrorAction SilentlyContinue)) {
    Write-Host "[X] thiếu '$cmd' — $hint" -ForegroundColor Red
    exit 1
  }
  Write-Host "[ok] $cmd" -ForegroundColor Green
}

Write-Host "== 1. Check prerequisites =="
Need git    "https://git-scm.com"
Need node   "Node >= 18: https://nodejs.org"
Need python "Python >= 3.10: https://python.org"

$nodeMajor = [int](((node -v) -replace '^v','') -split '\.')[0]
if ($nodeMajor -lt 18) { Write-Host "[X] Node $nodeMajor quá cũ, cần >= 18 (hook dùng fetch)" -ForegroundColor Red; exit 1 }

Write-Host "`n== 2. Daemon sap-adt -> $DaemonPath =="
if (Test-Path (Join-Path $DaemonPath ".git")) {
  Write-Host "đã có, git pull..."
  git -C $DaemonPath pull --ff-only
} else {
  git clone https://github.com/nhattuan1305/adt-mcp $DaemonPath
}

Write-Host "`n== 3. pip install daemon =="
python -m pip install -e $DaemonPath

$systems = Join-Path $DaemonPath "systems.json"
$example = Join-Path $DaemonPath "systems.example.json"
if (-not (Test-Path $systems) -and (Test-Path $example)) {
  Copy-Item $example $systems
  Write-Host "[!] đã tạo $systems từ example — cấu hình SAP system tại http://127.0.0.1:8765" -ForegroundColor Yellow
}

if (-not $SkipMemory) {
  Write-Host "`n== 4. agentmemory (tùy chọn) =="
  try { npm i -g "@agentmemory/agentmemory" } catch { Write-Host "[!] bỏ qua agentmemory: $_" -ForegroundColor Yellow }
}

Write-Host @"

== Xong. Bước tiếp theo ==
  1) Chạy daemon:   cd $DaemonPath ; python -m adt_mcp      (hoặc run.bat)
  2) Cấu hình system tại http://127.0.0.1:8765  (bật allow_write nếu cần deploy)
  3) agentmemory (tùy chọn):  agentmemory
  4) cd $root ; claude   →  /mcp  và  list_systems  để verify
Chi tiết: SETUP.md
"@ -ForegroundColor Cyan
