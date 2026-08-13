# rap-managed-bo — Tables & CDS (full code)

> Chi tiết Step 1–5 của SKILL.md. Reference package **ZRAP_IF_VI901**.

## Step 1 — Header table (DDIC)

```sql
@EndUserText.label : '<table label JP>'
@AbapCatalog.enhancement.category : #NOT_EXTENSIBLE
@AbapCatalog.tableCategory : #TRANSPARENT
@AbapCatalog.deliveryClass : #A
@AbapCatalog.dataMaintenance : #RESTRICTED
define table zv901t {
  key client            : abap.clnt not null;
  key attachment_uuid   : sysuuid_x16 not null;

  // business fields
  attachment            : zzattachment;
  mimetype              : zzmimetype;
  file_name             : zzfilename;
  total_count           : abap.int2;
  success_count         : abap.int2;
  warning_count         : abap.int2;
  error_count           : abap.int2;

  // RAP admin fields (BẮT BUỘC cho managed + draft)
  created_by            : abp_creation_user;
  created_at            : abp_creation_tstmpl;
  last_updated_by       : abp_locinst_lastchange_user;
  last_updated_at       : abp_lastchange_tstmpl;
  local_last_updated_at : abp_locinst_lastchange_tstmpl;
}
```

**Admin field types BẮT BUỘC** (RAP framework auto-fill):

| Purpose | DDIC type |
|---------|-----------|
| Created by | `abp_creation_user` |
| Created at | `abp_creation_tstmpl` |
| Last changed by (instance-level) | `abp_locinst_lastchange_user` |
| Last changed at (global) | `abp_lastchange_tstmpl` |
| Last changed at (local instance) | `abp_locinst_lastchange_tstmpl` |
| Last changed by (global) | `abp_lastchange_user` |
| UUID key | `sysuuid_x16` |

**Draft table**: cùng cấu trúc, suffix `_D`. Tạo qua ADT (right-click table → New Draft Table). MCP `create target="TABL"` không sinh draft table tự động.

## Step 2 — Item table

Cùng pattern. Key luôn bao gồm `attachment_uuid` (parent FK) + `item_uuid` (item PK).

## Step 3 — Header interface CDS (root view entity)

```sql
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: '<header label>'
@Metadata.ignorePropagatedAnnotations: true
define root view entity ZI_VI901_01
  as select from zv901t as Header
  composition [0..*] of ZI_VI901_02 as _Item
  association [0..1] to I_User      as _UserCreatedBy on $projection.CreatedBy = _UserCreatedBy.UserID
  association [0..1] to I_User      as _UserUpdatedBy on $projection.LastUpdatedBy = _UserUpdatedBy.UserID
{
  key attachment_uuid           as AttachmentUUID,

      attachment                as Attachment,
      mimetype                  as Mimetype,
      file_name                 as FileName,
      total_count               as TotalCount,
      success_count             as SuccessCount,
      warning_count             as WarningCount,
      error_count               as ErrorCount,

      @Semantics.user.createdBy: true
      created_by                as CreatedBy,
      @Semantics.systemDateTime.createdAt: true
      created_at                as CreatedAt,
      @Semantics.user.localInstanceLastChangedBy: true
      last_updated_by           as LastUpdatedBy,
      @Semantics.systemDateTime.lastChangedAt: true
      last_updated_at           as LastUpdatedAt,
      @Semantics.systemDateTime.localInstanceLastChangedAt: true
      local_last_updated_at     as LocalLastUpdatedAt,

      _Item,
      _UserCreatedBy,
      _UserUpdatedBy
}
```

**Critical**:
- `define root view entity` — KHÔNG dùng `define view entity` cho root
- `composition [0..*] of <Child> as _<Name>` — BẮT BUỘC cho parent → child
- Mọi admin field PHẢI có annotation `@Semantics.user.*` / `@Semantics.systemDateTime.*` đúng — framework dùng để auto-fill
- `as <Alias>` field name viết CamelCase
- Field tiền/lượng/ngày: theo `.claude/rules/cds-field-types.md`

## Step 4 — Item interface CDS

```sql
@AccessControl.authorizationCheck: #NOT_REQUIRED
@EndUserText.label: '<item label>'
@Metadata.ignorePropagatedAnnotations: true
define view entity ZI_VI901_02
  as select from zv902t as Item
  association to parent ZI_VI901_01 as _Header on $projection.AttachmentUUID = _Header.AttachmentUUID
{
  key attachment_uuid           as AttachmentUUID,
  key item_uuid                 as ItemUUID,

      // business fields...
      sd_doc_no                 as SdDocNo,
      criticality_sd            as CriticalitySd,
      ...

      _Header
}
```

**Critical**: `association to parent <Parent> as _Header on ...` BẮT BUỘC cho child → parent.

## Step 5 — Projection CDS (Header + Item)

Header projection:

```sql
@EndUserText.label: '<projection label>'
@AccessControl.authorizationCheck: #NOT_REQUIRED
@Metadata.allowExtensions: true
define root view entity ZC_VI901_01
  provider contract transactional_query
  as projection on ZI_VI901_01
{
  key AttachmentUUID,
      @Semantics.largeObject: {
            mimeType: 'Mimetype',
            fileName: 'FileName',
            acceptableMimeTypes : ['text/plain'],
            contentDispositionPreference: #ATTACHMENT
          }
      Attachment,
      Mimetype,
      FileName,
      TotalCount, SuccessCount, WarningCount, ErrorCount,

      @ObjectModel.text.element: [ 'CreatedByDescription' ]
      @Consumption.valueHelpDefinition: [{ entity: { name: 'I_BusinessUserVH', element: 'UserID'} }]
      CreatedBy,
      @Consumption.filter.selectionType: #INTERVAL
      CreatedAt,
      LastUpdatedBy, LastUpdatedAt, LocalLastUpdatedAt,

      @UI.hidden: true
      _UserCreatedBy.UserDescription as CreatedByDescription,
      @UI.hidden: true
      _UserUpdatedBy.UserDescription as LastUpdatedByDescription,

      _Item : redirected to composition child ZC_VI901_02
}
```

Item projection:

```sql
@EndUserText.label: '<item projection label>'
@AccessControl.authorizationCheck: #NOT_REQUIRED
@Metadata.allowExtensions: true
@ObjectModel.semanticKey: ['AttachmentUUID', 'ItemUUID']
define view entity ZC_VI901_02
  as projection on ZI_VI901_02
{
  @EndUserText.label: 'ファイル添付UUID'
  key AttachmentUUID,
  @EndUserText.label: '明細UUID'
  key ItemUUID,

      // business fields with @EndUserText.label per field
      SdDocNo, SdItemNo, CustomerCode, ...,

      _Header : redirected to parent ZC_VI901_01
}
```

**Critical**:
- `provider contract transactional_query` cho root projection
- `redirected to composition child <Child>` cho parent → child
- `redirected to parent <Parent>` cho child → parent
- `@Metadata.allowExtensions: true` để cho phép DDLX (Metadata Extension)
