# SETUP — cài trên máy mới

Framework này chỉ là **cấu hình cho Claude Code** (skills / commands / agents / hooks / rules).
Phần "đọc–ghi SAP" nằm ở MCP server `sap-adt` — một daemon Python chạy local, cài riêng.

```
Claude Code  ──.mcp.json──▶  sap-adt daemon (127.0.0.1:8765)  ──ADT/HTTP──▶  SAP S/4HANA Cloud
     │
     └──────────────────▶  agentmemory (localhost:3111, tùy chọn)
```

---

## 0. Prerequisites

| Cần | Version | Kiểm tra |
|-----|---------|----------|
| [Claude Code](https://claude.com/claude-code) | mới nhất | `claude --version` |
| Node.js | ≥ 18 (hook dùng `fetch`) | `node -v` |
| Python | ≥ 3.10 (daemon sap-adt) | `python --version` |
| Git | bất kỳ | `git --version` |

---

## 1. Clone framework

```bash
git clone https://github.com/NhatPD-VNEXT/ADT-MCP.git RAP
cd RAP
```

## 2. Chạy script setup

Windows (PowerShell):

```powershell
./scripts/setup.ps1
```

macOS / Linux / Git Bash:

```bash
bash scripts/setup.sh
```

Script sẽ:
1. Check node/python/git.
2. Clone `https://github.com/nhattuan1305/adt-mcp` vào `../adt-mcp` (đã có → `git pull`).
3. `pip install -e .` cho daemon.
4. Tạo `systems.json` từ `systems.example.json` nếu chưa có.
5. Cài `@agentmemory/agentmemory` global (tùy chọn, `-SkipMemory` / `--skip-memory` để bỏ qua).

Muốn làm tay thì xem mục 3–5 bên dưới.

## 3. Cấu hình SAP system (daemon sap-adt)

```bash
cd ../adt-mcp
python -m adt_mcp          # Windows: run.bat
```

→ mở http://127.0.0.1:8765 (web admin). Thêm system: URL, client, language, auth
(`cookie` login qua browser, hoặc `basic` username/password). Config lưu ở
`adt-mcp/systems.json` (đã gitignore ở repo daemon — **không commit file này**).

Muốn deploy (write) thì mỗi system phải bật:

```json
{
  "IPS": {
    "url": "https://myXXXXXX.s4hana.cloud.sap",
    "client": "100",
    "language": "EN",
    "auth": "cookie",
    "allow_write": true,
    "write_packages": ["Z*"]
  }
}
```

Không có `allow_write: true` → daemon chặn mọi `create_object`/`update_source`/`activate`
(read vẫn chạy). Delete không được hỗ trợ, cố ý.

Tên system ở đây chính là giá trị ghi vào frontmatter `system:` của design doc.

## 4. agentmemory (tùy chọn)

Dùng cho memory cross-session + hook auto-recall. Không có vẫn chạy được (hook fallback im lặng).

```bash
npm i -g @agentmemory/agentmemory
agentmemory        # server ở http://localhost:3111
```

Đổi port → set env `AGENTMEMORY_URL`, cả `.mcp.json` và hook đều đọc biến này.

## 5. Mở Claude Code

```bash
cd RAP
claude
```

Lần đầu Claude Code hỏi duyệt MCP server trong `.mcp.json` → chọn **Yes**
(`.claude/settings.json` đã set `enableAllProjectMcpServers: true` nên thường không hỏi lại).

Kiểm tra nhanh trong phiên:

```
/mcp                       → sap-adt, sap-docs, sap-abap, agentmemory: connected
list_systems               → phải ra danh sách system vừa cấu hình
```

SessionStart hook in trạng thái connect từng system + dashboard case đang dở.
System báo `❌ cần refresh` → gọi `refresh_cookies_for(system="<tên>")`.

---

## 6. Chạy thử

```
/rap-new "BO quản lý phiếu nhập kho có draft + Fiori UI"
/rap-design <Case>
/rap-gen <Case>
```

Chi tiết quy trình: [README.md](README.md). Rule bắt buộc: [CLAUDE.md](CLAUDE.md).

---

## Troubleshooting

| Triệu chứng | Nguyên nhân / xử lý |
|---|---|
| `/mcp` báo sap-adt failed | Daemon chưa chạy. `cd ../adt-mcp && python -m adt_mcp` |
| `list_systems` trả rỗng | `systems.json` chưa cấu hình → mở http://127.0.0.1:8765 |
| Tool trả HTML login page / `CSRF token validation failed` | Session hết hạn → `refresh_cookies_for(system="<tên>")`, KHÔNG retry mù |
| Write bị 403 / `package not allowed` | Thiếu `allow_write: true` hoặc package không khớp `write_packages` |
| Hook báo agentmemory OFFLINE | Chạy `agentmemory`, hoặc bỏ qua (không chặn) |
| Hook không chạy | Node < 18, hoặc `node` không có trong PATH |
| Port 8765 bận | Đổi port daemon rồi sửa `url` trong `.mcp.json` |

## Không có trong repo (cố ý)

- `package/*` — case data (BD khách hàng, design, review). Xem [package/README.md](package/README.md).
- `.claude/settings.local.json` — permission/MCP override per-máy.
- `.claude/.cache/` — cache metadata + trạng thái connect.
- `systems.json` — nằm ở repo daemon, chứa credential SAP.
