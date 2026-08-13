---
name: rap-generate
description: RAP code generation pipeline qua MCP sap-adt. Định nghĩa thứ tự build, sap-adt tool call per object type, deployment matrix (object nào MCP deploy được vs object nào manual trong ADT/Fiori), error recovery, post-generate verify. Trigger khi agent generate code, deploy SAP object, hoặc user invoke /rap-gen.
---

# rap-generate — RAP Generation Pipeline

> Source of truth cho việc generate / deploy RAP object qua MCP `sap-adt`. **Framework SYSTEM-AGNOSTIC**: SAP system là **per-case attribute**, đọc từ `system:` trong frontmatter design doc và truyền vào param `system` của mỗi tool. KHÔNG hard-code system vào logic.
> Cú pháp tool chuẩn → xem skill `rap-mcp-adt`. Tool name có prefix `mcp__sap-adt__`.

---

## 0. Pre-flight check (BẮT BUỘC trước khi generate)

Đọc Coding Design Document `package/<CaseName>/designs/*.md`, verify:

- [ ] Frontmatter có `system:` (tên system trong `list_systems`) — KHÔNG có → **stop**, hỏi user system đích
- [ ] Frontmatter có `variant:` + `suffix:` (Local VN / Global)
- [ ] Đủ 10 mục theo `agent-design.md`
- [ ] Object Impact List có: `Object Type`, `Object Name`, `Package`, `Action` (`create`/`edit`), `Description`
- [ ] Naming khớp `.claude/rules/abap-cloud-naming.md` (đặc biệt `ZBP_I_*` KHÔNG lồng `ZI_`)
- [ ] Suffix variant áp đúng toàn bộ Object Impact List (xem `/rap-gen` pre-flight § 4)
- [ ] Field type khớp `.claude/rules/cds-field-types.md` (curr/quan/dats/numc)
- [ ] Open Questions = empty hoặc đã có Assumptions rõ
- [ ] **MỌI package trong Object Impact List đã tồn tại trên SAP** — check từng cái: `list_package(system, "ZRAP_...")`; nghi ngờ thì xác nhận `search_objects(system, "<PKG>")` (kind `DEVC`). Không tồn tại → **STOP**, báo user tạo thủ công trong Eclipse ADT (New → ABAP Package), KHÔNG tự tạo, KHÔNG đổi package, KHÔNG deploy một phần.
- [ ] Header `[変更履歴]` chuẩn bị cho CLAS/DDLS/BDEF/DDLX/SRVD — **TABL không cần header**

Thiếu bất kỳ → **stop, hỏi user**, không generate.

### System resolution

System trong frontmatter → param `system` của mọi sap-adt tool:

```
system: <name>  →  get_source(system="<name>", ...)
                   update_source(system="<name>", ...)
                   create_object(system="<name>", ...)
```

- System phải có trong `list_systems`. Chưa có → **STOP**, báo user system chưa được cấu hình server-side trên adt-mcp.
- Write (create/update/activate) cần system được phép write server-side. Bị chặn (403/`package not allowed`) → báo nguyên văn lỗi cho user.

Reference package (VI901/MI901/MI902/VI902 …) có thể nằm ở **system khác** với system đích:
1. Note rõ trong design "Metadata Investigation": `Read reference VI901 from system <X>`.
2. Đọc với `system="<X>"`.
3. **KHÔNG copy reference object sang case nếu khác system** — chỉ tham chiếu pattern, naming tự tạo theo design.

---

## 1. RAP Build Order

Tuân thứ tự tầng, không lộn:

```
1. TABL (DDIC table + draft _D nếu managed-with-draft)
2. DDLS — CDS interface ZI_ (root + child)
3. DDLS — CDS projection ZC_ (nếu có Fiori UI)
4. BDEF — interface BDEF cho ZI_ (managed/unmanaged/abstract)
5. CLAS — ZBP_I_* behavior implementation (deploy mode đã chốt ở /rap-gen 7e — § 2.CLAS)
6. BDEF — projection BDEF cho ZC_ (use draft + expose)
7. DDLX — Metadata Extension (UI annotation)
8. CLAS — ZCL_*/ZCJ_*/ZCL_HS_* helper/job/handler (deploy mode đã chốt ở /rap-gen 7e — § 2.CLAS)
9. SRVD — Service Definition
10. SRVB — Service Binding (U4/U4W/U2/U2W/AS)
11. Communication Scenario / IAM App / Catalog — manual trong ADT/Fiori admin
```

