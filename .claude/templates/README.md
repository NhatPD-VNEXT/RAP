# .claude/templates/

Skeleton chuẩn cho từng object type RAP. Skill / `/rap-gen` đọc template thay vì tự sinh inline → giảm hallucination, đảm bảo consistency.

## Cấu trúc

```
templates/
├── design/         ← Coding Design Document skeleton (cho /rap-new)
├── cds/            ← CDS view skeleton (root, child, projection, custom-entity, MDE)
├── bdef/           ← BDEF skeleton (managed-draft, unmanaged, abstract, projection)
├── tabl/           ← DDIC table skeleton (header, child, draft _D)
├── clas/           ← ABAP class skeleton (ZBP locals, ZCJ job, ZCL_HS handler, ZCL query provider, ZCL outbound client)
└── service/        ← SRVD + SRVB skeleton (U4, U4W)
```

## Placeholder convention

| Placeholder | Ý nghĩa |
|-------------|---------|
| `{{CASE_NAME}}` | Tên case folder (vd `MI902`, `VR901_payment`) |
| `{{PJCODE}}` | Module ID + 3 digit (vd `MI902`, `VR901`) |
| `{{PACKAGE}}` | Package SAP (vd `ZRAP_IF_MI902_VN`) |
| `{{TABLE}}` | Tên Z table (vd `ZM902T`) |
| `{{DATA_MODEL}}` | Data model ID (`ZI_<PJCODE>_01[_VN]`) |
| `{{PROJECTION}}` | Projection ID (`ZC_<PJCODE>_01[_VN]`) |
| `{{BEHAVIOR_CLASS}}` | `ZBP_I_<PJCODE>_01[_VN]` |
| `{{HELPER_CLASS}}` | `ZCL_<PJCODE>_01[_VN]` |
| `{{JOB_CLASS}}` | `ZCJ_<PJCODE>_01` |
| `{{HTTP_HANDLER}}` | `ZCL_HS_<PJCODE>_01` |
| `{{SUFFIX}}` | `_VN` cho VN local, hoặc rỗng |
| `{{DATE}}` | Ngày tạo (YYYY-MM-DD) |
| `{{AUTHOR}}` | User git config |

Skill / command thay placeholder bằng giá trị thật trước khi MCP edit.

## Rules

- Template = **starting point**, không phải production code. Phải tinh chỉnh theo design.
- Không edit template khi làm case mới — fork ra package/<Case>/abap/ rồi sửa.
- Cập nhật template khi phát hiện pattern mới từ case production (VI901/MI901/VI902 hoặc case mới đã activate).
