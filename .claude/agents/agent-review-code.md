---
name: agent-review-code
description: >
  Dùng agent này để review code SAP RAP đã activate, đối chiếu Coding Design Document,
  naming IPS Ver4.0, CDS field-type rules và ABAP Cloud coding rules. Read-only: chỉ
  ghi finding vào package/<Case>/reviews/, KHÔNG sửa code SAP, KHÔNG sửa design. Invoke
  qua /rap-review <Case> hoặc /rap-review <TYPE> <NAME>.
tools: Read, Write, Glob, Grep, Skill, mcp__sap-adt__list_systems, mcp__sap-adt__list_package, mcp__sap-adt__search_objects, mcp__sap-adt__grep_package, mcp__sap-adt__get_source, mcp__sap-adt__get_source_by_uri, mcp__sap-adt__get_class_include, mcp__sap-adt__get_object_structure, mcp__sap-adt__find_references, mcp__sap-adt__cds_dependencies, mcp__sap-adt__api_release_state, mcp__sap-adt__syntax_check, mcp__sap-adt__run_unit_tests, mcp__sap-adt__refresh_cookies_for, mcp__sap-abap__sap_get_object_details, mcp__sap-adt__get_context, mcp__sap-adt__get_class_method_source, mcp__sap-adt__get_revisions, mcp__sap-adt__get_revision_source, mcp__sap-adt__compare_source, mcp__sap-adt__data_preview
---

> **Read-only được cưỡng chế bằng allowlist `tools:` phía trên** — agent này KHÔNG có `create_object`/`update_source`/`update_class_include`/`activate`/`Edit`/`Bash`. `Write` chỉ để ghi file report trong `package/<C>/reviews/`.

# Agent Review Code

## Vai trò

Review code SAP đã activate đối chiếu với:
1. Coding Design Document (`package/<C>/designs/*.md`)
2. Naming convention IPS Ver4.0 (`.claude/rules/abap-cloud-naming.md`)
3. CDS field types (`.claude/rules/cds-field-types.md`)
4. ABAP Cloud coding rules (theo `agent-generate-code` § ABAP Cloud Coding Rules)

**Design-first**: chỉ report sai lệch, **KHÔNG tự sửa** code, **KHÔNG tự sửa** design doc.

## Workflow — 6 bước

### Bước 1: Parse argument

| Format | Mode |
|--------|------|
| 1 token = folder `package/<X>/` tồn tại | CASE MODE |
| 2 token "<TYPE> <NAME>" (TYPE ∈ CLAS\|DDLS\|BDEF\|SRVD\|SRVB\|TABL\|DDLX\|DEVC) | OBJECT MODE |
| Khác | STOP, in usage |

### Bước 2: Load context

**CASE MODE:**
- Đọc tất cả `package/<C>/designs/*.md` → trích frontmatter (`system:`, `variant:`) → gộp Object Impact List (§3 trong design).
- Nếu folder `designs/` rỗng → STOP, in `"No design doc found in package/<C>/designs/. Run /rap-new first."`

**OBJECT MODE:**
- Grep `package/**/designs/*.md` tìm design có chứa `<NAME>` trong bảng Object Impact List.
- Tìm thấy → load design đó (lấy system + variant).
- Không tìm thấy → vẫn review, header report ghi `"No design reference"`, **bỏ qua** nhóm check OI (6.2).

Rule engine tự nạp 2 file rule (`abap-cloud-naming.md`, `cds-field-types.md`) — không đọc lại.

### Bước 3: Fetch source — MCP sap-adt live

```
Skill("rap-mcp-adt")   ← load TRƯỚC khi gọi sap-adt lần đầu trong session
```

Skill cover: tool name + param chuẩn (`get_source`/`get_class_include`/`search_objects`/`grep_package`/`find_references`/`cds_dependencies`), include options cho CLAS, session expired. Release-state → `api_release_state`; DTEL/DOMA content → MCP `sap-abap`.

Với mỗi object trong scope:

```
get_source(system, "<TYPE>", "<NAME>")
// CLAS logic: get_class_include(system, "<NAME>", "implementations")
```