**Stop condition giữa step**: nếu activate fail (severity="E") → stop, parse lỗi, đề xuất fix, KHÔNG đi tiếp.

### 1.1 Phased checkpoint mode — gen từng phần, DỪNG báo user check rồi mới tiếp (default)

Gen theo **từng phần RAP**, không chạy một mạch hết case. Sau mỗi phần → verify active → **DỪNG, báo user tóm tắt** (object + status + quyết định type/naming đáng lưu ý) → **chờ user xác nhận** mới sang phần kế. Ranh giới phần:

```
Phần 1: TABL (tất cả table + draft _D)
Phần 2: DDLS interface ZI_ (root + child, co-activate 3-bước)
Phần 3: DDLS projection ZC_
Phần 4: BDEF interface ZI_ + BDEF projection ZC_ (§ 3.3.1 — KHÔNG bỏ qua projection BDEF)
Phần 5: CLAS ZBP_I_* (dùng deploy mode đã chốt ở /rap-gen 7e — § 2.CLAS)
Phần 6: DDLX (metadata extension UI)
Phần 7: CLAS ZCL_*/ZCJ_*/ZCL_HS_*
Phần 8: SRVD + SRVB
Phần 9: Manual Steps (package/IAM/Comm/ZJC…) — chỉ snapshot + hướng dẫn
```

- Báo cuối mỗi phần: bảng object + kind + syntax_check OK/E + note. Nếu có E → STOP báo nguyên văn (không tự loop fix).
- KHÔNG gộp nhiều phần trong 1 lượt trừ khi user nói "gen hết"/"không cần dừng".
- User có thể yêu cầu gen lẻ 1 phần (vd chỉ TABL) → chỉ làm phần đó rồi dừng.
- Mỗi phần xong cập nhật Object Impact List cột `Status` → `done` trước khi báo.

---

## 2. sap-adt Deployment Matrix

### A. MCP deploy trực tiếp (`create_object` mới / `update_source` sửa + activate)

| Object | Action mới | Action sửa | Note |
|--------|-----------|-----------|------|
| DDIC Table | `create_object("TABL")` | `update_source("TABL")` | Draft `_D` cũng dùng TABL. KHÔNG khai báo `key client` trong source |
| CDS View | `create_object("DDLS")` | `update_source("DDLS")` | ZI_/ZC_; annotation @UI/@ObjectModel inline |
| Behavior Definition | `create_object("BDEF")` | `update_source("BDEF")` | managed/unmanaged/abstract |
| Metadata Extension | `create_object("DDLX")` | `update_source("DDLX")` | ✅ sap-adt hỗ trợ DDLX (khác VSP) |
| Service Definition | `create_object("SRVD")` | `update_source("SRVD")` | |
| Service Binding | `create_object("SRVB", service_definition="ZSD_...", binding_version=...)` | — | Activate xong tự generate runtime |
| Program | `create_object("PROG")` | `update_source("PROG")` | |
| Interface | `create_object("INTF")` | `update_source("INTF")` | |

### CLAS — sap-adt deploy ĐƯỢC, deploy mode chốt 1 lần ở pre-flight

