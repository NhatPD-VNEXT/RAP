# rap-managed-bo — BDEF (full code)

> Chi tiết Step 6–7 của SKILL.md. Reference package **ZRAP_IF_VI901**.

## Step 6 — Interface BDEF (managed, header + item)

```abap
managed implementation in class zbp_i_vi901_01 unique;
strict ( 2 );
with draft;

// ======================================================================
// Header
// ======================================================================
define behavior for ZI_VI901_01 alias Header
persistent table zv901t
draft table zv901t_d
lock master
total etag LastUpdatedAt
authorization master ( instance, global )
etag master LocalLastUpdatedAt
{
  create ( authorization : global );
  update;
  delete ( precheck );

  field ( readonly )
    AttachmentUuid,
    TotalCount, SuccessCount, WarningCount, ErrorCount,
    CreatedBy, CreatedAt, LastUpdatedBy, LastUpdatedAt, LocalLastUpdatedAt;

  field ( numbering : managed ) AttachmentUuid;

  association _Item { create ( features : instance ); with draft; }

  validation vldBeforeSave on save { create; update; }

  draft action Edit;
  draft action Activate optimized;
  draft action Discard;
  draft action Resume;
  draft determine action Prepare { validation vldBeforeSave; }

  side effects {
    field Attachment affects entity _Item, messages, $self;
  }

  determination getDataFile        on modify { field Attachment; }
  determination createSOPODocuments on save  { create; }

  mapping for zv901t {
    AttachmentUuid     = attachment_uuid;
    Attachment         = attachment;
    Mimetype           = mimetype;
    FileName           = file_name;
    TotalCount         = total_count;
    SuccessCount       = success_count;
    WarningCount       = warning_count;
    ErrorCount         = error_count;
    CreatedBy          = created_by;
    CreatedAt          = created_at;
    LastUpdatedBy      = last_updated_by;
    LastUpdatedAt      = last_updated_at;
    LocalLastUpdatedAt = local_last_updated_at;
  }
}

// ======================================================================
// Item
// ======================================================================
define behavior for ZI_VI901_02 alias Item
persistent table zv902t
draft table zv902t_d
lock dependent by _Header
authorization dependent by _Header
{
  update;
  delete;

  field ( readonly ) AttachmentUuid, ItemUuid;
  field ( numbering : managed ) ItemUuid;

  association _Header { with draft; }

  mapping for zv902t {
    AttachmentUUID = attachment_uuid;
    ItemUUID       = item_uuid;
    // ... map all fields
  }
}
```

**Critical**:
- `managed implementation in class <impl_class> unique;` ở dòng đầu
- `strict ( 2 );` BẮT BUỘC
- `with draft;` ở root
- `persistent table` + `draft table` cho mỗi entity
- Header dùng `lock master` + `authorization master ( instance, global )`
- Item dùng `lock dependent by _Header` + `authorization dependent by _Header`
- `field ( numbering : managed ) <UuidKey>` → framework tự sinh UUID
- `field ( readonly )` cho admin fields + key
- `delete ( precheck );` để thêm logic chặn delete trước khi commit
- Draft actions chuẩn: `Edit / Activate optimized / Discard / Resume / Prepare`
- `etag master <field>` + `total etag <field>` cho concurrency control
- `mapping for <table> { CdsField = column; }` cho mọi field

## Step 7 — Projection BDEF

```abap
projection;
strict ( 2 );
use draft;
use side effects;

define behavior for ZC_VI901_01 alias Header
{
  use create;
  use update;
  use delete;

  use action Edit;
  use action Activate;
  use action Discard;
  use action Resume;
  use action Prepare;

  use association _Item { create; with draft; }
}

define behavior for ZC_VI901_02 alias Item
{
  use association _Header { with draft; }
}
```

**Critical**: chỉ `use` (không re-declare). Projection BDEF có thể ẩn bớt action/field nếu cần subset.