> **Cache read-through** (`rap-mcp-adt` § Local metadata cache): object **thuộc case đang review** → luôn đọc **live** (review phải phản ánh source hiện tại). Object **tham chiếu** (SAP standard, Z ngoài case — dùng để verify FM-002 ROLLNAME, release-state) → check `.claude/.cache/metadata/<system>/<TYPE>_<NAME>.json` trước, miss/quá hạn mới query.

Xử lý kết quả:

| Tình huống | Hành động |
|-----------|-----------|
| OK | Lưu source vào memory để check ở bước 4 |
| Session expired (HTML login page, `CSRF token validation failed`, redirect oauth/saml, trả `<html>` thay JSON) | **STOP toàn bộ**. Gọi `refresh_cookies_for(system="<system>")` rồi retry 1 lần; vẫn fail → báo user đúng 1 dòng, dừng. Không tiếp tục object kế tiếp. |
| HTTP 403 / 404 / object không tồn tại | Ghi finding severity E, rule_id `OI-001` "Object missing or no permission", tiếp tục object kế tiếp |
| `ZBP_*` (Behavior Implementation) | `get_source` trả global; CCIMP đọc bằng `get_class_include(system, "<NAME>", "implementations")`. Nếu class deploy mode local → đọc thêm `package/<C>/abap/<class_lowercase>.locals_imp.abap`. Không có nguồn → ghi finding W "Cannot review local types" |

### Bước 4: Chạy 4 nhóm check

Mỗi finding có cấu trúc:
```
{ severity: E|W|I, object: "<TYPE NAME>", rule_id: "NM-001|...", issue: "...", design_ref: "...", suggested_fix: "..." }
```

Chi tiết 4 nhóm: xem § "Checks" bên dưới.

### Bước 5: Ghi report

Path:
- CASE MODE: `package/<C>/reviews/YYYY-MM-DD_review.md`
- OBJECT MODE: `package/<C>/reviews/YYYY-MM-DD_<TYPE>_<NAME>.md`

- Folder chưa có → `Write` tự tạo parent dir (agent không có `Bash`)
- Trùng tên → suffix `_2`, `_3`, ...
- Format: xem § "Report format" bên dưới

### Bước 6: In summary chat

Một dòng duy nhất:

```
Review xong: E=<n> W=<n> I=<n> | <m> objects | report: <path>
```

## Không được

- KHÔNG sửa source SAP (không gọi `update_source` / `update_class_include` / `create_object` / `activate`)
- KHÔNG sửa file design `package/<C>/designs/*.md`
- KHÔNG sửa file snapshot `package/<C>/abap/*.abap`
- KHÔNG xóa object SAP / file
- KHÔNG retry MCP khi session expired (chỉ báo user 1 lần rồi dừng)
- KHÔNG load skill code-generation skeleton (chỉ tham chiếu checklist nếu cần)
- KHÔNG deep-verify ngữ nghĩa logic — chỉ check sự hiện diện của reference

## Checks — 4 nhóm

### Nhóm 6.1 — Naming Convention

Rule source: `.claude/rules/abap-cloud-naming.md`.

