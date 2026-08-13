# rap-http-service — Log persistence & error handling (Step 7–9)

> Thuộc SKILL.md `rap-http-service` § Step 7 (log via EML), § Step 8 (error message accumulation), § Step 9 (parse outbound OData error JSON).

## Step 7 — Log persistence via EML

Sử dụng managed BDEF cho table log (xem `BDEF ZI_VI902_01` trong VI902):

```abap
METHOD insert_log.
  DATA: lt_failed   TYPE RESPONSE FOR FAILED   zi_vi902_01,
        lt_reported TYPE RESPONSE FOR REPORTED zi_vi902_01.

  MODIFY ENTITIES OF zi_vi902_01
    ENTITY log
    CREATE FIELDS (
      ReceiveDate ReceiveTime OutboundDelivery OutboundDeliveryItem
      Status DocumentCode ReferenceSDDocument Material
      ActualGoodsMovementDate ActualDeliveredQtyInBaseUnit BaseUnit
      MaterialDocument MaterialDocumentYear Message
      CreationTime LastChangeTime LocalCreationTime LocalLastChangeTime )
    AUTO FILL CID WITH gdt_log
    FAILED   lt_failed
    REPORTED lt_reported.

  COMMIT ENTITIES
    RESPONSE OF zi_vi902_01
    FAILED   DATA(lt_commit_failed)
    REPORTED DATA(lt_commit_reported).

  CLEAR gdt_log.
ENDMETHOD.
```

**KHÔNG dùng `MODIFY ddic_table FROM TABLE`** trong HTTP context — dùng EML để giữ RAP commit pattern, tận dụng managed framework xử lý admin fields.

> `COMMIT ENTITIES` (không phải `COMMIT WORK`) — đây là RAP runtime context, không phải job context.

## Step 8 — Error message accumulation pattern

```abap
METHOD append_error_message.
  IF gdf_message_error IS INITIAL.
    gdf_message_error = if_new_message.
  ELSE.
    gdf_message_error = |{ gdf_message_error } / { if_new_message }|.
  ENDIF.
ENDMETHOD.
```

Dùng instance attribute `gdf_message_error` tích lũy nhiều lỗi cross-method, separator `/`.

## Step 9 — Parse outbound OData error response

Khi gọi OData V4 outbound (xem skill **rap-comm-outbound**) bị lỗi, error body là JSON structured:

```json
{
  "error": {
    "code": "...",
    "message": { "lang": "en", "value": "..." },
    "innererror": {
      "errordetails": [
        { "code": "...", "message": "...", "severity": "error", ... }
      ]
    }
  }
}
```

```abap
METHOD get_text_error_json.
  DATA ldt_error_text TYPE gts_response_err.
  /ui2/cl_json=>deserialize(
    EXPORTING json        = io_http_error->http_error_body
              pretty_name = /ui2/cl_json=>pretty_mode-camel_case
    CHANGING  data        = ldt_error_text ).

  DATA(ldt_error) = ldt_error_text-error-innererror-errordetails.
  READ TABLE ldt_error INTO DATA(lds_error_detail) INDEX 1.
  ef_text_error = lds_error_detail-message.
ENDMETHOD.
```

Trả lại user-friendly text thay vì raw error body.
