# RAP — Vibe Coding Framework cho SAP RAP

Framework để **vibe coding** SAP RAP (RESTful Application Programming) trên ABAP Cloud/BTP.
Bạn mô tả nghiệp vụ bằng ngôn ngữ tự nhiên → Claude detect pattern → tra metadata SAP **live** → sinh artifacts đúng tầng RAP, đúng naming **IPS Ver4.0** → deploy trực tiếp lên SAP qua MCP `sap-adt`.

> README này mô tả **quy trình làm việc chi tiết**. Rule đầy đủ ở [CLAUDE.md](CLAUDE.md), naming ở [.claude/rules/abap-cloud-naming.md](.claude/rules/abap-cloud-naming.md), field type ở [.claude/rules/cds-field-types.md](.claude/rules/cds-field-types.md).

---

## Mục lục

1. [Triết lý & tổng quan](#1-triết-lý--tổng-quan)
2. [Quy trình 4 bước (chi tiết)](#2-quy-trình-4-bước-chi-tiết)
3. [Coding Design Document — 10 mục](#3-coding-design-document--10-mục)
4. [RAP build order & Deployment Matrix](#4-rap-build-order--deployment-matrix)
5. [Pattern → Skill stack](#5-pattern--skill-stack)
6. [Naming IPS Ver4.0 (tóm tắt)](#6-naming-ips-ver40-tóm-tắt)
7. [MCP servers & session handling](#7-mcp-servers--session-handling)
8. [Hooks tự động](#8-hooks-tự-động)
9. [Cấu trúc thư mục](#9-cấu-trúc-thư-mục)
10. [Nguyên tắc bắt buộc](#10-nguyên-tắc-bắt-buộc)
11. [Quick start](#11-quick-start)

---

## 1. Triết lý & tổng quan

- **System-agnostic**: framework KHÔNG hard-code SAP system. 1 case = 1 system đích, ghi ở frontmatter design doc (`system:`). Mọi sap-adt tool nhận `system="<name>"` lúc deploy.
- **Design-first**: không generate code từ mô tả mơ hồ. Phải có Coding Design Document 10 mục (metadata đã verify live) trước khi deploy.
- **Metadata authoritative**: field/table/CDS/release-state đọc **live** qua `sap-adt`, không đoán từ tài liệu cũ.
- **Surgical & no-delete**: chỉ sửa cái cần sửa; KHÔNG xóa SAP object (sap-adt cũng không hỗ trợ delete).

```
┌─────────────┐    ┌──────────────┐    ┌──────────────┐    ┌────────────┐
│  /rap-new   │ →  │ agent-design │ →  │  /rap-gen    │ →  │ Manual ADT │
│  <mô tả>    │    │  (10 mục)    │    │  <case>      │    │ steps      │
└─────────────┘    └──────────────┘    └──────────────┘    └────────────┘
 intent capture   Coding Design Doc    sap-adt deploy      ZJC/ZJT/ZAL/IAM/
 + pattern        tra metadata live    auto + snapshot     Comm Scenario...
 + system+naming  (sap-adt / sap-abap) + memory save       (làm tay)
```

Vòng lặp review tùy chọn: `/rap-review` đối chiếu code đã activate vs design + naming + coding rules.

---

## 2. Quy trình 4 bước (chi tiết)

### Bước 1 — `/rap-new <mô tả>` : Khởi tạo case

Lệnh: [.claude/commands/rap-new.md](.claude/commands/rap-new.md)

1. **Phân tích mô tả** — đánh dấu 4 mục là đã rõ hay chưa: SAP system · pattern · variant · PJCode + package.
2. **Hỏi 1 lượt** (`AskUserQuestion`, tối đa 4 câu) đúng những mục **chưa rõ**:
   - **System** — options từ `list_systems`, ghi vào frontmatter `system:`
   - **Pattern** — Managed BO+Fiori / Web API / Job / DWH-APS sender / HTTP Inbound / Outbound OData / Read-only list / 帳票 SVF / Analytical CDS / BAdI extension
   - **Variant** — `Local VN` (suffix `_VN` cho MỌI object) hoặc `Global`
   - **PJCode + package** — PJCode (ModuleID + 3 digit, PJ固有 dùng 901+) và package có sẵn hay tạo mới
3. **Suy ra, KHÔNG hỏi** — Module ID (= ký tự đầu PJCode) · package type (TPL/REP/FUN/IF/BI, suy từ pattern) · package name · CaseName. Verify tự động: `list_package` (package có sẵn), `search_objects` (collision PJCode).
4. **1 confirm block duy nhất** — bảng naming **chỉ in rows liên quan pattern đã chọn** + system + package + variant + cảnh báo collision. User OK mới tạo file.
5. **Tạo package** — `package/<Case>/{docs,designs,abap}/` + copy design skeleton, pre-fill mục 1 (Requirement), mục 3 (Object Impact List theo pattern), mục 10 (Open Questions cho phần thuộc design-time).

> Bước này CHỈ tạo file local — KHÔNG tạo object SAP. Giảm từ ~10 lượt hỏi xuống **1 lượt hỏi + 1 lượt confirm**.

### Bước 2 — `/rap-design <case>` : Hoàn thiện design

Lệnh [/rap-design](.claude/commands/rap-design.md) **BẮT BUỘC dispatch subagent** [agent-design](.claude/agents/agent-design.md) — noise tra metadata cô lập trong subagent, main context chỉ nhận design doc. KHÔNG chạy trên main (case VI901 chạy main: 78M cache, $82).

1. Bỏ Business Design đầu vào (PDF/MD) vào `package/<Case>/docs/`.
2. **Skill routing** — detect pattern → load skill `rap-*` tương ứng trước khi viết design.
3. **Reference search** (tool search của `sap-adt`: `search_objects`, `grep_package`, `list_package`) — tìm object/pattern tương tự đã activate trên system live để tham chiếu.
4. **Tra metadata live** (BẮT BUỘC, authoritative):
   - `get_source(system, "TABL"/"DDLS"/"BDEF"/"SRVD", ...)` — field, key, association, behavior.
   - `mcp__sap-abap__sap_get_object_details(objectType="DTEL"/"DOMA", ...)` — data element, domain, fixed values.
   - `cds_dependencies` — FROM/JOIN/ASSOCIATION upstream.
   - `api_release_state(system, "<TYPE>", "<name>")` — Clean Core. **Dùng được khi C0 released + Use in Cloud Development = Yes**. Chưa released → tìm alternative, ghi Open Questions.
5. Fill đủ **10 mục** (xem §3) → ghi `package/<Case>/designs/<name>_design.md`.

> Agent KHÔNG generate, KHÔNG deploy. Field chưa verify MCP → KHÔNG đưa vào design.

### Bước 3 — `/rap-gen <case>` : Deploy

Lệnh: [.claude/commands/rap-gen.md](.claude/commands/rap-gen.md)

**Pre-flight (STOP nếu fail):**
- Resolve design path, đọc, parse frontmatter `system` (thiếu/không có trong `list_systems` → STOP).
- Parse `variant`/`suffix`; scan Object Impact List verify suffix nhất quán (Local VN: mọi object `_VN`; Global: không object nào `_VN`). Mismatch → STOP.
- Verify đủ 10 mục. Load skill `rap-generate` + `rap-mcp-adt`.

**Pre-deploy scan (trước khi write bất cứ gì):**
- **Probe system** — `list_package`. Session expired → `refresh_cookies_for` + retry 1 lần. 403 / `package not allowed` → STOP (không phải lỗi session, không retry).
- **Resume** — đọc cột `Status`, object `done` thì **skip**.
- **Collision** — `search_objects` mọi object pending:
  - Design ghi `create` mà object **đã tồn tại** → đọc package thật + description + header `変更履歴` của nó, rồi **hỏi user**: **dùng luôn object cũ** (đổi `Action`→`edit`, ghi đè source) / **đổi tên** (NN kế tiếp) / **bỏ qua** / **hủy deploy**. Object nằm ở **package khác** design → mặc định đề xuất đổi tên. **Không bao giờ** tự đổi `create`→`update`.
  - Design ghi `edit` mà object **không tồn tại** → hỏi: tạo mới / sửa tên (gõ nhầm?) / bỏ qua.
  - Quyết định được ghi vào design **trước khi** deploy; object bị ghi đè in riêng một dòng ở confirm gate.
- **Hỏi 1 lần**: Author (社員ID) + 移送番号 cho block 変更履歴, và CLAS deploy mode (MCP hay local snapshot).

**Confirm gate — duy nhất:** in bảng CREATE / UPDATE / SKIP / MANUAL, chờ user OK. Deploy **không revert được**.

**Execution — phased checkpoint (default):** 9 phase theo tầng RAP, **sau mỗi phase dừng báo user chờ xác nhận**:

```
1 TABL(+_D) · 2 DDLS ZI_ · 3 DDLS ZC_ · 4 BDEF ZI_+ZC_ · 5 CLAS ZBP_I_*
6 DDLX · 7 CLAS ZCL_/ZCJ_/ZCL_HS_ · 8 SRVD+SRVB · 9 Manual Steps
```

- Phase nặng (5, 7, và 2 khi ≥4 view) → dispatch [agent-generate-code](.claude/agents/agent-generate-code.md); phase còn lại main tự chạy. **1 phase = tối đa 1 subagent, không song song** (song song phá thứ tự phụ thuộc RAP).
- Per object: `syntax_check(source=…)` → `create_object`/`update_source`/`update_class_include` → `activate` → read-back verify. Stop on first error.
- Cuối mỗi phase (main làm): update `Status` → `done`, `memory_save`, in bảng tóm tắt, **chờ user OK** mới sang phase kế.

**Sau cùng:** sinh section "Manual Steps" + snapshot file vào `abap/`. In số object deployed / skipped / failed / manual / memory saved + lệnh resume.

> Deploy đi qua **3 tầng bảo vệ**: confirm gate → permission prompt từng write → [GuardDeploy hook](#8-hooks-tự-động) đối chiếu máy móc với design.

### Bước 4 — Manual ADT steps

Mở ADT/Fiori làm object sap-adt không hỗ trợ (theo bảng Manual Steps trong design): package (DEVC), ZJC/ZJT (Job Catalog/Template), ZAL (App Log), ZHS, ZSC, ZNR, IAM App/Catalog, Communication Scenario/Arrangement.

### (Tùy chọn) `/rap-review` : Review

Lệnh: [.claude/commands/rap-review.md](.claude/commands/rap-review.md), agent [agent-review-code](.claude/agents/agent-review-code.md).
- CASE mode: `/rap-review <Case>` — review toàn case.
- OBJECT mode: `/rap-review <TYPE> <NAME>` — review 1 object.
- Read-only: chỉ ghi `package/<Case>/reviews/YYYY-MM-DD_review.md`, KHÔNG sửa code/design.

---

## 3. Coding Design Document — 10 mục

Skeleton: [.claude/templates/design/design-skeleton.md](.claude/templates/design/design-skeleton.md). Frontmatter: `system`, `variant`, `suffix`, `pjcode`, `package`.

| # | Mục | Nội dung |
|---|-----|----------|
| 1 | Requirement Summary | Business need, source BD, trigger, frequency |
| 2 | Metadata Investigation | Object/field/DE đã verify MCP, tồn tại/tạo mới/sửa, open items |
| 3 | **Object Impact List** | Type, Name, Package, Action (create/edit), **MCP Deploy** (auto/clas-confirm/manual), Status (pending/done) |
| 4 | Input / Output | Source/target, format, fields |
| 5 | Field Mapping | Source→Target field, data element, conversion, default |
| 6 | Processing Logic | Luồng chính, branch, case đặc biệt, CRUD logic |
| 7 | Validation Rules | Rule, thời điểm, error message, behavior khi lỗi |
| 8 | Error Handling | Lỗi nghiệp vụ/kỹ thuật, cách trả message, rollback/skip |
| 9 | Test Points | Normal / abnormal / edge / regression |
| 10 | Open Questions | BD chưa rõ, metadata chưa tra, logic cần confirm, risk |

Cột **MCP Deploy** quyết định cách deploy ở Bước 3 (từ vựng chuẩn — dùng đúng 3 giá trị này):
- `auto` — sap-adt deploy thẳng: TABL, DDLS, BDEF, DDLX, SRVD, SRVB, PROG, INTF.
- `clas-confirm` — CLAS (`ZBP_*`/`ZCL_*`/`ZCJ_*`/`ZCL_HS_*`): deploy được, nhưng `/rap-gen` pre-flight 7e hỏi user chọn MCP hay local snapshot vào `abap/`.
- `manual` — sap-adt không hỗ trợ, làm ADT/Fiori: DEVC, ZJC/ZJT, ZAL, ZHS, ZSC, ZNR, IAM, Comm Scenario, ENHO.

Cột **Status**: `pending` → `/rap-gen` set `done` sau khi activate (dùng để resume khi chạy lại).

---

## 4. RAP build order & Deployment Matrix

**Build order** (KHÔNG tạo object tiếp nếu object trước chưa activate):

```
TABL → DDLS(ZI_ helper) → DDLS(ZI_ root) → DDLS(ZC_ projection)
→ BDEF(ZI_) → CLAS(ZBP_I_) → BDEF(ZC_) → DDLX → CLAS(ZCL_/ZCJ_/ZCL_HS_)
→ SRVD → SRVB → manual objects
```

**Deployment Matrix:**

| Object | sap-adt | Action |
|--------|---------|--------|
| TABL, DDLS, BDEF, DDLX, SRVD, SRVB, PROG, INTF | ✅ Auto | `create_object`/`update_source` + `syntax_check` + `activate` |
| CLAS (`ZBP_*/ZCL_*/ZCJ_*/ZCL_HS_*`) | ⚠ Được, **HỎI CONFIRM** | MCP: `create_object` + `update_class_include`; hoặc local snapshot |
| Package (DEVC) | ❌ Manual | ADT |
| ZJC/ZJT (Job Catalog/Template), ZAL (App Log) | ❌ Manual | ADT/Fiori |
| ZHS, ZSC, ZNR | ❌ Manual | ADT |
| Communication Scenario/Arrangement, IAM App/Catalog | ❌ Manual | ADT/Fiori admin |

**Verify sau mỗi activate:** activation log không có `severity:"E"` + `get_source`/`get_class_include` read-back. Lỗi E → STOP, báo nguyên văn, fix, không auto-retry.

---

## 5. Pattern → Skill stack

16 RAP skills auto-trigger theo keyword. Pattern detect ở `/rap-new` → load skill stack:

| Pattern | Khi nào | Skill stack |
|---------|---------|-------------|
| **Managed BO + Fiori** | Master data, file upload, draft + UI | `rap-managed-bo` + `rap-cds` + `rap-behavior` + `rap-service` (U4) |
| **Custom Web API (JSON in/out)** | System ngoài POST JSON → ghi BO interface | `rap-bo-interface` + `rap-behavior` + `rap-service` (U4W) |
| **Background Job (APJ)** | Định kỳ/on-demand, gửi/nhận data, log | `rap-job` + `rap-app-log` + `rap-custom-entity` + `rap-service` |
| **HTTP Inbound Service** | REST endpoint nhận raw JSON | `rap-http-service` + `rap-app-log` + `rap-comm-outbound` |
| **Outbound OData Call** | Gọi OData ngoài (PATCH/POST/Function Import) | `rap-comm-outbound` |
| **Read-only Fiori List** | Data compute runtime, không Z table | `rap-custom-entity` + `rap-cds` + `rap-service` |
| **帳票/Form output** | SVF form output | `rap-report-svf` |

Skill bổ trợ: `rap-table`, `rap-parallel-bo-call`, `rap-parallel-multithread`, `rap-mcp-adt`, `rap-generate`.
Multi-pattern (vd BO + Job giám sát) → load nhiều stack song song.

---

## 6. Naming IPS Ver4.0 (tóm tắt)

Đầy đủ: [.claude/rules/abap-cloud-naming.md](.claude/rules/abap-cloud-naming.md). `{{SUFFIX}}` = `_VN` (Local VN) hoặc rỗng (Global).

| Object | Pattern | Local VN ví dụ |
|--------|---------|----------------|
| Package | `ZRAP_<TYPE>_<PJCODE>{{SUFFIX}}` | `ZRAP_IF_MI902_VN` |
| Data Model | `ZI_<PJCODE>_01{{SUFFIX}}` | `ZI_MI902_01_VN` |
| Projection | `ZC_<PJCODE>_01{{SUFFIX}}` | `ZC_MI902_01_VN` |
| BDEF | = Data Model ID | `ZI_MI902_01_VN` |
| Behavior Impl | `ZBP_I_<PJCODE>_01{{SUFFIX}}` (bỏ `Z` đầu, **KHÔNG lồng `ZI_`**) | `ZBP_I_MI902_01_VN` |
| Table / Draft | `Z<5>T{{SUFFIX}}` / `..._D` | `ZM902T_VN` / `ZM902T_VN_D` |
| Service Def / Binding | `ZSD_..` / `ZSB_<BIND>_..` | `ZSD_MI902_01_VN` / `ZSB_U4_MI902_01_VN` |
| Job (Class/Catalog/Template) | `ZCJ_` / `ZJC_` / `ZJT_` | `ZCJ_MI901_01_VN` |
| App Log / HTTP / Consumption | `ZAL_` / `ZHS_` / `ZSC_<MODE>_` | `ZAL_MI901_01_VN` |
| IAM App | `ZIAM_<BIND>_<PJCODE>_NN{{SUFFIX}}_EXT` | `ZIAM_U4_MI902_01_VN_EXT` |

**Critical:**
- `ZBP_I_*` KHÔNG lồng `ZI_` (sai: ~~`ZBP_ZI_*`~~).
- Suffix variant `_VN` luôn đứng **trước** hậu tố kỹ thuật (`_D`, `_EXT`, `_SQL`). Đúng: `ZM902T_VN_D`. Sai: `ZM902T_D_VN`.
- 1 case = 1 variant, KHÔNG mix.
- Binding types: `U4` (V4 UI/Fiori), `U4W` (V4 Web API), `U2`/`U2W` (V2), `A4` (V4 A2X kind G4BA), `AS` (SQL).

**ABAP variable prefix** (IPS Ver4.0, KHÔNG dùng `lv_/ls_/lt_/gv_`): local `ldf_/lds_/ldt_/ldo_/ldc_`; importing `idf_/ids_/idt_`; exporting `edf_/eds_/edt_`; returning `rdf_/rds_/rdt_`.

---

## 7. MCP servers & session handling

Config: [.mcp.json](.mcp.json)

> **Auth `sap-adt`**: header `Authorization` hiện để token Basic trực tiếp trong `.mcp.json`.
> Claude Code **không hỗ trợ cú pháp default `${VAR:-...}`** trong `.mcp.json` (chỉ expand `${VAR}` và báo lỗi nếu var chưa set). Muốn đưa secret ra khỏi file:
> 1. Set env var trước khi mở Claude Code:
>    ```bash
>    export SAP_ADT_AUTH="dGVhbTpWbmV4dDIwMjZAQA=="   # base64 của user:pass
>    ```
> 2. Đổi header thành `"Authorization": "Basic ${SAP_ADT_AUTH}"` (không có default).
>
> Nếu chưa set env mà dùng `${SAP_ADT_AUTH}` → MCP `sap-adt` sẽ lỗi "Variable not found". Để token literal là cách chạy được ngay.

| Server | Vai trò |
|--------|---------|
| `sap-adt` | **Chính** — deploy/read object SAP. Endpoint khai trong [.mcp.json](.mcp.json) (hiện: local daemon `127.0.0.1:8765`). System cấu hình phía server MCP, list qua `list_systems`. |
| `sap-abap` | Đọc DTEL/DOMA content (`sap_get_object_details`) |
| `sap-docs` | Tra docs SAP |
| `agentmemory` | Lưu/lấy memory (object đã làm, design decision, bug fix) |

**Session expired** (HTML login page, `CSRF token validation failed`, redirect oauth/saml, trả `<html>` thay JSON) → **STOP, không tự retry**. Gọi `refresh_cookies_for(system="<system>")` rồi retry 1 lần; vẫn fail → báo user, dừng.

**Write bị chặn** (403 / `package not allowed`) → lỗi quyền server-side, KHÔNG phải session → báo nguyên văn. **Delete KHÔNG được hỗ trợ.**

**Lỗi thường gặp:** `Field CLIENT specified twice` → bỏ `key client` khỏi TABL; `unknown system` → check `list_systems`; activation `severity:"E"` → STOP, fix, update lại.

---

## 8. Hooks tự động

Hook cấu hình trong [.claude/settings.json](.claude/settings.json), chạy ngầm — không cần gọi tay. 6 hook, tất cả **best-effort**: lỗi thì bỏ phần đó, không bao giờ chặn phiên làm việc (trừ `GuardDeploy` — hook duy nhất được phép chặn, và chỉ chặn write lên SAP).

| Hook | Event | File | Vai trò |
|------|-------|------|---------|
| Dashboard case + SAP systems | SessionStart | [SessionStart.mjs](.claude/hooks/SessionStart.mjs) | Đầu phiên: trạng thái connect SAP (cache), case RAP đang dở, ping sap-adt + agentmemory, heartbeat |
| Auto-recall memory | UserPromptSubmit | [UserPromptSubmit.mjs](.claude/hooks/UserPromptSubmit.mjs) | Mỗi prompt: semantic-search agentmemory, chèn memory liên quan vào context |
| Save before compact | PreCompact | [PreCompact.mjs](.claude/hooks/PreCompact.mjs) | Trước khi nén: inject memory cũ + yêu cầu Claude `memory_save` insight mới |
| **Guard deploy** ⛔ | PreToolUse | [GuardDeploy.mjs](.claude/hooks/GuardDeploy.mjs) | **Chặn** write sai lên SAP: sai system/package, thiếu suffix variant, naming vi phạm IPS, thiếu header 変更履歴 |
| **Metadata cache** | PostToolUse | [CacheMetadata.mjs](.claude/hooks/CacheMetadata.mjs) | Cache kết quả tra metadata sap-adt ra file local + tự xoá khi object đổi |
| **Deploy log** | PostToolUse | [DeployLog.mjs](.claude/hooks/DeployLog.mjs) | Audit trail mọi write lên SAP → `package/<Case>/deploy-log.jsonl` |

Luồng theo vòng đời phiên:

```
mở phiên      → SessionStart     : đang dở gì? SAP connect chưa?
mỗi prompt    → UserPromptSubmit : memory liên quan
trước mỗi write SAP → GuardDeploy: đối chiếu design → sai thì CHẶN
sau mỗi MCP call    → CacheMetadata (đọc→cache, ghi→invalidate)
                    → DeployLog   (chỉ write: ghi audit trail)
trước compact → PreCompact       : giữ memory + nhắc lưu memory mới
```

### Guard deploy (GuardDeploy.mjs) — chặn lỗi không revert được

**Vấn đề**: object SAP đã activate **không xóa được** (CLAUDE.md § KHÔNG xóa SAP object; sap-adt cũng không có `delete`). Deploy nhầm system, nhầm package, sai naming → rác vĩnh viễn trên hệ thống. Mọi rule trong [abap-cloud-naming.md](.claude/rules/abap-cloud-naming.md) trước đây chỉ là văn bản — model quên là xong.

**Cách hoạt động**: match `create_object|update_source|update_class_include`, lấy `tool_input`, tra design có `package:` khớp, đối chiếu:

| Check | Ví dụ bị chặn | Mức |
|-------|---------------|-----|
| `system` ≠ `system:` trong design | design `IPS`, đang deploy `VNEXT` | ⛔ chặn |
| `package` không thuộc design nào | typo `ZRAP_IF_XX999` | ⛔ chặn |
| Thiếu suffix variant | design `suffix: _VN` mà object `ZI_VI901_09` | ⛔ chặn |
| Sai thứ tự suffix | `ZM902T_D_VN` (đúng: `ZM902T_VN_D`) | ⛔ chặn |
| `ZBP_` lồng `ZI_` | `ZBP_ZI_VI901_01_VN` | ⛔ chặn |
| Global mà object có `_VN` | design `variant: Global` | ⛔ chặn |
| Source thiếu block `[変更履歴]` | quên header | ⛔ chặn |
| `COMMIT WORK`, `GET TIME STAMP FIELD` | ABAP Cloud cấm | ⚠ cảnh báo |
| Prefix `lv_`/`ls_`/`iv_`/`ev_`… | rule IPS dùng `ldf_`/`idf_`/`edf_` | ⚠ cảnh báo |

Nguồn sự thật = **frontmatter design**, nên không cần cấu hình gì thêm:
```yaml
system: IPS     variant: Local VN     suffix: _VN     package: ZRAP_IF_VI901_VN
```

**Nguyên tắc**: chỉ chặn cái **chắc chắn sai**. Không parse được input / không tìm thấy design khớp → cho qua. Thứ dễ false-positive (regex trúng comment hay string) chỉ cảnh báo.

Bị chặn nhầm → **sửa design cho đúng trước**, đừng tìm cách bypass. Muốn tắt tạm: xoá khối `PreToolUse` trong `settings.json`.

> Đây là **tầng bảo vệ thứ 3**. Tầng 1 = confirm gate của `/rap-gen` (duyệt danh sách object). Tầng 2 = permission prompt Claude Code (write tool cố ý không allowlist). Tầng 3 = GuardDeploy đối chiếu máy móc với design.

### Deploy log (DeployLog.mjs) — audit trail

Vì object không xóa được, cần trả lời được "object rác này tạo lúc nào, từ case nào, bằng lệnh gì". Mỗi write append 1 dòng JSON vào `package/<Case>/deploy-log.jsonl`:

```jsonc
{"ts":"2026-07-28T07:31:12Z","case":"VI902","system":"VNEXT","package":"ZRAP_IF_VI901",
 "tool":"create_object","type":"DDLS","name":"ZI_VI901_01","source_lines":124,"result":"active"}
```

`result` tự phân loại: `active` · `ok` · `error` · `blocked` (403/package not allowed) · `session-expired` (HTML/CSRF) · `unknown`. Không phải `ok`/`active` thì kèm `detail` = 300 ký tự đầu của response.

Suy `<Case>` từ `package` → frontmatter design; tool không truyền package (như `update_class_include`) thì dò tên object trong các design. Mơ hồ → ghi `.claude/.cache/deploy-log.jsonl` với `case: null`.

Dùng để: cross-check cột `Status` trong design khi resume `/rap-gen`, truy vết object thừa, dựng lại lịch sử deploy khi bàn giao.

### Metadata cache (CacheMetadata.mjs) — né re-query cross-case

**Vấn đề**: mỗi case `get_source`/`api_release_state` cho hàng chục object. Case sau cùng system tra lại y hệt → tốn token + MCP round-trip (case VI901: 78M cache, $82). Daemon agentmemory tắt thì `memory_save` cũng fail → không persist được.

**Cách hoạt động** (daemon-independent, deterministic):

```
READ  (get_source, api_release_state, list_package, cds_dependencies, get_class_include)
      → ghi .claude/.cache/metadata/<system>/<KEY>.json = { ts, tool, input, response }
        KEY: get_source/api_release_state → <OBJECT_TYPE>_<NAME>; list_package → PACKAGE_<pkg>;
             cds_dependencies → DEPS_<ddls>; get_class_include → CLASINC_<class>_<include>
      → bỏ qua response rác (HTML login / CSRF / not found / rỗng)

WRITE (update_source, update_class_include, create_object, activate)
      → INVALIDATE: xoá cache file của chính object vừa đổi (DDLS đổi → xoá cả DEPS_;
        class → xoá CLASINC_<class>_*; create_object → xoá PACKAGE_<pkg>)
        ⇒ "vừa sửa = cache biến mất = read sau buộc query live", không dựa vào agent nhớ
```

**Phía đọc** — quyết định cache-vs-MCP theo **read-through policy phân tầng** trong skill [rap-mcp-adt](.claude/skills/rap-mcp-adt/SKILL.md) (§ Local metadata cache), không phải TTL cứng:

| Object | Tin cache? |
|--------|-----------|
| Object trong Object Impact List của case hiện tại | ❌ luôn live |
| SAP standard (`I_`/`C_`/`P_`) | ✅ `ts` < 30 ngày |
| `Z` object package khác (reference) | ✅ `ts` < 7 ngày |
| Field sắp pin vào Field Mapping / design decision | ❌ nghi ngờ thì query lại |

> Cache lưu **raw response** (không parse sẵn field) — lợi là né MCP round-trip + reuse cross-case, vẫn phải tự đọc field từ text. Thư mục `.claude/.cache/` đã gitignore.
> Phase tra metadata nên chạy trong subagent (`/rap-design` → `agent-design`) để noise cô lập; cache giúp **giữa các case**, subagent giúp **trong 1 case**.

### Kiểm tra hook có chạy không

**SessionStart** in heartbeat ở cuối block đầu phiên — thấy dòng này là hook sống:

```
---
✅ SessionStart hook OK · 2026-07-28 14:25 · 2 case
   mcp sap-adt off · systems-cache 7159p · memory-daemon off
```

| Trường | Ý nghĩa |
|--------|---------|
| `mcp sap-adt` | `on` = daemon reachable · `off` = chưa bật, mọi tool sap-adt sẽ fail · `n/a` = `.mcp.json` không khai |
| `systems-cache` | tuổi cache trạng thái connect. `none` = chưa có, đang probe nền |
| `memory-daemon` | ping `localhost:3111` — `off` thì auto-recall + PreCompact không hoạt động |

Phân biệt 2 lỗi hay nhầm: `sap-adt off` = **daemon chưa chạy** (bật daemon); `sap-adt on` + `❌ cần refresh` = **cookie hết hạn** (`refresh_cookies_for(system="…")`).

Chạy tay để test — các hook không đọc stdin thì gọi thẳng, hook đọc stdin thì pipe JSON giả:

```bash
node .claude/hooks/SessionStart.mjs             # in ra đúng phần sẽ inject
node .claude/hooks/SessionStart.mjs --refresh   # probe live + ghi cache, KHÔNG in gì

# GuardDeploy: exit 0 = cho qua, exit 2 = chặn (lý do ở stderr)
echo '{"tool_name":"mcp__sap-adt__create_object","tool_input":{"system":"VNEXT",
  "object_type":"DDLS","name":"ZI_VI901_09_VN","package":"ZRAP_IF_VI901_VN",
  "source":"// [変更履歴] V1.00"}}' | node .claude/hooks/GuardDeploy.mjs; echo "exit=$?"

claude --debug        # xem log thực thi hook
/hooks                # xem hook đã đăng ký (không xác nhận đã chạy)
```

`SessionStart` không khai `matcher` → chạy cho cả `startup`, `resume`, `clear`, `compact`. Nên `/clear` cũng là cách test hợp lệ.

---

## 9. Cấu trúc thư mục

```
RAP/
├── .claude/
│   ├── agents/      ← agent-design, agent-generate-code, agent-review-code
│   ├── commands/    ← /rap-new, /rap-design, /rap-gen, /rap-review
│   ├── rules/       ← abap-cloud-naming (IPS Ver4.0), cds-field-types
│   ├── skills/      ← 16 RAP skills (memory dùng MCP agentmemory: memory_save/memory_smart_search)
│   ├── hooks/       ← SessionStart, UserPromptSubmit, PreCompact,
│   │                   GuardDeploy (chặn write sai), CacheMetadata, DeployLog
│   ├── .cache/      ← metadata cache + systems.json (gitignore)
│   ├── output-styles/ ← terse.md
│   └── templates/   ← design skeleton + cds/bdef/tabl/clas/service skeleton
├── package/<Case>/
│   ├── docs/        ← BD đầu vào (PDF/MD)
│   ├── designs/     ← Coding Design Document (10 mục) — ground truth cho /rap-gen
│   ├── abap/        ← snapshot class local + manual instructions (sau /rap-gen)
│   └── reviews/     ← report /rap-review (nếu có)
├── .mcp.json        ← MCP servers config
└── CLAUDE.md        ← rule đầy đủ
```

Template = starting point, không phải production code — fork ra `package/<Case>/abap/` rồi sửa, KHÔNG edit template gốc.

---

## 10. Nguyên tắc bắt buộc

1. **System-agnostic** — không hard-code system; 1 case = 1 system ở frontmatter.
2. **Suy nghĩ trước khi code** — nêu giả định; không chắc → hỏi; nhiều cách hiểu → trình bày hết.
3. **Ưu tiên đơn giản** — đủ code giải quyết, không thêm tính năng/abstraction ngoài yêu cầu.
4. **Surgical** — chỉ sửa cái cần, tuân style hiện tại, code thừa chỉ ghi chú.
5. **Làm theo mục tiêu** — xác định tiêu chí hoàn thành, lặp đến khi verify được.
6. **KHÔNG xóa SAP object** — phát hiện thừa → báo user xóa tay (sap-adt không hỗ trợ delete).
7. **Variant không mix** — `Local VN` thì `_VN` áp cho MỌI object, suffix variant trước hậu tố kỹ thuật.
8. **Metadata verify live** — không đưa field/object chưa verify MCP vào design; standard object phải C0 released.
9. **Memory chủ động** — save khi tạo/sửa object quan trọng, design decision, pattern test thành công, bug fix.

---

## 11. Quick start

### Cài trên máy mới

```bash
git clone https://github.com/NhatPD-VNEXT/ADT-MCP.git RAP && cd RAP
./scripts/setup.ps1        # Windows  (macOS/Linux: bash scripts/setup.sh)
# → clone + cài daemon sap-adt, tạo systems.json, cài agentmemory
```

Rồi chạy daemon (`cd ../adt-mcp && python -m adt_mcp`), cấu hình SAP system tại
http://127.0.0.1:8765, mở `claude` và verify bằng `/mcp` + `list_systems`.
Chi tiết + troubleshooting: **[SETUP.md](SETUP.md)**.

### Dùng hằng ngày

```bash
# 1. Khởi tạo case — Claude hỏi pattern + system + variant + naming
/rap-new "Tôi cần BO quản lý phiếu nhập kho có draft + Fiori UI"

# 2. Bỏ BD vào package/<Case>/docs/ rồi hoàn thiện design (dispatch subagent, tra metadata live)
/rap-design <Case>

# 3. Deploy — pre-flight verify → build order → MCP deploy + snapshot manual
/rap-gen <Case>

# 4. Làm Manual Steps trong ADT theo bảng trong design (ZJC/ZJT, ZAL, IAM, Comm, package)

# 5. (tùy chọn) Review code đã activate vs design
/rap-review <Case>
```

> `package/` không được commit (chứa BD/spec khách hàng) — xem [package/README.md](package/README.md). Repo chỉ chứa framework: `.claude/`, `CLAUDE.md`, `README.md`, `SETUP.md`, `.mcp.json`, `scripts/`.