> sap-adt ghi được class qua `create_object("CLAS")` + `update_class_include` (global `main`, `definitions` CCDEF, `implementations` CCIMP, `testclasses` CCAU) — khác hẳn VSP cũ (chỉ ghi global, cấm CCIMP).
>
> **Deploy mode được hỏi 1 lần ở `/rap-gen` pre-flight 7e** (`AskUserQuestion`, TRƯỚC khi deploy object đầu tiên) — KHÔNG hỏi lại giữa build order:
> - **Deploy qua MCP**: `create_object("CLAS", name, package, description)` → `update_class_include(class_name, "main", <global source>)` → `update_class_include(class_name, "implementations", <CCIMP>)` (+ `definitions`/`testclasses` nếu có) → `activate("CLAS", name)`.
> - **Local snapshot**: sinh source vào `package/<Case>/abap/<ClassName>.clas.abap` (+ `.locals_imp.abap` / `.locals_def.abap` / `.testclasses.abap`), user tự tạo + paste trong Eclipse ADT.
>
> Lựa chọn áp cho cả case. Đọc class reference để adapt: `get_class_include(system, "<blueprint>", "implementations")`.
>
> **Split rule theo loại class (verified IPS 2026-07-16 — pattern user hay dùng)**: behavior pool `ZBP_I_*` vs class thường `ZCL_*/ZCJ_*/ZCL_HS_*` có thể khác deploy mode:
> - **`ZBP_I_*` (behavior pool)**: sap-adt KHÔNG tạo mới class behavior pool đúng chuẩn (phải link BEHAVIOR OF) → **user tạo class trong Eclipse ADT trước** (từ BDEF: quick-fix "generate behavior implementation class"). Sau đó MCP chỉ **update code** qua `update_class_include`. **Code chính viết vào include `implementations` (CCIMP local class `lhc_*`/`lsc_*`)** — global `main` để nguyên skeleton ADT sinh (`CLASS zbp_i_* DEFINITION ... FOR BEHAVIOR OF ...`). KHÔNG ghi đè `main` bằng logic.
> - **`ZCL_*/ZCJ_*/ZCL_HS_*` (class thường/job/handler)**: MCP tạo mới đầy đủ — `create_object("CLAS")` → `update_class_include("main", ...)` (định nghĩa + implementation) + `definitions`/`implementations` nếu tách local types → `activate`.
> - Xác nhận `ZBP_I_*` đã tồn tại trước khi update: `get_class_include(system, "ZBP_I_*", "implementations")`; báo `does not exist` → STOP, nhờ user tạo shell trong Eclipse trước.
> - Dependency: `ZBP_I_*` action gọi `ZCL_*` orchestrator → build `ZCL_*` TRƯỚC (MCP) rồi mới update `ZBP_I_*`, nếu không activate ZBP fail vì class chưa tồn tại.

### B. MCP KHÔNG hỗ trợ — manual trong ADT/Fiori admin

Object dưới đây không phải RAP source object mà `sap-adt` create được → **tạo/sửa thủ công**. Snapshot config/instruction vào `package/<CaseName>/abap/` + note vào design "Manual Steps":

| Object | Tool | Lý do |
|--------|------|------|
| Package (DEVC) | ADT → New → Package | `create_object` không tạo package — package phải có sẵn |
| Application Job Catalog Entry (ZJC_*) | ADT → ABAP Repository Object | Manual create |
| Application Job Template (ZJT_*) | Fiori "Application Jobs" hoặc ADT | Manual create + bind ZJC |
| Application Log Object (ZAL_*) | ADT | Manual create + subobjects |
| Communication Scenario | ADT | Manual + assign service binding + outbound service |
| Outbound Service | ADT (trong Comm Scenario) | Manual |
| Service Consumption Model (ZSC_OD_*) | ADT → New → Service Consumption Model from Remote | Import metadata từ remote |
| IAM App (ZIAM_*) | ADT | Manual + assign business catalog |
| IAM Business Catalog (ZBC_*) | ADT | Manual |
| Number Range Object (ZNR_*) | ADT | Manual |
| HTTP Service (ZHS_*) | ADT → New → HTTP Service | Manual; handler class ZCL_HS_* sinh source rồi gắn (xem CLAS) |
| Scalar Function (ZSF_*) | ADT | Manual |
| Number Range Interval (giá trị thật) | Fiori "Number Range Maintenance" | Runtime config |

→ Object Impact List đánh cột "MCP Deploy" = `auto` / `manual` / `clas-confirm`.

### C. Snapshot file naming convention (manual + class local)

