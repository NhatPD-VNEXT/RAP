---
name: rap-metadata
description: Build Fiori Elements object-page + list-report LAYOUT for a RAP managed BO on ABAP Cloud/BTP via Metadata Extension (DDLX) + projection CDS annotations — especially the FILE-UPLOAD object page (attachment stream). Covers @Semantics.largeObject (mimeType/fileName/acceptableMimeTypes/contentDispositionPreference) on the projection, @Metadata.allowExtensions, and the DDLX facet tree (HEADER FIELDGROUP + COLLECTION sections with nested FIELDGROUP_REFERENCE via parentId, LINEITEM_REFERENCE for child, @UI.facet exclude:true to hand-place the Attachment field, @UI.fieldGroup/@UI.lineItem/@UI.selectionField, i18n '{@i18n>Key}' labels). Use when laying out the upload screen / object page / list columns / filter bar of a file-upload RAP BO. Reference pattern: ZRAP_IF_VI901 (受注データ連携 file upload) on HAX. Trigger on: 'metadata extension layout', 'DDLX object page', 'file upload object page', 'upload screen layout', '@Semantics.largeObject', 'attachment stream', 'acceptableMimeTypes', 'contentDispositionPreference', '@UI.facet', 'FIELDGROUP_REFERENCE', 'COLLECTION facet', 'parentId', 'LINEITEM_REFERENCE', '@UI.fieldGroup', '@UI.selectionField', '@Metadata.allowExtensions', 'headerInfo', 'facet exclude'.
---

# rap-metadata — Fiori object-page / list layout (file-upload BO)

Layout của 1 RAP managed BO = **2 nơi**:
1. **Projection CDS** (`ZC_*`) — khai `@Semantics.largeObject` cho field attachment (stream) + `@Metadata.allowExtensions: true` + value help / filter selectionType.
2. **Metadata Extension DDLX** (`ZC_*`, cùng tên) — `@Metadata.layer: #CORE`, `headerInfo`, cây **facet** (HEADER / COLLECTION / LINEITEM), gán field vào `@UI.fieldGroup` / `@UI.lineItem` / `@UI.selectionField`.

> Tách layout ra DDLX (không nhét `@UI` vào CDS) = Clean Core: sửa layout không phải reactivate CDS/BDEF. Điều kiện: projection có `@Metadata.allowExtensions: true`.

Reference (code tay, đã go-live): **`ZRAP_IF_VI901`** trên HAX — `ZC_VI901_01` (CDS + DDLX), màn upload file lịch sử → object page có section Attachment + section Result + list item.

---

## 1. Projection CDS — attachment stream + allowExtensions

```cds
@EndUserText.label: 'File Upload History Header - Projection'
@AccessControl.authorizationCheck: #NOT_REQUIRED
@Metadata.allowExtensions: true          // ← BẮT BUỘC để DDLX extend được
define root view entity ZC_VI901_01
  provider contract transactional_query
  as projection on ZI_VI901_01
{
  key AttachmentUUID,

      @Semantics.largeObject:            // ← field upload/download (stream)
        { mimeType: 'Mimetype',          //   trỏ element chứa MIME
          fileName: 'FileName',          //   trỏ element chứa tên file
          acceptableMimeTypes: ['text/plain'],        // filter dialog upload (TSV/CSV = text/plain)
          contentDispositionPreference: #ATTACHMENT } // #ATTACHMENT = tải về; #INLINE = mở trong browser
      Attachment,

      Mimetype,
      FileName,
      TotalCount, SuccessCount, WarningCount, ErrorCount,

      @ObjectModel.text.element: [ 'CreatedByDescription' ]                        // hiện tên user thay ID
      @Consumption.valueHelpDefinition: [{ entity: { name: 'I_BusinessUserVH', element: 'UserID'} }]
      CreatedBy,
      @Consumption.filter.selectionType: #INTERVAL                                 // filter bar dạng khoảng
      CreatedAt,

      @UI.hidden: true
      @Consumption.filter.hidden: true
      _UserCreatedBy.UserDescription as CreatedByDescription,                      // text association cho user
      _Item : redirected to composition child ZC_VI901_02
}
```

Gotcha:
- `@Semantics.largeObject` **phải** trỏ `mimeType` + `fileName` là element có thật trong entity → Fiori Elements render **upload control** (nút Browse/Upload + download link) tự động.
- `acceptableMimeTypes`: TSV/CSV upload dùng `'text/plain'` (KHÔNG có `text/tsv` chuẩn). Sai MIME → dialog chặn file.
- `contentDispositionPreference`: `#ATTACHMENT` (tải file) vs `#INLINE` (xem inline, cho PDF/ảnh).
- Field attachment (rawstring) tại table + interface view: xem skill `rap-table` / `rap-cds`.

---

## 2. DDLX — facet tree + upload section

