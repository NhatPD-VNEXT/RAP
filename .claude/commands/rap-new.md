---
description: Khởi tạo case RAP mới — intent capture từ mô tả natural language, detect pattern, tạo package/<Case>/{docs,designs,abap}/ + design skeleton 10 mục.
argument-hint: "<description of what you want to build>"
---

The user wants to start a new RAP case: $ARGUMENTS

Flow: **1 lượt hỏi (4 câu) → auto-verify → 1 confirm block → tạo file**. Không hỏi lại cái đã suy ra được.

---

## Step 1 — Phân tích `$ARGUMENTS`

Đọc mô tả, đánh dấu 4 mục dưới là **đã rõ** (user nói tường minh) hay **chưa rõ**:

| # | Mục | Coi là "đã rõ" khi |
|---|-----|--------------------|
| 1 | **SAP system** | User gọi tên system (HAX/NKK/VNEXT/MTC/IPS…) |
| 2 | **Pattern** | User gọi đúng tên pattern ("managed BO có draft", "HTTP service nhận JSON"). Mô tả nghiệp vụ chung chung ≠ chỉ định pattern |
| 3 | **Variant** | User nói "local VN" / "_VN" / "global" |
| 4 | **PJCode + package** | User đưa PJCode (vd `MI902`) và nói package có sẵn hay tạo mới |

KHÔNG hỏi ở step này: Module ID, package type, package name, case name — xem Step 3 (suy ra được).

## Step 2 — Hỏi 1 lượt (BẮT BUỘC cho mục chưa rõ)

Gọi **1 lần** `AskUserQuestion` với đúng các mục **chưa rõ** (tối đa 4 câu). Mục đã rõ → echo 1 dòng, không hỏi lại.

**Câu 1 — SAP system**: gọi `list_systems`, liệt kê làm options. User chọn 1.
> 1 case = 1 system đích. Reference package đọc từ system khác được (note trong "Metadata Investigation"), nhưng deploy cố định 1 system. System không có trong `list_systems` → cảnh báo `/rap-gen` sẽ fail, hỏi có tiếp tục không.

**Câu 2 — Pattern**:

| Pattern | Khi nào dùng | Skill stack | Pkg type |
|---------|--------------|-------------|----------|
| **Managed BO + Fiori** | Master data maintenance, file upload, có draft + UI | rap-table, rap-managed-bo, rap-cds, rap-behavior, rap-service (U4) | FUN |
| **Custom Web API (JSON in/out)** | Hệ thống ngoài POST JSON vào, ghi BO interface SAP | rap-bo-interface, rap-behavior, rap-service (U4W/A4) | IF |
| **Background Job (APJ)** | Định kỳ / on-demand, gửi-nhận data, có log | rap-job, rap-app-log, rap-custom-entity, rap-service (U4 monitor) | IF |
| **DWH/APS CSV sender job** | 送信クラス gửi CSV qua DataSpider | rap-if-dwh-send, rap-app-log | IF |
| **HTTP Inbound Service** | REST endpoint nhận raw JSON (không phải OData) | rap-http-service, rap-app-log, rap-comm-outbound (nếu call ra) | IF |
| **Outbound OData Call** | Gọi service OData ngoài (PATCH/POST/Function Import) | rap-comm-outbound | IF |
| **Read-only Fiori List** | Dữ liệu compute runtime, không Z table | rap-custom-entity, rap-cds, rap-service | FUN |
| **帳票 / SVF output** | Form/report output qua SVF server | rap-report-svf | REP |
| **Analytical CDS / SAC** | Cube, analytical query, dashboard | rap-analytics-cds | BI |
| **BAdI extension** | 項目追加 / logic mở rộng object chuẩn, không phải BO riêng | rap-badi-extension | FUN |

Multi-pattern (vd BO + Job giám sát) → cho phép multiSelect, load nhiều stack song song; pkg type lấy theo pattern chính.

**Câu 3 — Variant**:

| Variant | Khi nào dùng | Suffix |
|---------|--------------|--------|
| **Local VN** | Object riêng cho Vietnam | `_VN` áp cho **MỌI** object |
| **Global** | Object dùng chung mọi country | không suffix |

**Câu 4 — PJCode + package**: hỏi PJCode (ModuleID + 3 digit, PJ固有 dùng 901+, vd `MI902`) **và** package dùng có sẵn hay tạo mới.
- Có sẵn → hỏi tên package luôn (free text).
- Tạo mới → tên sẽ derive ở Step 3, DEVC là **manual** (sap-adt không tạo package) → vào Manual Steps của design.