| Object type | File trong `package/<Case>/abap/` | Nội dung |
|-------------|--------------------------------|---------|
| Global class (nếu chọn local snapshot) | `<ClassName>.clas.abap` | DEFINITION + IMPLEMENTATION |
| ZBP_I_* locals_imp (CCIMP) | `<ClassName>.locals_imp.abap` | lhc_ handler + lsc_ saver |
| Class locals_def (CCDEF) | `<ClassName>.locals_def.abap` | Definition section |
| Class testclasses (CCAU) | `<ClassName>.testclasses.abap` | Test class |
| Application Job Catalog `ZJC_*` | `<JC_Name>.zjc.md` | package, class binding (`ZCJ_*`), name/description |
| Application Job Template `ZJT_*` | `<JT_Name>.zjt.md` | Reference ZJC, default parameter values |
| Application Log Object `ZAL_*` | `<AL_Name>.zal.md` | Subobjects list |
| Communication Scenario | `<Scenario_Name>.cscenario.md` | Inbound/Outbound services, auth, scope |
| Outbound Service | `<Service_Name>.outsvc.md` | Service type, URL pattern, parent scenario |
| Service Consumption Model `ZSC_*` | `<SC_Name>.zsc.md` | Remote scenario, metadata source |
| IAM App `ZIAM_*` | `<IAM_Name>.iam.md` | App type, bound SRVB, business catalog |
| HTTP Service `ZHS_*` | `<HS_Name>.zhs.md` | URI path, bound handler class |
| Number Range Object `ZNR_*` | `<NR_Name>.znr.md` | Sub-objects, length, interval template |

**Format `.md`** (manual): 5 section — `# <Object> — Manual Setup`, `## ADT/Fiori Path`, `## Properties` (table), `## Source / Configuration` (paste-ready nếu có), `## Dependencies`, `## Verification`.

**Format `.abap`** (class local snapshot): header comment `* COPY THIS INTO ADT: <ClassName> → <main/Local Types tab>`.

---

## 3. Tool Call Templates per Object Type

### 3.1 DDIC Table (managed BO)

> Trước khi tạo/sửa TABL: load skill `rap-table` (currency/quantity annotation qualified syntax `'<table>.<field>'`, admin fields chuẩn, draft `%admin`).

```
create_object(system,
  object_type="TABL",
  name="ZV901T",
  package="ZRAP_IF_VI901",
  description="Sales Order Header — VI901",
  source="@EndUserText.label : 'Sales Order Header'\n@AbapCatalog.tableCategory : #TRANSPARENT\n@AbapCatalog.deliveryClass : #A\n@AbapCatalog.dataMaintenance : #LIMITED\ndefine table zv901t {\n  key sales_order  : sysuuid_x16 not null;\n  document_number  : abap.char(20);\n  ...\n  last_updated_at  : timestampl;\n  local_last_updated_at : timestampl;\n  created_at       : timestampl;\n  created_by       : abp_creation_user;\n}")
```
> KHÔNG khai `key client` — server tự thêm. Draft `ZV901T_D`: `create_object("TABL", ...)` riêng với cùng key + `%admin` columns chuẩn draft (clone schema từ `get_source("TABL","ZV901T_D")` của VI901).

### 3.2 CDS Interface View (root)

```
create_object(system,
  object_type="DDLS",
  name="ZI_VI901_01",
  package="ZRAP_IF_VI901",
  description="Data Model：Sales Order Header VI901",
  source="@AccessControl.authorizationCheck: #NOT_REQUIRED\ndefine root view entity ZI_VI901_01\n  as select from zv901t\n  composition [0..*] of ZI_VI901_02 as _Item\n{\n  key sales_order as SalesOrder,\n  document_number as DocumentNumber,\n  ...\n  @Semantics.user.createdBy: true\n  created_by as CreatedBy,\n  _Item\n}")
```
Object đã tồn tại → `update_source(system, "DDLS", "ZI_VI901_01", source="...", activate=True)`.

#### 3.2.1 Root ↔ Child co-activation cycle — BẮT BUỘC dùng 3-bước (verified IPS 2026-07-16)

Root có `composition [0..*] of Child` **và** child có `association to parent Root` → **circular dependency**. `activate` single-object KHÔNG mass-activate cặp này → fail `E: data source "..." does not exist or is not active` (cả 2 chiều). Tạo shell inactive rồi activate 1 object cũng fail y hệt.

→ **Phá cycle bằng 3 write tuần tự** (áp cho cả interface ZI_ lẫn projection ZC_):

```
1. Root PLAIN — bỏ composition/_Item, chỉ field:  create_object/update_source(activate=True)  → root active (chỉ depend TABL)
2. Child + to-parent — association to parent Root (đã active) + _Header:  update_source(activate=True)  → child active
3. Root + composition — thêm lại composition of Child (đã active) + _Item:  update_source(activate=True)  → root active đủ
```