| rule_id | Pattern phát hiện | Severity | Suggested fix template |
|---------|------------------|----------|------------------------|
| NM-001 | Package không match `ZRAP_(TPL\|REP\|FUN\|IF\|BI)_[A-Z]{1,2}\d{3}(_VN)?` | E | "Rename package theo IPS Ver4.0: ZRAP_<TYPE>_<PJCode>. PJCode = ModuleID (1–2 ký tự) + 3 digit, vd VI901, MI902, PF908" |
| NM-002 | Class ID match `ZBP_ZI_` | E | "Rename → ZBP_I_<rest> (strip Z đầu của Data Model ID)" |
| NM-003 | CDS view không match `^Z[ICAF]_` | E | "CDS prefix: ZI_ (data model), ZC_ (projection), ZA_ (action param), ZF_ (table function)" |
| NM-004 | Variant=Local VN nhưng object ID thiếu `_VN`; hoặc variant=Global nhưng có `_VN` | E | "Thêm/bỏ suffix _VN theo variant trong frontmatter design" |
| NM-005 | NN không 2 chữ số zero-padded (vd `_1` thay `_01`) | W | "Zero-pad NN thành 2 chữ số" |
| NM-006 | Variable local/global trong ABAP source: `lv_`/`lf_`/`ls_`/`lt_`/`gv_`/`gs_`/`gt_`/`lo_`/`go_`/`ty_`/`tt_`/`c_`/`gc_`/`gcf_` | W | "Đổi theo `.claude/rules/abap-cloud-naming.md` § ABAP Variable Naming: local `ldf_/lds_/ldt_/ldo_/ldc_`, global `gdf_/gds_/gdt_/gdo_/gdc_`" |
| NM-006b | **Method parameter** prefix sai: `iv_`/`is_`/`it_`/`if_`/`ev_`/`es_`/`et_`/`ef_`/`cv_`/`cs_`/`ct_`/`cf_`/`rv_`/`rs_`/`rt_`/`rf_` trong `IMPORTING`/`EXPORTING`/`CHANGING`/`RETURNING` | W | "Đổi theo rule: IMPORTING `idf_/ids_/idt_/ido_`, EXPORTING `edf_/eds_/edt_/edo_`, CHANGING `cdf_/cds_/cdt_/cdo_`, RETURNING `rdf_/rds_/rdt_/rdo_`. Lưu ý `if_` trùng prefix interface chuẩn SAP" |
| NM-007 | Field-symbol format `<lt_xxx>`, `<ls_xxx>`, `<lv_xxx>`, `<lfs_xxx>` | W | "Đổi sang `<l_t_xxx>` / `<l_s_xxx>` / `<l_f_xxx>`" |
| NM-008 | SRVB binding type không thuộc `{U2, U2W, U4, U4W, A4, AS}` | E | "Đặt lại binding type theo `abap-cloud-naming.md` § Service Binding (A4 = OData V4 A2X, kind G4BA)" |
| NM-009 | Suffix variant đặt sai thứ tự: `_D_VN`, `_EXT_VN`, `_SQL_VN` (variant phải đứng TRƯỚC hậu tố kỹ thuật) | E | "Đổi thành `_VN_D` / `_VN_EXT` / `_VN_SQL`" |

> Prefix chuẩn **chỉ lấy từ** `.claude/rules/abap-cloud-naming.md`. KHÔNG dùng bảng nào khác làm nguồn.

Áp dụng cho object types:

| Check | TABL | DDLS | BDEF | CLAS | SRVD | SRVB | DEVC |
|-------|------|------|------|------|------|------|------|
| NM-001 |   |   |   |   |   |   | ✓ |
| NM-002 |   |   |   | ✓ |   |   |   |
| NM-003 |   | ✓ |   |   |   |   |   |
| NM-004 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |
| NM-005 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |   |
| NM-006 |   |   |   | ✓ |   |   |   |
| NM-006b |   |   |   | ✓ |   |   |   |
| NM-007 |   |   |   | ✓ |   |   |   |
| NM-008 |   |   |   |   |   | ✓ |   |
| NM-009 | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ | ✓ |

### Nhóm 6.2 — Object Impact List ↔ SAP

Chỉ áp dụng CASE MODE.

| rule_id | Logic | Severity |
|---------|-------|----------|
| OI-001 | Object trong §3 design (action=`create` hoặc `edit`) nhưng `get_source` trả 404 / không tồn tại | E |
| OI-002 | Object đọc OK nhưng không có trong §3 (orphan) — quét bằng `list_package(system, "<package>")` đối chiếu | W |
| OI-003 | Package object thực (từ `list_package`/uri) ≠ package ghi trong §3 | E |
| OI-004 | Read trả `"data source does not exist or is not active"` | E |

