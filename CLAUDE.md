# CLAUDE.md — RAP Vibe Coding Framework

> Framework để vibe coding **SAP RAP** (RESTful Application Programming) trên ABAP Cloud/BTP. User mô tả nghiệp vụ → Claude detect pattern → sinh artifacts đúng tầng RAP / naming IPS Ver4.0 → deploy qua MCP **sap-adt**.

**Project root** = thư mục chứa file này (cùng cấp `.mcp.json`, `.claude/`, `package/`, `docs/`).

MCP server `sap-adt` là **HTTP MCP** khai trong `.mcp.json` (hiện trỏ local daemon `http://127.0.0.1:8765/mcp`). Danh sách SAP system (URL/client/auth) cấu hình **phía server MCP**, xem qua tool `list_systems`. Không có web admin / `systems.json` trong repo này.

> Endpoint là **cấu hình**, không hard-code trong tài liệu: nguồn sự thật duy nhất là `.mcp.json`. Đổi endpoint thì sửa `.mcp.json`, không sửa file .md.

## System-agnostic — BẮT BUỘC

Framework KHÔNG hard-code SAP system. 1 case = 1 system đích (tên system có trong `list_systems`), ghi trong frontmatter design doc `system:`.

- `/rap-new` hỏi user system khi tạo case → lưu vào `package/<Case>/designs/<name>_design.md` frontmatter.
- `/rap-gen` đọc `system:` từ frontmatter → truyền `system="<name>"` vào mọi sap-adt tool để deploy.
- Skill, rule, agent KHÔNG được ghi tên system cố định trong logic flow. Reference package mention system chỉ ở phần "Reference Pattern Lookup" (factual note).
- Memory entries gắn system: content phải có format `<object> trong <package> trên <system>`.

---

## Workflow tiêu chuẩn

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────────┐
│  /rap-new   │ →  │ /rap-design  │ →  │  /rap-gen    │ →  │ Manual ADT │
│  <desc>     │    │ →subagent    │    │  <case>      │    │ steps      │
└─────────────┘    └──────────────┘    └──────────────┘    └────────────┘
intent capture    Coding Design Doc   sap-adt deploy     ZJC/ZJT/ZAL/IAM/
package/<C>/      (agent-design,       + snapshot         Comm Scenario...
                   noise cô lập)