```cds
@Metadata.layer: #CORE
@UI.updateHidden: true                    // ẩn cột "update" tự sinh
@UI: { headerInfo: { typeName:       '{@i18n>UploadHistory}',
                     typeNamePlural: '{@i18n>UploadHistories}' } }
annotate entity ZC_VI901_01 with
{
  @UI.facet: [
    // (a) HEADER — field group hiện ở vùng header object page
    { purpose: #HEADER, type: #FIELDGROUP_REFERENCE, position: 10,
      targetQualifier: 'HeaderGroup' },

    // (b) SECTION Attachment = COLLECTION cha + FIELDGROUP con (parentId)
    { id: 'AttachmentSection', purpose: #STANDARD, type: #COLLECTION,
      label: '{@i18n>AttachmentSection}', position: 10 },
    { purpose: #STANDARD, type: #FIELDGROUP_REFERENCE,
      targetQualifier: 'AttachmentGroup', parentId: 'AttachmentSection', position: 10 },

    // (c) SECTION Result (counts)
    { id: 'ResultSection', purpose: #STANDARD, type: #COLLECTION,
      label: '{@i18n>ResultSection}', position: 20 },
    { purpose: #STANDARD, type: #FIELDGROUP_REFERENCE,
      targetQualifier: 'ResultGroup', parentId: 'ResultSection', position: 20 },

    // (d) child items = bảng
    { purpose: #STANDARD, type: #LINEITEM_REFERENCE,
      label: '{@i18n>UploadItemSection}', targetElement: '_Item', position: 30 }
  ]

  // --- header group ---
  @UI.fieldGroup: [{ qualifier: 'HeaderGroup', position: 20 }]
  @UI.lineItem:   [{ position: 30 }]
  @UI.selectionField: [{ position: 10 }]        // ← filter bar
  FileName;

  @UI.fieldGroup: [{ qualifier: 'HeaderGroup', position: 30 }]
  @UI.lineItem:   [{ position: 80 }]
  @UI.selectionField: [{ position: 20 }]
  CreatedBy;

  // --- attachment section: hand-place field, CHẶN facet auto ---
  @UI.fieldGroup: [{ qualifier: 'AttachmentGroup', position: 10 }]
  @UI.facet: [{ exclude: true }]                // ← KHÔNG cho FE tự sinh facet riêng cho largeObject
  @UI.lineItem: [{ position: 15 }]
  Attachment;

  // --- result section (counts) ---
  @UI.fieldGroup: [{ qualifier: 'ResultGroup', position: 10 }]
  @UI.lineItem:   [{ position: 40 }]
  TotalCount;
  // SuccessCount/WarningCount/ErrorCount: cùng ResultGroup, lineItem 50/60/70
}
```

### Nguyên tắc facet upload
- **`@UI.facet: [{ exclude: true }]` trên field Attachment**: largeObject mặc định FE sinh 1 facet riêng → set `exclude:true` để **tự đặt** field vào `AttachmentGroup` (section mình kiểm soát vị trí). Thiếu dòng này → upload control nhảy chỗ.
- **COLLECTION + parentId**: 1 section = 1 facet `#COLLECTION` (có `id`) + 1 facet `#FIELDGROUP_REFERENCE` con trỏ `parentId = <id section>` và `targetQualifier = <tên fieldGroup>`. Field gán vào group qua `@UI.fieldGroup: [{ qualifier: '<tên>' }]`.
- **`#HEADER` facet**: field group hiện ở header (dưới title), tách khỏi body section.
- **`targetQualifier`** (facet) ↔ **`qualifier`** (@UI.fieldGroup): phải trùng chuỗi.
- **`@UI.selectionField`**: field lên filter bar list report; `@UI.lineItem`: cột bảng list.
- **i18n `'{@i18n>Key}'`**: label lấy từ i18n property file (đa ngôn ngữ) thay literal.
- **headerInfo.title.value**: nếu muốn title object page = 1 field (vd FileName) → mở `title: { type: #STANDARD, value: 'FileName' }`.

---

## 3. Checklist layout upload object page

| Mục | Nơi khai | Chú ý |
|-----|----------|-------|
| Field stream upload | CDS `@Semantics.largeObject` | mimeType+fileName trỏ element thật; acceptableMimeTypes |
| Cho DDLX extend | CDS `@Metadata.allowExtensions: true` | thiếu → DDLX activate fail |
| Header fields | DDLX facet `#HEADER #FIELDGROUP_REFERENCE` + `@UI.fieldGroup` | |
| Section upload | DDLX `#COLLECTION` + `#FIELDGROUP_REFERENCE parentId` | Attachment field `@UI.facet:[{exclude:true}]` |
| Section counts/result | DDLX `#COLLECTION` + fieldGroup | |
| Bảng con | DDLX `#LINEITEM_REFERENCE targetElement:'_Item'` | |
| Filter bar | `@UI.selectionField` | field trên projection |
| Cột list | `@UI.lineItem` | |

> Nút/side-effect/determination (登録, upload→hiện item): thuộc **behavior** — xem `rap-behavior` / `rap-managed-bo`. Skill này chỉ lo **layout**.
