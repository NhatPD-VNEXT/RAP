---
name: rap-managed-bo
description: "Build full managed RAP BO on ABAP Cloud/BTP: persistent table + draft table + CDS root/child + managed BDEF + projection BDEF + behavior implementation in Local Types. Covers composition, draft handling, side effects, determinations, validations, prechecks, instance/global authorization, managed numbering. Reference pattern: VI901 (file upload BO with parallel processing). Trigger on: 'managed BO', 'managed BDEF', 'with draft', 'persistent table', 'draft table', 'composition', '_Item', 'projection BDEF', 'side effects', 'determination on modify', 'validation on save', 'precheck delete', 'numbering managed', 'cl_abap_behavior_handler', 'MODIFY ENTITIES IN LOCAL MODE', 'AUTO FILL CID', '%cid', '%tky', '%is_draft', 'Fiori list report object page'."
---

# RAP Managed BO — Full Pattern

Build a complete managed RAP BO theo chuẩn IPS Ver4.0, lấy từ package tham chiếu **ZRAP_IF_VI901** (file upload với draft + Fiori UI + parallel processing tạo SO/PO).

## Reference files (progressive disclosure — đọc khi tới bước tương ứng)

| Step | Nội dung | File |
|------|---------|------|
| Step 1–5 | Table DDL + CDS root/child/projection (full code) | `references/tables-cds.md` |
| Step 6–7 | Interface BDEF + Projection BDEF (full code) | `references/bdef.md` |
| Step 8–9 | Behavior handler skeleton, EML patterns, message API, saver, helper class | `references/behavior-impl.md` |

SKILL.md này = index + Critical rules mỗi step. Code khối lớn nằm ở reference file — chỉ đọc khi generate object đó (tránh nạp full context).

## Templates (copy-then-fill, không inline gen)

| Object | Template | Note |
|--------|---------|------|
| Header table | `.claude/templates/tabl/tabl-header.tabl` | persistent table |
| Item table | `.claude/templates/tabl/tabl-item.tabl` | child table |
| Draft table | `.claude/templates/tabl/tabl-draft.tabl` | suffix `_D`, include `%admin` |
| CDS root | `.claude/templates/cds/cds-root-view-managed.cds` | with composition `_Item` |
| CDS item | `.claude/templates/cds/cds-child-view.cds` | association to parent |
| CDS projection | `.claude/templates/cds/cds-projection.cds` | provider contract transactional_query |
| BDEF interface | `.claude/templates/bdef/bdef-managed-draft.bdef` | full managed-draft pattern |
| BDEF projection | `.claude/templates/bdef/bdef-projection.bdef` | use draft + use action Edit/Activate/Discard/Resume/Prepare |
| Behavior Impl local types | `.claude/templates/clas/zbp-managed-locals.abap` | lhc_ + lsc_ skeleton |
| SRVD | `.claude/templates/service/srvd-service-definition.srvd` | |
| SRVB U4 (Fiori) | `.claude/templates/service/srvb-binding-u4.json` | |

Thay placeholder (`{{DATA_MODEL}}`, `{{TABLE}}`, `{{BEHAVIOR_CLASS}}`, …) theo design rồi dùng MCP `edit`.

## When to use

User muốn 1 BO transactional có:
- Table riêng (custom Z table) để persist data
- Fiori UI (List Report + Object Page)
- Draft handling (Edit/Activate/Discard/Resume)
- Composition cha-con (header + items)
- Validation/Determination/Side effect business logic
- Sinh dữ liệu xuống standard SAP qua BO interface (`I_SalesOrderTP`, `I_PurchaseOrderTP`...)

Nếu chỉ cần read-only/query → dùng `rap-custom-entity`. Nếu chỉ là custom Web API gọi BO interface không UI → dùng `rap-bo-interface`.

## Object inventory (8 objects tối thiểu cho 2-level BO)