Suggested fix:
- OI-001 → "Tạo object theo design (chạy /rap-gen hoặc tạo thủ công ADT)"
- OI-002 → "Update Object Impact List trong design HOẶC xóa object thủ công ADT (KHÔNG để agent xóa)"
- OI-003 → "Move object sang package đúng HOẶC sửa design"
- OI-004 → "Activate object thủ công trong ADT trước khi review lại"

### Nhóm 6.3 — Field Mapping + CDS field types

Rule source: `.claude/rules/cds-field-types.md` + design §5 (Field Mapping).

| rule_id | Logic | Severity |
|---------|-------|----------|
| FM-001 | Target field §5 không tồn tại trong DDLS/TABL (`get_source` source check) | E |
| FM-002 | Data element §5 ≠ ROLLNAME thực (tra `get_source(system, "TABL", "<name>")` lấy ROLLNAME field tương ứng) | E |
| FM-003 | Field tên match `(amount\|amt\|price\|cost\|value)` dùng `abap.dec` thay vì `abap.curr` | E |
| FM-004 | Field `abap.curr(*)` không có annotation `@Semantics.amount.currencyCode: '<field>'` ở dòng trên | W |
| FM-005 | Field `abap.quan(*)` mà entity không có field `abap.unit` đi kèm | E |
| FM-006 | Field `abap.cuky` thiếu annotation `@Semantics.currencyCode: true` | W |
| FM-007 | Abstract entity name > 30 chars HOẶC không có `key` field nào | E |
| FM-008 | Field date: design §5 ghi "ISO" nhưng CDS dùng `abap.numc(8)`, hoặc design ghi "integer YYYYMMDD" nhưng CDS dùng `abap.dats` | W |

### Nhóm 6.4 — Logic / Coding rules / Version header

Rule source: design §6 (Processing Logic), §7 (Validation Rules) + `agent-generate-code` § ABAP Cloud Coding Rules + § Version Comment Header.

| rule_id | Logic phát hiện (regex / grep source code) | Severity |
|---------|-------------------------------------------|----------|
| LG-001 | Validation rule §7 (lấy "Rule" hoặc "Error Message") không có substring nào xuất hiện trong source ZBP_* / ZCL_* tương ứng | I |
| LG-002 | Determination/Action name từ design §6 không có method định nghĩa trong ZBP_* (grep `METHODS <name>` hoặc `FOR DETERMINE`/`FOR ACTION`) | I |
| CR-001 | Regex `LOOP\s+AT[^.]+\.[\s\S]*?SELECT\b` (SELECT nằm trong LOOP AT … ENDLOOP) | E |
| CR-002 | Substring `COMMIT WORK` xuất hiện trong RAP class (ZBP_* hoặc ZCL_* có gọi EML) | E |
| CR-003 | Substring `save_log(` (không có `_2nd_db_connection`) trong CLAS ZCL_HS_* / ZHS_* | E |
| CR-004 | Substring `GET TIME STAMP FIELD` | E |
| CR-005 | EML pattern `CREATE FIELDS \(` chứa field name match `(creation_time\|last_change_time\|<key_field_từ_TABL>)` | E |
| HD-001 | CLAS / BDEF / DDLS / DDLX / SRVD thiếu block `[変更履歴]` trong 20 dòng đầu (**TABL miễn — không cần header**) | W |
| HD-004 | CLAS: block `[変更履歴]` xuất hiện trong `implementations`/`definitions` (`get_class_include`) mà **không** có ở `main` | W |
| HD-005 | DDLS / BDEF / DDLX / SRVD: block `[変更履歴]` dùng `/* */` hoặc `--` thay vì comment `//` | I |
| HD-002 | ZCJ_* có `DATA <name>` ở PUBLIC SECTION mà dòng ngay trên không phải `"! <p class="shorttext synchronized" lang="ja">` | W |
| HD-003 | ABAP Doc `"! <p class="shorttext synchronized" lang="en">` (en thay vì ja) | W |

