---
system:  {{SYSTEM}}      # tên system trong list_systems của adt-mcp — /rap-gen truyền system="{{SYSTEM}}" vào sap-adt tools
variant: {{VARIANT}}     # "Local VN" → tất cả object có suffix _VN. "Global" → không suffix.
suffix:  {{SUFFIX}}      # "_VN" hoặc ""
pjcode:  {{PJCODE}}
package: {{PACKAGE}}     # mặc định ZRAP_{{TYPE}}_{{PJCODE}}{{SUFFIX}}; package có sẵn tên khác → ghi tên thật
package_state: {{PACKAGE_STATE}}   # "existing" (đã có trên system) hoặc "new" (phải tạo tay DEVC trong ADT)
---

# {{CASE_NAME}} — Coding Design Document

> **System**: `{{SYSTEM}}`   (deploy đích — sap-adt tools với `system="{{SYSTEM}}"`)
> **Pattern**: {{PATTERN}}
> **Variant**: {{VARIANT}}  (suffix = `{{SUFFIX}}`)
> **Package**: `{{PACKAGE}}` ({{PACKAGE_STATE}})
> **Created**: {{DATE}}
> **Status**: draft

> ⚠ **Naming rule**: Nếu `variant = Local VN` → **MỌI** object trong Object Impact List bên dưới phải có suffix `_VN`. Riêng draft table: `_VN` đứng trước `_D` (vd `ZM902T_VN_D`).

---

## 1. Requirement Summary

- **Business need**:
- **Source BD / Requirement**: `package/{{CASE_NAME}}/docs/<filename>`
- **Trigger**:
- **Frequency**:

## 2. Metadata Investigation

| Object | Type | Status | MCP verified | Note |
|--------|------|--------|--------------|------|
|        |      |        |              |      |

> Field/table/CDS đã kiểm tra qua MCP sap-adt (`get_source(system, "TABL", "...")`). Object đã tồn tại / cần tạo mới / cần sửa.

**Open items** (chưa xác minh được):
-

## 3. Object Impact List

| # | Object Type | Object Name | Package | Description | Action | MCP Deploy | Status |
|---|-------------|-------------|---------|-------------|--------|-----------|--------|
| 1 |             |             |         |             | create/edit | auto/clas-confirm/manual | pending |

> `Action`: `create` | `edit`
>
> `MCP Deploy` (từ vựng chuẩn — dùng đúng 3 giá trị này, `/rap-gen` parse):
> - `auto` = sap-adt deploy thẳng: TABL, DDLS, BDEF, **DDLX**, SRVD, SRVB, PROG, INTF
> - `clas-confirm` = CLAS (`ZBP_*`/`ZCL_*`/`ZCJ_*`/`ZCL_HS_*`) — deploy được qua `create_object`+`update_class_include`, nhưng `/rap-gen` pre-flight 7e hỏi user chọn MCP hay local snapshot vào `package/{{CASE_NAME}}/abap/`
> - `manual` = sap-adt không hỗ trợ, làm tay ADT/Fiori: DEVC (package), ZJC/ZJT, ZAL, ZHS, ZSC, ZNR, IAM App/Catalog, Comm Scenario/Arrangement, ENHO
>
> `Status` (resume của `/rap-gen` dựa vào cột này):
> - `pending` — mặc định khi design, sẽ được deploy
> - `done` — đã activate thành công, lần chạy sau bỏ qua
> - `skip` — object đã tồn tại trên system và user quyết dùng nguyên trạng (không deploy), ghi ở collision check 7c

## 4. Input / Output

**Input**:
- Source:
- Format:
- Fields:

**Output**:
- Target:
- Format:
- Fields:

## 5. Field Mapping

| Source Field | Target Field | Data Element | Conversion | Default |
|--------------|--------------|--------------|-----------|---------|
|              |              |              |           |         |

## 6. Processing Logic

```
1. Step ...
2. Step ...
```

**Branch / Special case**:
-

## 7. Validation Rules

| Rule | Thời điểm | Error Message | Behavior khi lỗi |
|------|-----------|---------------|-------------------|
|      |           |               |                   |

## 8. Error Handling

- Lỗi nghiệp vụ:
- Lỗi kỹ thuật:
- Rollback / skip / continue:

## 9. Test Points

- Normal:
- Abnormal:
- Edge:
- Regression:

## 10. Open Questions

-

---

## Manual Steps (ADT/Fiori admin)

> Generate khi `/rap-gen` chạy xong các object `auto`. Liệt kê object `manual` + object `clas-confirm` mà user chọn local snapshot.

| # | Object | Tool | Hướng dẫn | Done |
|---|--------|------|-----------|------|
|   |        |      |           | [ ]  |