| # | Object | Type | Pattern naming |
|---|--------|------|----------------|
| 1 | Header table | TABL | `Z<5chars>T` (vd `ZV901T`) |
| 1d | Header draft table | TABL | `Z<5chars>T_D` (vd `ZV901T_D`) |
| 2 | Item table | TABL | `Z<5chars>T` (NN+1, vd `ZV902T`) |
| 2d | Item draft table | TABL | `<itemtable>_D` (vd `ZV902T_D`) |
| 3 | Header interface CDS | DDLS | `ZI_<5chars>_01` |
| 4 | Item interface CDS | DDLS | `ZI_<5chars>_02` |
| 5 | Header projection CDS | DDLS | `ZC_<5chars>_01` |
| 6 | Item projection CDS | DDLS | `ZC_<5chars>_02` |
| 7 | Interface BDEF | BDEF | `ZI_<5chars>_01` (= Header CDS name) |
| 8 | Projection BDEF | BDEF | `ZC_<5chars>_01` (= Header projection name) |
| 9 | Behavior Impl | CLAS | `ZBP_I_<5chars>_01` (bỏ Z đầu của ZI) |
| 10 | Header Metadata Extension | DDLX | `ZC_<5chars>_01` |
| 11 | Item Metadata Extension | DDLX | `ZC_<5chars>_02` |
| 12 | Service Definition | SRVD | `ZSD_<5chars>_01` → dùng skill `rap-service` |
| 13 | Service Binding | SRVB | `ZSB_U4_<5chars>_01` → dùng skill `rap-service` |
| (opt) | Helper class | CLAS | `ZCL_<5chars>_01` (parallel logic / EML BO interface calls) |

Local variant → suffix `_VN`.

## Step 1 — Header table (DDIC)

→ Code DDL đầy đủ + bảng admin field types + draft table note: **`references/tables-cds.md`**.

Critical: admin fields BẮT BUỘC (`abp_creation_user`, `abp_creation_tstmpl`, `abp_locinst_lastchange_user`, `abp_lastchange_tstmpl`, `abp_locinst_lastchange_tstmpl`); UUID key `sysuuid_x16`. Draft table `_D` tạo qua ADT — MCP không tự sinh.

## Step 2 — Item table

Cùng pattern Step 1. Key = `attachment_uuid` (parent FK) + `item_uuid` (item PK). → `references/tables-cds.md`.

## Step 3 — Header interface CDS (root view entity)

→ Code đầy đủ: **`references/tables-cds.md` § Step 3**.

Critical:
- `define root view entity` — KHÔNG `define view entity` cho root
- `composition [0..*] of <Child> as _<Name>` cho parent → child
- Mọi admin field PHẢI có `@Semantics.user.*` / `@Semantics.systemDateTime.*` (framework auto-fill)
- `as <Alias>` CamelCase; field tiền/lượng/ngày theo `.claude/rules/cds-field-types.md`

## Step 4 — Item interface CDS

→ `references/tables-cds.md` § Step 4. Critical: `association to parent <Parent> as _Header on ...`.

## Step 5 — Projection CDS (Header + Item)

→ Code đầy đủ: **`references/tables-cds.md` § Step 5**.

Critical:
- `provider contract transactional_query` cho root projection
- `redirected to composition child <Child>` / `redirected to parent <Parent>`
- `@Metadata.allowExtensions: true` để cho phép DDLX

## Step 6 — Interface BDEF (managed, header + item)

→ Code đầy đủ: **`references/bdef.md` § Step 6**.

Critical:
- `managed implementation in class <impl_class> unique;` + `strict ( 2 );` + `with draft;`
- `persistent table` + `draft table` mỗi entity
- Header: `lock master` + `authorization master ( instance, global )`; Item: `lock dependent by _Header` + `authorization dependent by _Header`
- `field ( numbering : managed ) <UuidKey>`; `field ( readonly )` admin+key
- `delete ( precheck );`; draft actions `Edit / Activate optimized / Discard / Resume / Prepare`
- `etag master` + `total etag`; `mapping for <table>` đủ mọi field