```

### 1. `/rap-new <desc>` — Khởi tạo case
- Hỏi pattern (managed BO / unmanaged API / job / HTTP / outbound …)
- Hỏi naming (Module ID, PJCode, suffix)
- Tạo `package/<CaseName>/{docs,designs,abap}/` + design skeleton 10 mục

### 2. `/rap-design <case>` — Hoàn thiện Coding Design Document
> **BẮT BUỘC dispatch subagent `agent-design`** (lệnh `/rap-design` lo việc này). KHÔNG tra metadata / viết design trên main agent — noise tra cứu cô lập trong subagent, main chỉ nhận lại design doc. Chạy trên main = phình context (case VI901: 78M cache, $82).
- Đọc BD đầu vào trong `package/<CaseName>/docs/`
- Tra metadata qua `get_source` (TABL/DDLS/BDEF/SRVD), `list_package`, `cds_dependencies`; release-state qua `api_release_state` (C0 released + Use in Cloud Development = Yes); DTEL/DOMA content qua MCP `sap-abap` (`sap_get_object_details`)
- Fill 10 mục: Requirement, Metadata, Object Impact List, Mapping, Logic, Validation, Error, Test, Open Q.
- Object Impact List có cột `MCP Deploy` đánh `auto`/`clas-confirm`/`manual`.

### 3. `/rap-gen <case>` — Deploy
- Pre-flight verify design (10 mục, naming, field type) + parse frontmatter `system`/`variant`/`package`
- **Pre-deploy scan** (trước khi write bất cứ gì): probe system & write-permission → resume (skip `Status=done`) → collision check `search_objects` → hỏi Author + 移送番号 → hỏi CLAS deploy mode
- **Confirm gate duy nhất**: in danh sách CREATE/UPDATE/SKIP/MANUAL, chờ user OK. Deploy **không revert được**.
- **Phased checkpoint (default)**: 9 phase theo tầng RAP (TABL → DDLS ZI_ → DDLS ZC_ → BDEF → ZBP_I_ → DDLX → ZCL_/ZCJ_ → SRVD/SRVB → Manual). Mỗi phase xong → update `Status` + `memory_save` + báo user + **chờ xác nhận** mới sang phase kế. Chỉ gộp khi user nói "gen hết".
- Trong 1 phase: phase nặng (CLAS, DDLS nhiều view) dispatch `agent-generate-code`; phase nhẹ main tự chạy. **1 phase = tối đa 1 subagent, không song song** — song song phá thứ tự phụ thuộc RAP.
- Per object: `syntax_check` → `create_object`/`update_source`/`update_class_include` → `activate` → read-back
- Generate Manual Steps section cho object `manual` (DEVC/ZJC/ZJT/ZAL/IAM/Comm/ZHS/ZSC/ENHO)

### 4. Manual ADT steps
User mở ADT/Fiori làm các object sap-adt không hỗ trợ (theo bảng "Manual Steps" trong design).

---

## Cấu trúc thư mục

`ls .claude/` (agents, commands, rules, skills, hooks, templates) + `package/<CaseName>/{docs,designs,abap}`. Endpoint sap-adt: `.mcp.json`.

---

## sap-adt Deployment Matrix (tóm tắt)

| Object | sap-adt support | Action |
|--------|-----------------|--------|
| TABL, DDLS, BDEF, DDLX, SRVD, SRVB, PROG, INTF | ✅ Auto | `create_object` (mới) / `update_source` (sửa) + `syntax_check` + `activate` |
| CLAS (ZBP_*/ZCL_*/ZCJ_*/ZCL_HS_*) | ⚠ Được, nhưng HỎI CONFIRM | MCP: `create_object` + `update_class_include` (main/definitions/implementations/testclasses); hoặc local snapshot `package/<C>/abap/` |
| Package (DEVC) | ❌ Manual | ADT (sap-adt không tạo package) |
| ZJC/ZJT (Job Catalog/Template), ZAL (App Log) | ❌ Manual | ADT/Fiori |
| ZHS (HTTP Service), ZSC (Consumption), ZNR (Num Range) | ❌ Manual | ADT |
| Communication Scenario/Arrangement, IAM App/Catalog | ❌ Manual | ADT/Fiori admin |

→ Chi tiết: `.claude/skills/rap-generate/SKILL.md` § 2. Cú pháp tool: `.claude/skills/rap-mcp-adt/SKILL.md`.

---

## Skills (21 RAP skills, auto-trigger theo keyword)

Danh sách + trigger + reference package nằm trong description mỗi skill (đã resident trong skill listing mỗi session) — dùng tool `Skill` để invoke. Không lặp bảng ở đây.

---

## Agents — ai gọi, làm gì

| Agent | Dispatcher | Vai trò | Gate hỏi user |
|-------|-----------|---------|---------------|
| `agent-design` | `/rap-design <Case>` — 1 lần / lệnh | Đọc BD, tra metadata live, fill 10 mục design doc | Không (main hỏi trước khi dispatch) |
| `agent-generate-code` | `/rap-gen` — **1 dispatch = 1 phase**, chỉ phase nặng (CLAS `ZBP_I_*`, CLAS `ZCL_/ZCJ_`, DDLS `ZI_` khi ≥4 view) | Load skill, search reference, sinh source, **deploy trực tiếp qua MCP** + read-back | Không — gate ở main; mỗi write vẫn qua permission prompt |
| `agent-review-code` | `/rap-review` — 1 lần / lệnh | Read-only: fetch source live, chạy 4 nhóm check, ghi `reviews/` | Không |

Nguyên tắc chung: **subagent nuốt noise tra cứu, main giữ mọi câu hỏi cho user**. Subagent không gọi `AskUserQuestion`; thiếu thông tin → trả `STOP: <lý do>` để main hỏi rồi dispatch lại.

**Confirm 2 tầng khi deploy** (không chặn MCP, chỉ bắt xác nhận):
1. `/rap-gen` § Confirm gate — user duyệt danh sách object sẽ CREATE/UPDATE trước khi bắt đầu.
2. Permission prompt Claude Code — `.claude/settings.json` allowlist **read tool** của sap-adt (khỏi hỏi lặp), **cố ý không** allowlist `create_object`/`update_source`/`update_class_include`/`activate` → mỗi write hỏi 1 lần.

`agent-design` và `agent-review-code` KHÔNG có write tool (allowlist `tools:` trong frontmatter) — design và review không được đụng vào object SAP.

## Rules (tự load từ `.claude/rules/`)

| File | Nội dung |
|------|----------|
| `abap-cloud-naming.md` | IPS Ver4.0 naming (`ZBP_I_*` KHÔNG lồng `ZI_`, package types, NN numbering) |
| `cds-field-types.md` | curr/quan/dats/numc, abstract entity, currency/quantity reference |

---

## MCP & session

- Config ở root: `.mcp.json` — server `sap-adt` (HTTP MCP; endpoint lấy từ chính `.mcp.json`, hiện là local daemon `127.0.0.1:8765`). System (URL/client/auth) cấu hình phía server MCP; liệt kê bằng `list_systems`.
- Server tự quản session/cookie từng system. Khi MCP fail vì session expired (HTML login page, `CSRF token validation failed`, redirect oauth/saml, trả `<html>` thay JSON) → **STOP, không tự retry**. Gọi `refresh_cookies_for(system="<system>")` rồi retry; nếu vẫn fail → báo user, dừng.
- Write (`create_object`/`update_source`/`update_class_include`/`activate`) chỉ chạy khi system được phép write server-side. Bị chặn (403/`package not allowed`) → báo nguyên văn lỗi, không phải session. Delete KHÔNG được hỗ trợ.

Release-state check: dùng tool `api_release_state` của chính sap-adt (Clean Core C0–C4) — object dùng được khi **C0 released + Use in Cloud Development = Yes**.

MCP bổ trợ (enabled): `sap-abap` (đọc DTEL/DOMA content via `sap_get_object_details`), `sap-docs` (tra docs), `agentmemory` (memory). Tìm reference nhanh dùng chính tool search của `sap-adt` (`search_objects`, `grep_package`, `list_package`, `find_references`, `cds_dependencies`); source authoritative đọc live qua `get_source`.

---

## 4 nguyên tắc hành vi bắt buộc

### 1. Suy nghĩ trước khi code
Nêu rõ giả định. Không chắc → hỏi. Nhiều cách hiểu → trình bày tất cả. Có cách đơn giản hơn → nói ra.

### 2. Ưu tiên sự đơn giản
Đủ code để giải quyết. Không thêm tính năng ngoài yêu cầu. Không abstraction cho code dùng 1 lần. Không "linh hoạt"/"config" nếu không yêu cầu.

### 3. Thay đổi có kiểm soát (Surgical)
Chỉ sửa cái cần sửa. Không refactor tiện tay. Tuân style hiện tại. Code thừa không liên quan → chỉ ghi chú, không xóa.

### 4. Làm việc theo mục tiêu
Xác định tiêu chí hoàn thành. Lặp cho đến khi verify được.

### KHÔNG xóa SAP object — BẮT BUỘC
Không xóa class/CDS/BDEF/table/package. Phát hiện object thừa → báo user, user xóa thủ công ADT. (sap-adt cũng không hỗ trợ delete.)

---

## agentmemory — Quy tắc lưu/lấy

**Lưu (`memory_save`) khi**:
- Tạo/sửa SAP object quan trọng (ghi object + system + package)
- Quyết định design không hiển nhiên
- Pattern/snippet đã test thành công
- Bug đã gặp và cách fix

**Lấy (`memory_smart_search`) khi**:
- Bắt đầu task liên quan BO/object đã làm trước
- User hỏi "đã làm gì với X"

Lưu chủ động, không cần hỏi user.

---

## Quick start (vibe coder mới)

1. **Khởi tạo case**:
   ```
   /rap-new "Tôi cần tạo BO quản lý phiếu nhập kho có draft + Fiori UI"
   ```
   → tạo `package/<NewCase>/`, hỏi pattern + system + naming, sinh design skeleton.

2. **Bỏ BD đầu vào** (PDF/MD) vào `package/<NewCase>/docs/`.

3. **Hoàn thiện design**:
   ```
   /rap-design <NewCase>
   ```
   → dispatch subagent agent-design: đọc BD, tra metadata qua sap-adt, fill 10 mục. Subagent cô lập noise tra cứu — main context chỉ nhận design doc (tránh phình context như case chạy trên main).

4. **Deploy**:
   ```
   /rap-gen <NewCase>
   ```
   → sap-adt deploy auto (TABL/DDLS/BDEF/DDLX/SRVD/SRVB) + hỏi confirm CLAS + tạo Manual Steps list.

5. **Làm Manual Steps trong ADT** theo bảng trong design (ZJC/ZJT, ZAL, IAM, Comm Scenario, package).

6. **Activate xong → save memory** (tự động bởi `/rap-gen`).