Projection cũng vậy: (1) ZC_ root plain projection, (2) ZC_ child + `_Header : redirected to parent`, (3) ZC_ root + `_Item : redirected to composition child`.

> KHÔNG dùng shell + `activate` root để mong mass-activate — verified fail. 3-bước là cách chắc.

#### 3.2.2 Projection `@Search.searchable: true` cần `defaultSearchElement`

Projection root có `@Search.searchable: true` → phải có **≥1 field** gắn `@Search.defaultSearchElement: true`, nếu không: `E:1: At least one element has to be set as 'defaultSearchElement'` (update báo OK nhưng syntax_check active version báo E → luôn syntax_check active sau activate). Gán vào field text tiêu biểu (vd FileName).

### 3.3 BDEF (managed with draft)

```
create_object(system,
  object_type="BDEF",
  name="ZI_VI901_01",
  package="ZRAP_IF_VI901",
  description="Behavior for ZI_VI901_01",
  source="managed implementation in class zbp_i_vi901_01 unique;\nstrict ( 2 );\nwith draft;\n\ndefine behavior for ZI_VI901_01 alias Header\npersistent table zv901t\ndraft table zv901t_d\nlock master\ntotal etag LastUpdatedAt\nauthorization master ( instance, global )\netag master LocalLastUpdatedAt\n{\n  create ( authorization : global );\n  update;\n  delete ( precheck );\n  field ( readonly ) SalesOrder, CreatedBy, CreatedAt;\n  field ( numbering : managed ) SalesOrder;\n  association _Item { create ( features : instance ); with draft; }\n  validation vldBeforeSave on save { create; update; }\n  draft action Edit;\n  draft action Activate optimized;\n  draft action Discard;\n  draft action Resume;\n  draft determine action Prepare { validation vldBeforeSave; }\n  mapping for zv901t { SalesOrder = sales_order; ... }\n}")
```

#### 3.3.1 Projection BDEF (`ZC_*`) — BẮT BUỘC, KHÔNG bỏ qua (verified IPS 2026-07-16)

Mỗi projection view ZC_ (Fiori UI) cần **BDEF projection riêng** tên `ZC_<PJ>_NN` (khác BDEF interface). Không có nó → SRVB không expose được behavior (create/update/action). Tạo NGAY sau BDEF interface (không cần chờ ZBP class — projection BDEF không tham chiếu class).

```
create_object(system, "BDEF", "ZC_VI901_01_VN", "<pkg>", "Projection Behavior for ZC_VI901_01_VN",
 source=
"projection;
strict ( 2 );
use draft;

define behavior for ZC_VI901_01_VN alias Header
{
  use create;
  use update;
  use delete;
  use action Register;      -- mọi custom action của interface phải 'use'

  use action Edit;          -- ⚠ strict(2)+use draft: draft action PHẢI khai explicit
  use action Activate;
  use action Discard;
  use action Resume;
  use action Prepare;

  use association _Item { create; with draft; }
}

define behavior for ZC_VI901_02_VN alias Item
{
  use update;
  use delete;
  use association _Header { with draft; }
}")
```

**Gotchas (verified fail→fix)**:
- `strict ( 2 )` + `use draft` → draft action (Edit/Activate/Discard/Resume/Prepare) **phải khai explicit** bằng `use action <name>;`. Thiếu → `E:5: the draft action "Edit" must be included explicitly in the projection`.
- Cú pháp là `use action Edit;` — **KHÔNG** `use draft action Edit;` (parser: `"action|association|create|delete|... was expected, not "draft"`).
- `Activate` khai `use action Activate;` (không kèm `optimized` — optimized chỉ ở interface BDEF).
- Custom action interface (vd `Register`) cũng phải `use action Register;` mới expose ra OData.

### 3.4 Class (CLAS) — theo deploy mode đã chốt ở /rap-gen 7e (§ 2.CLAS)

Áp dụng `ZBP_I_*`, `ZCL_*`, `ZCJ_*`, `ZCL_HS_*`.