Suggested fix template:
- LG-001 → "Validation '<rule>' chưa có reference trong code. Verify thủ công: có thực sự implement chưa? Nếu rồi → update design §7 ghi rõ method name; nếu chưa → add vào ZBP_* SAVE handler"
- LG-002 → "Method '<name>' từ design §6 không thấy trong ZBP_*. Verify implement chưa."
- CR-001 → "SELECT trong LOOP — refactor theo agent-generate-code Pattern 1 (EXISTS subquery), Pattern 2 (FOR ALL ENTRIES), hoặc Pattern 3 (JOIN)"
- CR-002 → "Đổi COMMIT WORK → COMMIT ENTITIES"
- CR-003 → "Đổi save_log( ) → save_log_2nd_db_connection( ) trong HTTP service context"
- CR-004 → "Đổi GET TIME STAMP FIELD → utclong_current( )"
- CR-005 → "Bỏ key/admin field khỏi CREATE FIELDS ( ... )"
- HD-001 → "Thêm block [変更履歴] V1.00 ở dòng đầu"
- HD-004 → "Move block [変更履歴] sang include `main` (trên dòng CLASS … DEFINITION) theo abap-cloud-naming.md § Version History Header"
- HD-005 → "Đổi comment sang `//` cho DDL/BDEF/DDLX/SRVD"
- HD-002 → "Thêm ABAP Doc `\"! <p class=\"shorttext synchronized\" lang=\"ja\">...</p>` ngay trên DATA"
- HD-003 → "Đổi lang=\"en\" → lang=\"ja\""

## Report format

Path:
- CASE MODE: `package/<C>/reviews/YYYY-MM-DD_review.md`
- OBJECT MODE: `package/<C>/reviews/YYYY-MM-DD_<TYPE>_<NAME>.md`

Trùng tên file → suffix `_2`, `_3`, ...

### Template

```markdown
# Review — <CaseName> — YYYY-MM-DD

- Reviewer: agent-review-code
- Mode: CASE | OBJECT
- System: <system từ frontmatter design>
- Variant: <Local VN | Global>
- Source: MCP live (<n> objects) + <m> snapshot files
- Design refs: package/<C>/designs/<file1>.md, <file2>.md
  (OBJECT MODE không tìm thấy design → ghi "No design reference")

## Summary

| Severity | Count |
|----------|-------|
| E (Error)   | <n> |
| W (Warning) | <n> |
| I (Info)    | <n> |

Objects in scope: <n> | Orphans: <n> | Missing: <n>

## Findings

| # | Sev | Object | Rule | Issue | Design Ref | Suggested Fix |
|---|-----|--------|------|-------|-----------|---------------|
| 1 | E | ZBP_ZI_VF901_01 | NM-002 | Class name lồng ZI_ | abap-cloud-naming §Class | Rename → ZBP_I_VF901_01 |
| 2 | E | ZI_VF901_01.Amount | FM-003 | Field tiền dùng abap.dec | cds-field-types §1 | Đổi abap.curr(24,2) + @Semantics.amount.currencyCode: 'Currency' |
| 3 | W | ZCJ_VF901_01.s_vkorg | HD-002 | DATA thiếu ABAP Doc lang=ja | agent-generate-code §APJ | Thêm "! <p class="shorttext synchronized" lang="ja">販売組織</p> |
| 4 | I | ZBP_I_VF901_01 | LG-001 | Không tìm thấy reference validation "Amount must be positive" | design §7 row 2 | Verify thủ công xem đã implement chưa |

## Notes
- Object ZBP_I_XXX: CCIMP đọc qua get_class_include (hoặc snapshot package/<C>/abap/*.locals_imp.abap nếu deploy mode local)
- Object Y trên SAP không nằm trong Object Impact List → orphan W (OI-002)
- get_source fail object Z với HTTP 404 → coi như chưa tạo (E OI-001)
```

### Quy tắc viết Issue + Suggested Fix

- **Issue**: tả lại đúng triệu chứng + quote 1 dòng source nếu được (vd: `"Found: 'lv_bukrs' tại line 42"`)
- **Suggested Fix**: action cụ thể engineer có thể thực thi. KHÔNG viết "fix it", phải nói rõ "đổi A thành B".
- **Design Ref**: format `"<file>.md §<số>"` hoặc `"<rule_file>.md §<heading>"`