## Step 3 — Suy ra + verify (KHÔNG hỏi user)

Derive:
- **Module ID** = ký tự đầu PJCode (`V`=SD, `M`=MM, `F`=FI, `P`=PP, `H`=HR…).
- **Package type** = cột "Pkg type" của pattern đã chọn (override được ở confirm block).
- **Package name** (nếu tạo mới) = `ZRAP_<TYPE>_<PJCODE>{{SUFFIX}}`.
- **CaseName** = PJCode (+ `_VN` nếu Local VN), trừ khi user tự đặt tên khác.
- **`{{SUFFIX}}`** = `_VN` (Local VN) hoặc rỗng (Global).

Verify qua sap-adt (report kết quả, không hỏi):
1. Package có sẵn → `list_package(system, package)`. Không tồn tại → báo, quay lại Câu 4.
2. Collision → `search_objects(system, "*<PJCODE>*")`. Có object trùng PJCode → **cảnh báo trong confirm block**, kèm danh sách, hỏi user đổi PJCode hay dùng NN tiếp theo (`_02`, `_03`…).
3. Session expired (HTML/CSRF/redirect) → `refresh_cookies_for(system)` 1 lần, vẫn fail → báo user, dừng, KHÔNG deploy mù.

## Step 4 — Confirm block (GATE DUY NHẤT)

In **1 bảng** rồi chờ user OK. Bảng naming **chỉ in rows liên quan pattern đã chọn**, không in cả 16 dòng.

```
📍 System : <system>          📦 Package : <pkg>  (existing | new — manual DEVC)
🧩 Pattern: <pattern>          🌏 Variant : <Local VN | Global>
🔤 PJCode : <PJCODE>  (Module <X> = <SD/MM/…>)   📁 Case : package/<CaseName>/
⚠ Collision: <none | danh sách object trùng>

| Object | Name |
|--------|------|
| … chỉ rows theo pattern … |
```

Naming reference (per `.claude/rules/abap-cloud-naming.md`) — pick rows theo pattern:

| Object | Pattern | Local VN example | Global example |
|--------|---------|------------------|----------------|
| Package | `ZRAP_<TYPE>_<PJCODE>{{SUFFIX}}` | `ZRAP_IF_MI902_VN` | `ZRAP_IF_MI902` |
| Data Model | `ZI_<PJCODE>_01{{SUFFIX}}` | `ZI_MI902_01_VN` | `ZI_MI902_01` |
| Item Data Model | `ZI_<PJCODE>_02{{SUFFIX}}` | `ZI_MI902_02_VN` | `ZI_MI902_02` |
| Projection | `ZC_<PJCODE>_01{{SUFFIX}}` | `ZC_MI902_01_VN` | `ZC_MI902_01` |
| BDEF | cùng Data Model | `ZI_MI902_01_VN` | `ZI_MI902_01` |
| Behavior Impl | `ZBP_I_<PJCODE>_01{{SUFFIX}}` (bỏ Z đầu, KHÔNG lồng ZI_) | `ZBP_I_MI902_01_VN` | `ZBP_I_MI902_01` |
| Helper class | `ZCL_<PJCODE>_01{{SUFFIX}}` | `ZCL_MI902_01_VN` | `ZCL_MI902_01` |
| HTTP Handler | `ZCL_HS_<PJCODE>_01{{SUFFIX}}` | `ZCL_HS_VI902_01_VN` | `ZCL_HS_VI902_01` |
| Job class | `ZCJ_<PJCODE>_01{{SUFFIX}}` | `ZCJ_MI901_01_VN` | `ZCJ_MI901_01` |
| Table | `Z<5chars>T{{SUFFIX}}` | `ZM902T_VN` | `ZM902T` |
| Draft table | `Z<5chars>T{{SUFFIX}}_D` (variant TRƯỚC `_D`) | `ZM902T_VN_D` | `ZM902T_D` |
| Service Definition | `ZSD_<PJCODE>_01{{SUFFIX}}` | `ZSD_MI902_01_VN` | `ZSD_MI902_01` |
| Service Binding | `ZSB_<BINDING>_<PJCODE>_01{{SUFFIX}}` | `ZSB_U4_MI902_01_VN` | `ZSB_U4_MI902_01` |
| App Log Object | `ZAL_<PJCODE>_01{{SUFFIX}}` | `ZAL_MI901_01_VN` | `ZAL_MI901_01` |
| HTTP Service | `ZHS_<PJCODE>_01{{SUFFIX}}` | `ZHS_VI902_01_VN` | `ZHS_VI902_01` |
| Consumption Model | `ZSC_<MODE>_<PJCODE>_NN{{SUFFIX}}` | `ZSC_OD_VI902_01_VN` | `ZSC_OD_VI902_01` |
| IAM App | `ZIAM_<BIND>_<PJCODE>_NN{{SUFFIX}}_EXT` | `ZIAM_U4_MI902_01_VN_EXT` | `ZIAM_U4_MI902_01_EXT` |