**Nếu user chọn deploy MCP:**
```
create_object(system, "CLAS", "ZBP_I_VI901_01", "ZRAP_IF_VI901", "Behavior impl VI901")
update_class_include(system, "ZBP_I_VI901_01", "main", "<global DEFINITION+IMPLEMENTATION>", activate=False)
update_class_include(system, "ZBP_I_VI901_01", "implementations", "<lhc_/lsc_ source>", activate=True)
// + "definitions" / "testclasses" nếu có
```
**Nếu user chọn local snapshot:** ghi `package/<Case>/abap/<ClassName>.clas.abap` + `.locals_imp.abap`, báo user paste trong ADT.

Tham khảo class đã activate: `get_class_include(system, "ZBP_I_VI901_01", "implementations")`.

### 3.5 Service Definition + Binding

```
create_object(system, "SRVD", "ZSD_VI901_01", "ZRAP_IF_VI901", "Sales Order Service",
  source="@EndUserText.label: 'Sales Order Service'\ndefine service ZSD_VI901_01 {\n  expose ZC_VI901_01 as SalesOrder;\n  expose ZC_VI901_02 as SalesOrderItem;\n}")

create_object(system, "SRVB", "ZSB_U4_VI901_01", "ZRAP_IF_VI901", "Service Binding",
  service_definition="ZSD_VI901_01", binding_version="V4")
```
Binding type matrix (U4/U4W/U2/U2W/AS) → xem skill `rap-service`.

---

## 4. Error Recovery

### 4.0 Writes STRICTLY SEQUENTIAL — never batch (CSRF)
**1 write/lần. TUYỆT ĐỐI không gọi song song nhiều `create_object`/`update_source`/`update_class_include`/`activate` trong cùng 1 response.** Mỗi write rotate CSRF token của server; write song song vô hiệu token của nhau → `lock failed (HTTP 403): CSRF token validation failed`, session kẹt tới mức single write sau `refresh_cookies_for` vẫn fail. Read được phép song song, chỉ WRITE phải nối tiếp: write → chờ kết quả → write kế. (Verified IPS: batch 5 `create_object` song song để lại 5 shell rỗng rồi jam CSRF toàn bộ write sau.)

### 4.1 Session expired / CSRF
Dấu hiệu: `no CSRF token in response`, `<title>Log On</title>`, `CSRF token validation failed`, redirect oauth/saml, `<html>` thay JSON.
→ **STOP, không tự retry liên tục.** Gọi `refresh_cookies_for(system="<system>")` rồi retry 1 lần (single write). Vẫn fail → báo user nguyên văn, **nhờ user reconnect MCP** (session mới cấp CSRF token sạch), dừng — không lặp.

Lỗi khác (403/404/`package not allowed`) → không phải session: báo nguyên văn, dừng.

### 4.2 Write + Activate verify ngay sau mỗi object — trước khi sang object tiếp theo

> sap-adt có tool `syntax_check(system, object_type, name, version)` chạy trên object đã lưu (`version="inactive"` = đã save chưa activate). Có thể tách `update_source(activate=False)` → `syntax_check` → `activate`, hoặc gộp `update_source(activate=True)` rồi đọc activation log.

Sau khi ghi **1 object** (TABL/DDLS/BDEF/SRVD/SRVB/DDLX; CLAS nếu deploy MCP), theo đúng thứ tự — không bỏ bước:

1. **[Write]** `create_object` (mới) / `update_source` (sửa). Build nhiều object phụ thuộc → dùng `activate=False`.
2. **[Syntax check]** `syntax_check(system, "<TYPE>", "<NAME>", version="inactive")`:
   - Có `severity:"E"` → **STOP NGAY**, KHÔNG activate, KHÔNG sang object tiếp theo.
     - Báo user **nguyên văn** list lỗi (line, severity, text) — KHÔNG tóm tắt.
     - KHÔNG tự thử sửa — chờ user xác nhận source mới/cách sửa.
   - Chỉ `severity:"W"` → liệt kê cho user, tiếp tục.
3. **[Activate]** `activate(system, "<TYPE>", "<NAME>")` (hoặc đã activate qua `update_source(activate=True)` ở bước 1). Activation báo `severity:"E"` → STOP, báo nguyên văn.
4. **[Read-back verify]** `get_source(system, "<TYPE>", "<NAME>")` confirm object tồn tại + source đúng + đã active.
5. **[Update design status]** sửa Object Impact List cột `Status` → `done` (Edit tool).

### 4.3 Lỗi bất thường ngay sau bước đầu — STOP, KHÔNG tự loay hoay debug

