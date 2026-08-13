# rap-comm-outbound — Error handling (exception ladder + JSON parse)

> Reference cho **SKILL.md § Step 8, 9**. Đọc khi generate code xử lý lỗi outbound.

## Step 8 — Exception ladder (BẮT BUỘC)

```abap
TRY.
    " ... outbound calls ...
    lo_batch_request->execute( ).
  CATCH /iwbep/cx_cp_remote INTO DATA(lx_remote).
    " HTTP 4xx/5xx response từ remote — error body có sẵn trong lx_remote->http_error_body
    get_text_error_json(
      EXPORTING io_http_error = lx_remote
      IMPORTING ef_text_error = DATA(ldf_text_error) ).
    IF ldf_text_error IS NOT INITIAL.
      append_error_message( ldf_text_error ).
    ELSE.
      append_error_message( lx_remote->get_text( ) ).
    ENDIF.
  CATCH cx_http_dest_provider_error INTO DATA(lx_dest).
    " Communication Arrangement không tồn tại / inactive / system unreachable
    append_error_message( lx_dest->get_text( ) ).
  CATCH /iwbep/cx_gateway INTO DATA(lx_gw).
    " Gateway-level error (proxy issue, metadata mismatch)
    append_error_message( lx_gw->get_text( ) ).
  CATCH cx_web_http_client_error INTO DATA(lx_http).
    " Lower-level HTTP transport error
    append_error_message( lx_http->get_text( ) ).
  CATCH cx_root INTO DATA(lx_root).
    " Safety net
    append_error_message( lx_root->get_text( ) ).
ENDTRY.
```

**Order**: từ specific → generic. `/iwbep/cx_cp_remote` đầu vì có error body details.

## Step 9 — Parse remote error JSON

SAP standard OData V4 error response format:
```json
{
  "error": {
    "code": "...",
    "message": { "lang": "en", "value": "..." },
    "innererror": {
      "errordetails": [
        { "code": "...", "message": "Friendly text...", "severity": "error", ... }
      ]
    }
  }
}
```

```abap
METHOD get_text_error_json.
  DATA ldt_error_text TYPE gts_response_err.    " Type structure tương ứng với JSON above
  /ui2/cl_json=>deserialize(
    EXPORTING json        = io_http_error->http_error_body
              pretty_name = /ui2/cl_json=>pretty_mode-camel_case
    CHANGING  data        = ldt_error_text ).

  DATA(ldt_error) = ldt_error_text-error-innererror-errordetails.
  READ TABLE ldt_error INTO DATA(lds_error_detail) INDEX 1.
  ef_text_error = lds_error_detail-message.    " Lấy first detail message (user-friendly nhất)
ENDMETHOD.
```

Type definitions xem skill **rap-http-service** § Step 2.