> Draft table `_D` luôn là suffix **cuối cùng**, sau variant suffix. Đúng: `ZM902T_VN_D`. Sai: `ZM902T_D_VN`.

User reject dòng nào → sửa + in lại bảng, KHÔNG tự đoán. Chỉ khi user OK mới sang Step 5.

## Step 5 — Tạo cấu trúc package/

1. Tạo folder `package/<CaseName>/{docs,designs,abap}/`.
2. Copy `.claude/templates/design/design-skeleton.md` → `package/<CaseName>/designs/<CaseName>_design.md`.
3. Fill placeholders: `{{SYSTEM}}`, `{{PACKAGE}}`, `{{PACKAGE_STATE}}` (`existing` | `new`), `{{CASE_NAME}}`, `{{PATTERN}}`, `{{VARIANT}}`, `{{SUFFIX}}`, `{{TYPE}}`, `{{PJCODE}}`, `{{DATE}}`.
4. Pre-fill mục 1 (Requirement Summary) từ `$ARGUMENTS`.
5. Pre-fill mục 3 (Object Impact List) skeleton rows theo pattern:
   - Managed BO → TABL, TABL_D, ZI_root, ZI_item, ZC_root, ZC_item, BDEF interface, BDEF projection, ZBP, SRVD, SRVB, DDLX, IAM App
   - HTTP service → ZHS, ZCL_HS, ZAL (manual), ZBP_I_log (managed)
   - Job → ZCJ, ZJC (manual), ZJT (manual), ZAL (manual), ZI custom entity, ZCL query provider, SRVD, SRVB
   - …

   Cột `MCP Deploy` đánh đúng `auto` / `clas-confirm` / `manual` (từ vựng chuẩn — xem legend trong skeleton § 3 + deployment matrix `rap-generate` § 2). Package mới → thêm row DEVC `manual`. Cột `Status` để `pending`.
6. Pre-fill mục 9 (Open Questions) những gì **chưa hỏi user vì thuộc design-time**: nguồn/đích dữ liệu (table, CDS, BO chuẩn nào), field mapping, có draft không, quy tắc validation, tần suất job, format file. `/rap-design` sẽ tra metadata live và chốt.

## Step 6 — Output

```
✓ Case created: package/<CaseName>/
  ├── docs/      ← bỏ BD/Design spec vào đây
  ├── designs/<CaseName>_design.md   ← skeleton 10 mục đã pre-fill
  └── abap/      ← snapshot local types + manual instructions (sau /rap-gen)

📍 System: <system>   📦 Package: <pkg>   🌏 Variant: <variant>
🧩 Pattern: <pattern>
📋 Naming: <các object chính>

➡ Next steps:
   1. Bỏ BD đầu vào (PDF/MD) vào package/<CaseName>/docs/
   2. Hoàn thiện design: /rap-design <CaseName>
      (chạy trong subagent agent-design — cô lập noise tra metadata, main context sạch)
   3. Khi design xong → chạy /rap-gen <CaseName>
```

## Rules

- KHÔNG tạo SAP object trong step này — chỉ tạo files local.
- KHÔNG tạo file nào (kể cả folder `package/<Case>/`) trước khi user OK confirm block ở Step 4.
- 4 mục phải do **user chốt**, không tự điền: system, pattern, variant, PJCode + package(có sẵn/mới).
- Ngược lại: Module ID / package type / package name / CaseName **KHÔNG hỏi** — derive rồi để user override ở confirm block.
- Nội dung design-time (mapping, field, validation, tần suất) → Open Questions, KHÔNG chặn `/rap-new`.
- Naming PHẢI khớp `.claude/rules/abap-cloud-naming.md` — đặc biệt `ZBP_I_*` KHÔNG lồng `ZI_`.

$ARGUMENTS