Nếu verify fail với lỗi không khớp expectation (activation báo OK nhưng table/CDS không truy cập được, DDIC inconsistency, lỗi lạ):
- **STOP sau 1 lần thử fix hợp lý** (vd `activate` lại 1 lần). KHÔNG lặp nhiều cách (xóa-tạo lại, tạo object test phụ để debug...).
- Báo user ngắn gọn: object nào, lỗi gì, đã thử gì (1 lần), hỏi hướng xử lý.
- KHÔNG tạo thêm object phụ (`*_TEST`) để debug trên hệ thống sống.

### 4.4 Output quá lớn
adt-mcp trả response; nếu MCP ghi ra file `tool-results/*.txt` → đọc lại bằng `Read` tool offset/limit 200 dòng/lần.

---

## 5. Post-generate Verification

Sau mỗi object create/update:

1. **Activation**: đọc activation log trong response create/update (hoặc gọi `activate(system, "<TYPE>", "<NAME>")`) — verify không có `severity:"E"`.
2. **Read-back**: `get_source(system, "<TYPE>", "<NAME>")` — confirm object exist + source đúng.
3. **Cross-reference**: BDEF mention class `zbp_i_*` → `search_objects` / `get_source("CLAS", ...)` verify class đã exist.
4. **Update design**: Object Impact List cột `Status` → `done` + timestamp.
5. **Save memory** (per CLAUDE.md agentmemory rule):
   ```
   memory_save({
     content: "Tạo <object> trong <package> trên <system>. Pattern: <managed/unmanaged/...>",
     type: "fact",
     concepts: ["<object-name>", "<system>", "<pattern>"],
     files: ["package/<Case>/designs/<name>.md"]
   })
   ```

---

## 6. Manual Steps Section (bắt buộc viết vào design)

Nếu Object Impact List có object thuộc **Matrix B** (manual), design doc phải có section:

```markdown
## Manual Steps (ADT/Fiori admin)

| # | Object | Tool | Hướng dẫn | Done |
|---|--------|------|----------|------|
| 1 | ZIAM_U4_MI901_01_EXT | ADT IAM App | New → IAM App External → bind SRVB ZSB_U4_MI901_01 + business catalog ZBC_MI901_01 | [ ] |
| 2 | ZJC_MI901_01 | ADT → ABAP Repository Object → Application Job Catalog Entry | Class ZCJ_MI901_01, name "Send PO Data" | [ ] |
| 3 | ZJT_MI901_01 | Fiori "Application Jobs" hoặc ADT | Reference ZJC_MI901_01 | [ ] |
| 4 | ZAL_MI901_01 | ADT Application Log Object | Subobjects: MAIN, SAP_ERROR | [ ] |
```

User tick từng item khi đã làm trong ADT.

---

## 7. Reference Pattern Lookup

Khi cần xem implementation chuẩn đã activate (read-only):

| Pattern | Reference | Call |
|---------|-----------|------|
| Managed BO + draft + Fiori upload | VI901 | `list_package(system, "ZRAP_IF_VI901")` (system reference lưu ở memory/CLAUDE.md) |
| Custom Web API JSON → BO interface | MI902 | `package/MI902/designs/` + `list_package` |
| Background job + custom entity monitor | MI901 | `list_package(system, "ZRAP_IF_MI901")` |
| HTTP inbound + OData V4 outbound | VI902 | `list_package(system, "ZRAP_IF_VI902")` |
| Outbound OData call (PATCH + Function Import + Batch) | VI902 ZCL_HS_VI902_01 | `get_class_include(system, "ZCL_HS_VI902_01", "implementations")` |
| Custom entity + query provider | MI901 ZCL_MI901_03 | `get_class_include(system, "ZCL_MI901_03", "implementations")` |
| Buffer pattern (unmanaged action → save flush) | MI901 ZBP_I_MI901_03 CCIMP | `get_class_include(system, "ZBP_I_MI901_03", "implementations")` |

Mỗi lần đọc reference: **read-only**. Pattern extract vào skill tương ứng (`rap-managed-bo`, `rap-job`, ...). Tìm reference qua tool search của `sap-adt` (`search_objects`, `grep_package`, `list_package` — xem agent-design/generate); source authoritative đọc live qua `get_source`/`get_class_include`.