## Step 7 — Projection BDEF

→ Code đầy đủ: **`references/bdef.md` § Step 7**. Critical: chỉ `use` (không re-declare), có thể ẩn bớt action/field.

## Step 8 — Behavior Implementation (Local Types)

Class `ZBP_I_VI901_01` do ADT tự sinh skeleton sau khi BDEF activate. Logic thật nằm trong **CCIMP include / Local Types**, KHÔNG ở global class.

→ Handler skeleton, pattern cheatsheet, EML patterns (read/create/update/delete), message API, `%is_draft`, saver class: **`references/behavior-impl.md`**.

> **MCP sap-adt**: read local types qua `get_class_include(system, "<class>", "implementations")`; edit qua `update_class_include(system, "<class>", "implementations", source)` — sap-adt ghi được CCIMP/CCDEF/testclasses. Deploy class: hỏi user confirm MCP vs local snapshot (xem `agent-generate-code.md` + `rap-generate § 2.CLAS`).

## Step 9 — Helper class (optional)

Parallel processing / EML BO interface call phức tạp → helper class riêng (`ZCL_<5chars>_01` inherit `cl_abap_parallel`). → Skeleton: **`references/behavior-impl.md` § Step 9**. EML BO interface: skill `rap-bo-interface`; parallel: skill `rap-parallel-multithread`.

## Step 10 — Metadata Extension (DDLX)

Tách @UI annotations ra DDLX file riêng (cùng tên projection):

```sql
@Metadata.layer: #CONSUMER
@UI.headerInfo: {
  typeName: '...',
  typeNamePlural: '...',
  title: { type: #STANDARD, value: 'FileName' }
}

annotate view ZC_VI901_01 with
{
  @UI.facet: [ ... ]

  @UI.lineItem: [{ position: 10 }]
  @UI.selectionField: [{ position: 10 }]
  FileName;
  ...
}
```

Chi tiết @UI: xem skill `rap-cds`.

## Service exposure

Sau khi BO activate xong → bind service definition + binding qua skill **rap-service**.

## Validation checklist

- [ ] Table có đủ admin fields (`abp_creation_user`, `abp_creation_tstmpl`, `abp_locinst_lastchange_user`, `abp_lastchange_tstmpl`, `abp_locinst_lastchange_tstmpl`)
- [ ] Draft table `_D` đã tạo qua ADT
- [ ] CDS root entity dùng `define root view entity` (không `define view entity`)
- [ ] Composition cha-con đúng cardinality `[0..*]` / `[0..1]`
- [ ] Admin fields có annotation `@Semantics.user.*` / `@Semantics.systemDateTime.*`
- [ ] BDEF header: `lock master` + `authorization master ( instance, global )` + `with draft;` + `strict ( 2 );`
- [ ] BDEF item: `lock dependent by _Header` + `authorization dependent by _Header`
- [ ] `field ( numbering : managed ) <UuidKey>` cho UUID key
- [ ] `mapping for <table>` đầy đủ cho mọi field
- [ ] Projection BDEF chỉ dùng `use`, không re-declare
- [ ] `ZBP_I_*` đúng naming (bỏ Z đầu của ZI)
- [ ] DDLX có `@Metadata.layer: #CONSUMER` + `annotate view`
- [ ] Service definition đã bind (skill rap-service)

## Reference

- Package mẫu: `ZRAP_IF_VI901`
- Files: `ZI_VI901_01/02`, `ZC_VI901_01/02`, `ZV901T/ZV902T` (+ `_D`), `ZI_VI901_01` BDEF, `ZC_VI901_01` BDEF, `ZBP_I_VI901_01`, `ZCL_VI901_01`
- Full code: `references/tables-cds.md`, `references/bdef.md`, `references/behavior-impl.md`
